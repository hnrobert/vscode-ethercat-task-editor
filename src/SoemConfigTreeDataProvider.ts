import * as vscode from 'vscode';
import * as path from 'path';
import { parseYamlDocumentWithTags } from './YamlParser';
import { parseMsgFolder, MsgField } from './msgParser';
import * as yaml from 'yaml';
import { TASK_TYPES } from './constants';

type PathEntry = string | number;

type SoemData = {
  doc?: yaml.Document;
  data?: unknown;
  isValid: boolean;
  isSoem: boolean;
  error?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (isObject(value)) return '{...}';
  return String(value);
}

export class SoemConfigTreeItem extends vscode.TreeItem {
  public readonly path?: PathEntry[];
  public readonly rawValue?: unknown;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    command?: vscode.Command,
    tooltip?: string,
    path?: PathEntry[],
    rawValue?: unknown,
    contextValue?: string,
    icon?: vscode.ThemeIcon,
  ) {
    super(label, collapsibleState);
    if (command) this.command = command;
    if (tooltip) this.tooltip = tooltip;
    if (contextValue) this.contextValue = contextValue;
    if (icon) this.iconPath = icon;
    this.path = path;
    this.rawValue = rawValue;
  }
}

export class SoemConfigTreeDataProvider implements vscode.TreeDataProvider<SoemConfigTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    SoemConfigTreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly msgFolderPath: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.msgFolderPath = path.join(context.extensionPath, 'assets', 'msg');

    vscode.window.onDidChangeActiveTextEditor(
      () => this.refresh(),
      null,
      context.subscriptions,
    );
    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (
          vscode.window.activeTextEditor?.document.uri.toString() ===
          event.document.uri.toString()
        ) {
          this.refresh();
        }
      },
      null,
      context.subscriptions,
    );
    vscode.workspace.onDidSaveTextDocument(
      (document) => {
        if (
          vscode.window.activeTextEditor?.document.uri.toString() ===
          document.uri.toString()
        ) {
          this.refresh();
        }
      },
      null,
      context.subscriptions,
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SoemConfigTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SoemConfigTreeItem): SoemConfigTreeItem[] {
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (!activeDoc) {
      if (!element) {
        return [
          new SoemConfigTreeItem(
            'No active editor',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'Open a YAML file to edit SOEM configuration',
            undefined,
            undefined,
            'status',
          ),
        ];
      }
      return [];
    }

    const isYamlFile =
      activeDoc.fileName.endsWith('.yaml') ||
      activeDoc.fileName.endsWith('.yml');
    const yamlDoc = isYamlFile ? this.parseActiveDocument(activeDoc) : null;

    if (!element) {
      if (!isYamlFile) {
        return [
          new SoemConfigTreeItem(
            'Active file is not a YAML document',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'Open a .yaml or .yml file to use the SOEM editor',
            undefined,
            undefined,
            'status',
          ),
        ];
      }

      const children: SoemConfigTreeItem[] = [];
      if (!yamlDoc) {
        children.push(
          new SoemConfigTreeItem(
            'Unable to parse YAML',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'There was an error reading the document',
            undefined,
            undefined,
            'status',
          ),
        );
        return children;
      }

      const statusMessage = yamlDoc.isValid
        ? yamlDoc.isSoem
          ? 'SOEM format detected and ready to edit'
          : 'YAML is valid but not recognized as SOEM format'
        : 'YAML parse failed';
      children.push(
        new SoemConfigTreeItem(
          statusMessage,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          yamlDoc.error,
          undefined,
          undefined,
          'status',
        ),
      );

      if (yamlDoc.isValid && yamlDoc.isSoem) {
        children.push(
          new SoemConfigTreeItem(
            'Slaves',
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            'Expand to edit slave/task values',
            undefined,
            undefined,
            'slavesGroup',
            new vscode.ThemeIcon('group-by-ref-type'),
          ),
        );
      }
      return children;
    }

    if (element.contextValue === 'slavesGroup') {
      return this.buildSlaveItems(yamlDoc?.data);
    }

    if (element.contextValue === 'slave') {
      return this.buildTaskItems(element.path!, yamlDoc?.data);
    }

    if (element.contextValue === 'task') {
      return this.buildPropertyItems(element.path!, yamlDoc?.data);
    }

    return [];
  }

  async editItem(item: SoemConfigTreeItem): Promise<void> {
    if (!item.path || item.rawValue === undefined) {
      return;
    }
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (!activeDoc) {
      return;
    }
    const currentValue = item.rawValue;
    let newValueText: string | undefined;

    if (item.label && item.label.toString().includes('sdowrite_task_type')) {
      const selected = await vscode.window.showQuickPick(TASK_TYPES, {
        placeHolder: 'Select Task Type',
      });
      if (selected) newValueText = selected.value;
    } else if (typeof currentValue === 'boolean') {
      newValueText = await vscode.window.showQuickPick(['true', 'false'], {
        placeHolder: `Edit ${item.label}`,
      });
    } else {
      newValueText = await vscode.window.showInputBox({
        prompt: `Edit ${item.label}`,
        value: String(currentValue),
      });
    }

    if (newValueText === undefined) {
      return;
    }

    const parsedValue = this.parseInputValue(newValueText, currentValue);
    const yamlDoc = this.parseActiveDocument(activeDoc);
    if (!yamlDoc || !yamlDoc.doc || !yamlDoc.data) {
      return;
    }

    yamlDoc.doc.setIn(item.path, parsedValue);
    const targetNode = yamlDoc.doc.getIn(item.path, true);
    if (
      yaml.isScalar(targetNode) &&
      typeof parsedValue === 'number' &&
      String(newValueText).toLowerCase().startsWith('0x')
    ) {
      targetNode.format = 'HEX';
    }

    // Keep data in sync for calculateOffsets walking
    this.setValueAtPath(yamlDoc.data, item.path, parsedValue);

    this.calculateOffsets(
      yamlDoc.doc,
      yamlDoc.data,
      parseMsgFolder(this.msgFolderPath),
    );
    await this.writeDocument(activeDoc, yamlDoc.doc);
    this.refresh();
  }

  private parseActiveDocument(document: vscode.TextDocument): SoemData {
    try {
      const doc = parseYamlDocumentWithTags(document.getText());
      const data = doc.toJSON();
      const isSoem = this.isSoemFormat(data);
      return { doc, data, isValid: true, isSoem };
    } catch (error) {
      return { isValid: false, isSoem: false, error: String(error) };
    }
  }

  private isSoemFormat(data: unknown): boolean {
    if (!isObject(data) || !Array.isArray(data.slaves)) {
      return false;
    }
    return data.slaves.every((slave) => {
      if (!isObject(slave)) {
        return false;
      }
      const slaveKey = Object.keys(slave)[0];
      const slaveValues = slave[slaveKey];
      return isObject(slaveValues) && Array.isArray((slaveValues as any).tasks);
    });
  }

  private buildSlaveItems(data: unknown): SoemConfigTreeItem[] {
    if (!isObject(data) || !Array.isArray(data.slaves)) {
      return [];
    }
    return data.slaves.map((slave, index) => {
      if (!isObject(slave)) {
        return new SoemConfigTreeItem(
          `Slave ${index} (invalid)`,
          vscode.TreeItemCollapsibleState.None,
        );
      }
      const slaveKey = Object.keys(slave)[0];
      const slaveValues = slave[slaveKey];
      const label = `Slave ${slaveKey}`;
      return new SoemConfigTreeItem(
        label,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        'Expand to edit task entries',
        ['slaves', index, slaveKey],
        slaveValues,
        'slave',
      );
    });
  }

  private buildTaskItems(
    path: PathEntry[],
    data: unknown,
  ): SoemConfigTreeItem[] {
    const slaveNode = this.getValueByPath(data, path);
    if (!isObject(slaveNode) || !Array.isArray((slaveNode as any).tasks)) {
      return [];
    }
    const tasks = (slaveNode as any).tasks as unknown[];
    return tasks.map((task, index) => {
      if (!isObject(task)) {
        return new SoemConfigTreeItem(
          `Task ${index} (invalid)`,
          vscode.TreeItemCollapsibleState.None,
        );
      }
      const taskKey = Object.keys(task)[0];
      const taskValues = task[taskKey];
      const label = `Task ${taskKey}`;
      return new SoemConfigTreeItem(
        label,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        'Expand to edit task properties',
        [...path, 'tasks', index, taskKey],
        taskValues,
        'task',
      );
    });
  }

  private buildPropertyItems(
    path: PathEntry[],
    data: unknown,
  ): SoemConfigTreeItem[] {
    const taskNode = this.getValueByPath(data, path);
    if (!isObject(taskNode)) {
      return [];
    }
    return Object.entries(taskNode)
      .filter(([key]) => key !== 'pdoread_offset' && key !== 'pdowrite_offset')
      .map(([key, value]) => {
        const label = `${key}: ${formatValue(value)}`;
        const valuePath = [...path, key];
        const command: vscode.Command = {
          title: 'Edit value',
          command: 'ethercatTaskEditor.editValue',
          arguments: [
            new SoemConfigTreeItem(
              label,
              vscode.TreeItemCollapsibleState.None,
              undefined,
              `Edit ${key}`,
              valuePath,
              value,
              'property',
            ),
          ],
        };
        return new SoemConfigTreeItem(
          label,
          vscode.TreeItemCollapsibleState.None,
          command,
          String(value),
          valuePath,
          value,
          'property',
        );
      });
  }

  private getValueByPath(data: unknown, path: PathEntry[]): unknown {
    let current = data;
    for (const segment of path) {
      if (Array.isArray(current) && typeof segment === 'number') {
        current = current[segment];
      } else if (isObject(current) && typeof segment === 'string') {
        current = current[segment];
      } else {
        return undefined;
      }
      if (current === undefined) {
        return undefined;
      }
    }
    return current;
  }

  private setValueAtPath(
    data: unknown,
    path: PathEntry[],
    value: unknown,
  ): void {
    let current: any = data;
    for (let index = 0; index < path.length - 1; index += 1) {
      const segment = path[index];
      if (Array.isArray(current) && typeof segment === 'number') {
        current = current[segment];
      } else if (isObject(current) && typeof segment === 'string') {
        current = current[segment];
      } else {
        return;
      }
    }
    const lastSegment = path[path.length - 1];
    if (Array.isArray(current) && typeof lastSegment === 'number') {
      current[lastSegment] = value;
    } else if (isObject(current) && typeof lastSegment === 'string') {
      current[lastSegment] = value;
    }
  }

  private parseInputValue(input: string, originalValue: unknown): unknown {
    if (typeof originalValue === 'number') {
      const parsed = Number(input);
      return Number.isNaN(parsed) ? originalValue : parsed;
    }
    if (typeof originalValue === 'boolean') {
      return input === 'true';
    }
    return input;
  }

  private calculateOffsets(
    doc: yaml.Document,
    data: unknown,
    _msgs: Record<string, MsgField[]>,
  ): void {
    if (!isObject(data) || !Array.isArray(data.slaves)) {
      return;
    }
    data.slaves.forEach((slave, index: number) => {
      if (!isObject(slave)) return;
      const slaveKey = Object.keys(slave)[0];
      const slaveValues = slave[slaveKey];
      if (
        !isObject(slaveValues) ||
        !Array.isArray((slaveValues as any).tasks)
      ) {
        return;
      }

      let pdoread_offset = 0;
      let pdowrite_offset = 0;

      (slaveValues as any).tasks.forEach((task: unknown, taskIndex: number) => {
        if (!isObject(task)) return;
        const taskKey = Object.keys(task)[0];
        const taskValues = task[taskKey] as Record<string, any>;
        if (!isObject(taskValues)) return;

        const pathBase = [
          'slaves',
          index,
          slaveKey,
          'tasks',
          taskIndex,
          taskKey,
        ];

        if (taskValues.pdoread_offset !== undefined) {
          taskValues.pdoread_offset = pdoread_offset;
          doc.setIn([...pathBase, 'pdoread_offset'], pdoread_offset);
        }
        if (taskValues.pdowrite_offset !== undefined) {
          taskValues.pdowrite_offset = pdowrite_offset;
          doc.setIn([...pathBase, 'pdowrite_offset'], pdowrite_offset);
        }

        const type = Number(taskValues.sdowrite_task_type);

        switch (type) {
          case 1:
            pdoread_offset += 19;
            break;
          case 2: {
            const cType = Number(taskValues.sdowrite_control_type) || 0;
            pdoread_offset += cType !== 8 ? 8 : 32;
            switch (cType) {
              case 1:
              case 2:
                pdowrite_offset += 3;
                break;
              case 3:
                pdowrite_offset += 7;
                break;
              case 4:
                pdowrite_offset += 5;
                break;
              case 5:
                pdowrite_offset += 7;
                break;
              case 6:
                pdowrite_offset += 6;
                break;
              case 7:
                pdowrite_offset += 8;
                break;
              case 8:
                pdowrite_offset += 8;
                break;
            }
            break;
          }
          case 3:
            pdoread_offset += 21; // 8 + 8 + 5
            break;
          case 4:
            pdowrite_offset += 8;
            break;
          case 5:
            // Custom check for dji motor task array elements (up to 4 motors)
            for (let i = 1; i <= 4; i++) {
              const motorCanId = taskValues[`sdowrite_motor${i}_can_id`];
              if (motorCanId !== undefined && Number(motorCanId) !== 0) {
                pdoread_offset += 9;
                pdowrite_offset += 3;
              }
            }
            break;
          case 6:
            pdowrite_offset += 8;
            break;
          case 7:
            // External PWM
            const channelStr: any = taskValues.sdowrite_channel_num;
            if (channelStr !== undefined) {
              pdowrite_offset += Number(channelStr) * 2;
            }
            break;
          case 8:
          case 9:
            pdoread_offset += 8;
            break;
          case 10:
            pdoread_offset += 6;
            break;
          case 11:
            pdoread_offset += 24;
            break;
          case 12: {
            pdoread_offset += 9;
            const dmCtrlType = Number(taskValues.sdowrite_control_type) || 0;
            if (dmCtrlType === 1 || dmCtrlType === 2) {
              pdowrite_offset += 9;
            } else if (dmCtrlType === 3) {
              pdowrite_offset += 5;
            }
            break;
          }
          case 13:
            pdoread_offset += 7;
            pdowrite_offset += 4;
            break;
          case 14:
            pdoread_offset += 17;
            break;
        }
      });
    });
  }

  private async writeDocument(
    document: vscode.TextDocument,
    doc: yaml.Document,
  ): Promise<void> {
    const yamlText = String(doc);
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length),
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange, yamlText);
    await vscode.workspace.applyEdit(edit);
    await document.save();
  }
}
