import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'yaml';
import { parseYamlDocumentWithTags } from './utils/YamlParser';
import { parseMsgFolder } from './utils/msgParser';
import { TASK_TYPES } from './constants';
import {
  type PathEntry,
  isObject,
  formatValue,
  isSoemFormat,
  getValueByPath,
  setValueAtPath,
  writeDocument,
} from './utils/yamlUtils';
import { calculateOffsets } from './utils/offsetCalculator';

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
    icon?: vscode.ThemeIcon | vscode.Uri,
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

type SoemData = {
  doc?: yaml.Document;
  data?: unknown;
  isValid: boolean;
  isSoem: boolean;
  error?: string;
};

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
            vscode.Uri.file(
              path.join(
                this.context.extensionPath,
                'assets',
                'images',
                'icon-stroke.svg',
              ),
            ),
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

    setValueAtPath(yamlDoc.data, item.path, parsedValue);

    calculateOffsets(
      yamlDoc.doc,
      yamlDoc.data,
      parseMsgFolder(this.msgFolderPath),
    );
    await writeDocument(activeDoc, yamlDoc.doc);
    this.refresh();
  }

  private parseActiveDocument(document: vscode.TextDocument): SoemData {
    try {
      const doc = parseYamlDocumentWithTags(document.getText());
      const data = doc.toJSON();
      const isSoem = isSoemFormat(data);
      return { doc, data, isValid: true, isSoem };
    } catch (error) {
      return { isValid: false, isSoem: false, error: String(error) };
    }
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
    const slaveNode = getValueByPath(data, path);
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
    const taskNode = getValueByPath(data, path);
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
}
