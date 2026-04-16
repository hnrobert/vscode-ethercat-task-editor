import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  parseYamlDocumentWithTags,
  stringifyYamlDocumentWithTags,
} from './YamlParser';
import { getTaskTemplateYaml } from './taskTemplates';
import { parseMsgFolder, MsgField } from './msgParser';
import { TASK_TYPES } from './constants';

export class SoemConfigWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ethercatTaskEditor.sidebar';
  private _view?: vscode.WebviewView;
  private readonly msgFolderPath: string;
  private lastParsedDoc?: { doc: yaml.Document; data: any; isValid: boolean };

  // Runtime memory: slaveName -> taskName -> taskTypeValue -> { prop: value }
  private taskTypeMemory = new Map<
    string,
    Map<string, Map<number, Record<string, any>>>
  >();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.msgFolderPath = path.join(context.extensionPath, 'assets', 'msg');

    // Persistent event listeners — survive across webview resolve/dispose cycles
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.updateWebview()),
    );
    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.updateWebview()),
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          this.updateWebview();
        }
      }),
    );
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(() => this.updateWebview()),
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'refresh':
          this.updateWebview();
          break;
        case 'updateValue':
          await this.updateYamlValue(data.path, data.value);
          break;
        case 'addSlave':
          await this.addSlave();
          break;
        case 'removeSlave':
          await this.removeSlave(data.sIndex);
          break;
        case 'renameSlave':
          await this.renameSlave(data.sIndex, data.newName);
          break;
        case 'addTask':
          await this.addTask(data.sIndex);
          break;
        case 'removeTask':
          await this.removeTask(data.sIndex, data.tIndex);
          break;
        case 'renameTask':
          await this.renameTask(data.sIndex, data.tIndex, data.newName);
          break;
      }
    });

    // Update when panel visibility changes (open/close sidebar)
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.updateWebview();
      }
    });

    this.updateWebview();
  }

  public refresh() {
    this.updateWebview();
  }

  private updateWebview() {
    if (!this._view || !this._view.visible) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (
      !editor ||
      (!editor.document.fileName.endsWith('.yaml') &&
        !editor.document.fileName.endsWith('.yml'))
    ) {
      this._view.webview.postMessage({
        type: 'setError',
        message: 'No active YAML document.',
      });
      return;
    }

    try {
      const text = editor.document.getText();
      const doc = parseYamlDocumentWithTags(text);
      const data = doc.toJSON();
      this.lastParsedDoc = { doc, data, isValid: true };

      const msgSizes = parseMsgFolder(this.msgFolderPath);

      this._view.webview.postMessage({
        type: 'updateData',
        data: data,
        taskTypes: TASK_TYPES,
      });
    } catch (e) {
      this._view.webview.postMessage({
        type: 'setError',
        message: 'Invalid YAML format: ' + e,
      });
    }
  }

  // --- Task type memory helpers ---

  private saveTaskTypeState(
    slaveName: string,
    taskName: string,
    taskType: number,
    values: Record<string, any>,
  ) {
    let slaveMap = this.taskTypeMemory.get(slaveName);
    if (!slaveMap) {
      slaveMap = new Map();
      this.taskTypeMemory.set(slaveName, slaveMap);
    }
    let taskMap = slaveMap.get(taskName);
    if (!taskMap) {
      taskMap = new Map();
      slaveMap.set(taskName, taskMap);
    }
    taskMap.set(taskType, { ...values });
  }

  private getSavedTaskTypeState(
    slaveName: string,
    taskName: string,
    taskType: number,
  ): Record<string, any> | null {
    return (
      this.taskTypeMemory.get(slaveName)?.get(taskName)?.get(taskType) ?? null
    );
  }

  private migrateSlaveMemory(oldName: string, newName: string) {
    const mem = this.taskTypeMemory.get(oldName);
    if (mem) {
      this.taskTypeMemory.delete(oldName);
      this.taskTypeMemory.set(newName, mem);
    }
  }

  private migrateTaskMemory(
    slaveName: string,
    oldTaskName: string,
    newTaskName: string,
  ) {
    const slaveMem = this.taskTypeMemory.get(slaveName);
    if (slaveMem?.has(oldTaskName)) {
      const taskMem = slaveMem.get(oldTaskName)!;
      slaveMem.delete(oldTaskName);
      slaveMem.set(newTaskName, taskMem);
    }
  }

  // --- YAML value update ---

  private async updateYamlValue(
    propertyPath: (string | number)[],
    value: any,
  ) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const doc = this.lastParsedDoc.doc;

    let finalValue = value;
    let isHex = false;

    // Check if the frontend sent a string that looks like a hex number
    if (typeof value === 'string' && value.toLowerCase().startsWith('0x')) {
      const parsedHex = parseInt(value, 16);
      if (!isNaN(parsedHex)) {
        finalValue = parsedHex;
        isHex = true;
      }
    }

    // --- Task type memory: snapshot current state BEFORE applying change ---
    const isTaskTypeChange =
      propertyPath.length > 0 &&
      propertyPath[propertyPath.length - 1] === 'sdowrite_task_type';

    let savedTaskTypeValues: Record<string, any> | null = null;

    if (isTaskTypeChange) {
      const sKey = propertyPath[2] as string;
      const tKey = propertyPath[5] as string;
      const sIndex = propertyPath[1] as number;
      const tIndex = propertyPath[4] as number;

      const taskData =
        this.lastParsedDoc.data?.slaves?.[sIndex]?.[sKey]?.tasks?.[tIndex]?.[
          tKey
        ];
      if (taskData) {
        const oldType = Number(taskData.sdowrite_task_type);

        // Save current values for old type (exclude computed offsets)
        const valuesToSave: Record<string, any> = {};
        for (const [key, val] of Object.entries(taskData)) {
          if (key !== 'pdoread_offset' && key !== 'pdowrite_offset') {
            valuesToSave[key] = val;
          }
        }
        this.saveTaskTypeState(sKey, tKey, oldType, valuesToSave);

        // Get saved values for new type
        savedTaskTypeValues = this.getSavedTaskTypeState(
          sKey,
          tKey,
          Number(finalValue),
        );
      }
    }

    // Apply new value
    doc.setIn(propertyPath, finalValue);

    // Attempt automatic formatting for HEX values starting with 0x
    const targetNode = doc.getIn(propertyPath, true);
    if (yaml.isScalar(targetNode)) {
      if (isHex) {
        targetNode.format = 'HEX';
        (targetNode as any)._originalSource =
          typeof value === 'string' ? value : undefined;
        targetNode.toJSON = function () {
          if (
            (this as any)._originalSource &&
            Number((this as any)._originalSource) === this.value
          ) {
            return (this as any)._originalSource;
          }
          return '0x' + (this as any).value.toString(16);
        };
      } else if (typeof finalValue === 'number') {
        targetNode.format = 'PLAIN';
        (targetNode as any).toJSON = undefined;
        (targetNode as any)._originalSource = undefined;
      }
    }

    // Special behavior if task type was updated: regenerate default fields for the new task type
    if (isTaskTypeChange) {
      const taskPath = propertyPath.slice(0, propertyPath.length - 1);
      const targetTaskNode = doc.getIn(taskPath, true);
      if (yaml.isMap(targetTaskNode)) {
        const templateYaml = getTaskTemplateYaml(Number(finalValue));
        const parsedTemplateDoc = parseYamlDocumentWithTags(
          'temp:\n' +
            templateYaml
              .split('\n')
              .filter((l) => l.trim())
              .map((l) => '  ' + l)
              .join('\n'),
        );
        const newParams = parsedTemplateDoc.getIn(['temp'], true);

        const keysToRemove: any[] = [];
        for (let i = 0; i < targetTaskNode.items.length; i++) {
          const item = targetTaskNode.items[i];
          if (!yaml.isScalar(item.key)) continue;
          const keyStr = String(item.key.value);

          if (
            (keyStr.startsWith('sdowrite_') || keyStr.startsWith('conf_')) &&
            keyStr !== 'sdowrite_task_type' &&
            keyStr !== 'conf_connection_lost_read_action' &&
            keyStr !== 'sdowrite_connection_lost_write_action' &&
            !keyStr.includes('_topic') &&
            !keyStr.includes('offset')
          ) {
            keysToRemove.push(item.key);
          }
        }

        keysToRemove.forEach((k) => targetTaskNode.delete(k));

        if (yaml.isMap(newParams)) {
          for (const item of newParams.items) {
            // Override template default with saved value if available
            if (savedTaskTypeValues && yaml.isScalar(item.key)) {
              const keyStr = String(item.key.value);
              if (
                keyStr in savedTaskTypeValues &&
                yaml.isScalar(item.value)
              ) {
                item.value.value = savedTaskTypeValues[keyStr];
              }
            }
            targetTaskNode.items.push(item);
          }
        }
      }
    }

    await this.applyAndSaveYaml(editor, doc);
  }

  // --- Slave / Task CRUD (with VSCode native dialogs) ---

  private async addSlave() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const snName = await vscode.window.showInputBox({
      prompt: 'Enter new slave name (e.g., sn1234567)',
      value: 'sn0000000',
    });
    if (!snName) return;

    const doc = this.lastParsedDoc.doc;

    let slavesList = doc.getIn(['slaves']);
    if (!slavesList) {
      doc.setIn(['slaves'], []);
      slavesList = doc.getIn(['slaves']);
    }

    if (yaml.isSeq(slavesList)) {
      const newSlaveStr = `${snName}:
  sdo_len: !uint16_t 0
  task_count: !uint8_t 0
  latency_pub_topic: !std::string '/ecat/${snName.replace('+', '')}/latency'
  tasks: []
`;
      const newSlaveNode = parseYamlDocumentWithTags(newSlaveStr).contents;
      if (newSlaveNode) slavesList.items.push(newSlaveNode as any);
      await this.applyAndSaveYaml(editor, doc);
    }
  }

  private async removeSlave(sIndex: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const result = await vscode.window.showWarningMessage(
      'Remove this entire slave?',
      { modal: true },
      'Remove',
    );
    if (result !== 'Remove') return;

    const doc = this.lastParsedDoc.doc;
    const slavesList = doc.getIn(['slaves']);
    if (yaml.isSeq(slavesList)) {
      slavesList.items.splice(sIndex, 1);
      await this.applyAndSaveYaml(editor, doc);
    }
  }

  private async renameSlave(sIndex: number, newName: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const keyNode = slaveItem.items[0].key;
    if (!yaml.isScalar(keyNode)) return;
    const currentName = String(keyNode.value);
    if (newName === currentName) return;

    this.migrateSlaveMemory(currentName, newName);

    keyNode.value = newName;
    const latencyTopic = doc.getIn([
      'slaves',
      sIndex,
      newName,
      'latency_pub_topic',
    ]);
    if (
      typeof latencyTopic === 'string' &&
      latencyTopic.includes('/ecat/')
    ) {
      doc.setIn(
        ['slaves', sIndex, newName, 'latency_pub_topic'],
        `/ecat/${newName}/latency`,
      );
    }
    await this.applyAndSaveYaml(editor, doc);
  }

  private async addTask(sIndex: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key)
        ? slaveItem.items[0].key.value
        : '',
    );

    const taskName = await vscode.window.showInputBox({
      prompt: 'Enter new task name (e.g., app_1)',
      value: 'app_x',
    });
    if (!taskName) return;

    let tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);
    if (!tasksList) {
      doc.setIn(['slaves', sIndex, snKey, 'tasks'], []);
      tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);
    }

    if (yaml.isSeq(tasksList)) {
      const newTaskStr = `${taskName}:
  sdowrite_task_type: !uint8_t 1
  conf_connection_lost_read_action: !uint8_t 1
  sdowrite_connection_lost_write_action: !uint8_t 2
  pub_topic: !std::string '/ecat/${snKey}/${taskName}/read'
  pdoread_offset: !uint16_t 0
  sub_topic: !std::string '/ecat/${snKey}/${taskName}/write'
  pdowrite_offset: !uint16_t 0
`;
      const newTaskNode = parseYamlDocumentWithTags(newTaskStr).contents;
      if (newTaskNode) {
        tasksList.items.push(newTaskNode as any);
        doc.setIn(
          ['slaves', sIndex, snKey, 'task_count'],
          tasksList.items.length,
        );
        await this.applyAndSaveYaml(editor, doc);
      }
    }
  }

  private async removeTask(sIndex: number, tIndex: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const result = await vscode.window.showWarningMessage(
      'Remove this task?',
      { modal: true },
      'Remove',
    );
    if (result !== 'Remove') return;

    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key)
        ? slaveItem.items[0].key.value
        : '',
    );
    const tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);

    if (yaml.isSeq(tasksList)) {
      tasksList.items.splice(tIndex, 1);
      doc.setIn(
        ['slaves', sIndex, snKey, 'task_count'],
        tasksList.items.length,
      );
      await this.applyAndSaveYaml(editor, doc);
    }
  }

  private async renameTask(sIndex: number, tIndex: number, newName: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key)
        ? slaveItem.items[0].key.value
        : '',
    );

    const taskItem = doc.getIn(['slaves', sIndex, snKey, 'tasks', tIndex]);
    if (!yaml.isMap(taskItem) || taskItem.items.length === 0) return;
    const taskKeyNode = taskItem.items[0].key;
    if (!yaml.isScalar(taskKeyNode)) return;
    const currentName = String(taskKeyNode.value);
    if (newName === currentName) return;

    this.migrateTaskMemory(snKey, currentName, newName);

    taskKeyNode.value = newName;
    doc.setIn(
      ['slaves', sIndex, snKey, 'tasks', tIndex, newName, 'pub_topic'],
      `/ecat/${snKey}/${newName}/read`,
    );
    doc.setIn(
      ['slaves', sIndex, snKey, 'tasks', tIndex, newName, 'sub_topic'],
      `/ecat/${snKey}/${newName}/write`,
    );
    await this.applyAndSaveYaml(editor, doc);
  }

  // --- YAML save helpers ---

  private async applyAndSaveYaml(
    editor: vscode.TextEditor,
    doc: yaml.Document,
  ) {
    this.calculateOffsets(
      doc,
      doc.toJSON(),
      parseMsgFolder(this.msgFolderPath),
    );

    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length),
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      editor.document.uri,
      fullRange,
      stringifyYamlDocumentWithTags(doc),
    );
    await vscode.workspace.applyEdit(edit);
    await editor.document.save();

    this.updateWebview();
  }

  private calculateOffsets(
    doc: yaml.Document,
    data: any,
    _msgs: Record<string, MsgField[]>,
  ): void {
    if (!data || typeof data !== 'object' || !Array.isArray(data.slaves))
      return;

    data.slaves.forEach((slave: any, index: number) => {
      if (!slave || typeof slave !== 'object') return;
      const slaveKey = Object.keys(slave)[0];
      const slaveValues = slave[slaveKey];
      if (
        !slaveValues ||
        typeof slaveValues !== 'object' ||
        !Array.isArray(slaveValues.tasks)
      )
        return;

      let pdoread_offset = 0;
      let pdowrite_offset = 0;

      slaveValues.tasks.forEach((task: any, taskIndex: number) => {
        if (!task || typeof task !== 'object') return;
        const taskKey = Object.keys(task)[0];
        const taskValues = task[taskKey] as Record<string, any>;
        if (!taskValues || typeof taskValues !== 'object') return;

        const pathBase = [
          'slaves',
          index,
          slaveKey,
          'tasks',
          taskIndex,
          taskKey,
        ];

        if (taskValues.pdoread_offset !== undefined) {
          doc.setIn([...pathBase, 'pdoread_offset'], pdoread_offset);
        }
        if (taskValues.pdowrite_offset !== undefined) {
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
            pdoread_offset += 21;
            break;
          case 4:
            pdowrite_offset += 8;
            break;
          case 5:
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
            if (dmCtrlType === 1 || dmCtrlType === 2) pdowrite_offset += 9;
            else if (dmCtrlType === 3) pdowrite_offset += 5;
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

  private getHtmlForWebview() {
    const webview = this._view!.webview;
    const extensionUri = this.context.extensionUri;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'assets', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'assets', 'index.css'),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>SOEM Editor</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
