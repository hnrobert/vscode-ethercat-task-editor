import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'yaml';
import { parseYamlDocumentWithTags } from './utils/YamlParser';
import { getTaskTemplateYaml } from './taskTemplates';
import { parseMsgFolder } from './utils/msgParser';
import { TASK_TYPES } from './constants';
import { TaskTypeMemory } from './utils/taskTypeMemory';
import { applyAndSaveYaml, parseTopicSegment } from './utils/yamlUtils';

export class SoemConfigWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ethercatTaskEditor.sidebar';
  private _view?: vscode.WebviewView;
  private readonly msgFolderPath: string;
  private lastParsedDoc?: { doc: yaml.Document; data: any; isValid: boolean };
  private readonly taskTypeMemory = new TaskTypeMemory();

  public show() {
    if (this._view) {
      this._view.show();
    }
  }

  constructor(private readonly context: vscode.ExtensionContext) {
    this.msgFolderPath = path.join(context.extensionPath, 'assets', 'msg');

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
          await this.renameTask(data.sIndex, data.tIndex, data.newSegment);
          break;
      }
    });

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

  public collapseAll() {
    this._view?.webview.postMessage({ type: 'collapseAll' });
  }

  public expandAll() {
    this._view?.webview.postMessage({ type: 'expandAll' });
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

  private async updateYamlValue(propertyPath: (string | number)[], value: any) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;

    const doc = this.lastParsedDoc.doc;

    let finalValue = value;
    let isHex = false;

    if (typeof value === 'string' && value.toLowerCase().startsWith('0x')) {
      const parsedHex = parseInt(value, 16);
      if (!isNaN(parsedHex)) {
        finalValue = parsedHex;
        isHex = true;
      }
    }

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

        const valuesToSave: Record<string, any> = {};
        for (const [key, val] of Object.entries(taskData)) {
          if (key !== 'pdoread_offset' && key !== 'pdowrite_offset') {
            valuesToSave[key] = val;
          }
        }
        this.taskTypeMemory.save(sKey, tKey, oldType, valuesToSave);

        savedTaskTypeValues = this.taskTypeMemory.get(
          sKey,
          tKey,
          Number(finalValue),
        );
      }
    }

    doc.setIn(propertyPath, finalValue);

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
            if (savedTaskTypeValues && yaml.isScalar(item.key)) {
              const keyStr = String(item.key.value);
              if (keyStr in savedTaskTypeValues && yaml.isScalar(item.value)) {
                item.value.value = savedTaskTypeValues[keyStr];
              }
            }
            targetTaskNode.items.push(item);
          }
        }
      }
    }

    await this.saveDoc(editor, doc);
  }

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
      await this.saveDoc(editor, doc);
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
      await this.saveDoc(editor, doc);
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

    this.taskTypeMemory.migrateSlave(currentName, newName);

    keyNode.value = newName;
    const latencyTopic = doc.getIn([
      'slaves',
      sIndex,
      newName,
      'latency_pub_topic',
    ]);
    if (typeof latencyTopic === 'string' && latencyTopic.includes('/ecat/')) {
      doc.setIn(
        ['slaves', sIndex, newName, 'latency_pub_topic'],
        `/ecat/${newName}/latency`,
      );
    }
    await this.saveDoc(editor, doc);
  }

  private async addTask(sIndex: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key) ? slaveItem.items[0].key.value : '',
    );

    let tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);
    if (!tasksList) {
      doc.setIn(['slaves', sIndex, snKey, 'tasks'], []);
      tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);
    }

    if (yaml.isSeq(tasksList)) {
      const appIdx = tasksList.items.length + 1;
      const taskKey = `app_${appIdx}`;
      const segment = `app${appIdx}`;

      const newTaskStr = `${taskKey}:
  sdowrite_task_type: !uint8_t 1
  conf_connection_lost_read_action: !uint8_t 1
  sdowrite_connection_lost_write_action: !uint8_t 2
  pub_topic: !std::string '/ecat/${snKey}/${segment}/read'
  pdoread_offset: !uint16_t 0
  sub_topic: !std::string '/ecat/${snKey}/${segment}/write'
  pdowrite_offset: !uint16_t 0
`;
      const newTaskNode = parseYamlDocumentWithTags(newTaskStr).contents;
      if (newTaskNode) {
        tasksList.items.push(newTaskNode as any);
        doc.setIn(
          ['slaves', sIndex, snKey, 'task_count'],
          tasksList.items.length,
        );
        await this.saveDoc(editor, doc);
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
      yaml.isScalar(slaveItem.items[0].key) ? slaveItem.items[0].key.value : '',
    );
    const tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);

    if (yaml.isSeq(tasksList)) {
      tasksList.items.splice(tIndex, 1);
      doc.setIn(
        ['slaves', sIndex, snKey, 'task_count'],
        tasksList.items.length,
      );
      await this.saveDoc(editor, doc);
    }
  }

  private async renameTask(sIndex: number, tIndex: number, newSegment: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key) ? slaveItem.items[0].key.value : '',
    );

    const taskItem = doc.getIn(['slaves', sIndex, snKey, 'tasks', tIndex]);
    if (!yaml.isMap(taskItem) || taskItem.items.length === 0) return;
    const taskKeyNode = taskItem.items[0].key;
    if (!yaml.isScalar(taskKeyNode)) return;
    const currentKey = String(taskKeyNode.value);

    const pubTopic = doc.getIn([
      'slaves',
      sIndex,
      snKey,
      'tasks',
      tIndex,
      currentKey,
      'pub_topic',
    ]);
    const subTopic = doc.getIn([
      'slaves',
      sIndex,
      snKey,
      'tasks',
      tIndex,
      currentKey,
      'sub_topic',
    ]);

    if (typeof pubTopic === 'string') {
      const oldSeg = parseTopicSegment(pubTopic);
      if (oldSeg && oldSeg !== newSegment) {
        doc.setIn(
          ['slaves', sIndex, snKey, 'tasks', tIndex, currentKey, 'pub_topic'],
          pubTopic.replace(`/${oldSeg}/`, `/${newSegment}/`),
        );
      }
    }
    if (typeof subTopic === 'string') {
      const oldSeg = parseTopicSegment(subTopic);
      if (oldSeg && oldSeg !== newSegment) {
        doc.setIn(
          ['slaves', sIndex, snKey, 'tasks', tIndex, currentKey, 'sub_topic'],
          subTopic.replace(`/${oldSeg}/`, `/${newSegment}/`),
        );
      }
    }

    await this.saveDoc(editor, doc);
  }

  private async saveDoc(editor: vscode.TextEditor, doc: yaml.Document) {
    await applyAndSaveYaml(
      editor,
      doc,
      parseMsgFolder(this.msgFolderPath),
      () => this.updateWebview(),
    );
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
