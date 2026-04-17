import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'yaml';
import { parseYamlDocumentWithTags } from './utils/YamlParser';
import { getTaskTemplateYaml, generateTaskTemplate } from './taskTemplates';
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
        case 'addSlaveAt':
          await this.addSlaveAt(data.sIndex);
          break;
        case 'removeSlave':
          await this.removeSlave(data.sIndex);
          break;
        case 'renameSlave':
          await this.renameSlave(data.sIndex, data.newName);
          break;
        case 'renameSlaveAlias':
          await this.renameSlaveAlias(data.sIndex, data.newAlias);
          break;
        case 'addTask':
          await this.addTask(data.sIndex);
          break;
        case 'addTaskAt':
          await this.addTaskAt(data.sIndex, data.tIndex);
          break;
        case 'confirmTaskType':
          await this.createTaskWithType(data.sIndex, data.tIndex, data.taskType);
          break;
        case 'removeTask':
          await this.removeTask(data.sIndex, data.tIndex);
          break;
        case 'renameTask':
          await this.renameTask(data.sIndex, data.tIndex, data.newSegment);
          break;
        case 'moveTask':
          await this.moveTask(data.fromSIndex, data.fromTIndex, data.toSIndex, data.toTIndex);
          break;
        case 'moveSlave':
          await this.moveSlave(data.fromIndex, data.toIndex);
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

  public async refresh() {
    const editor = vscode.window.activeTextEditor;
    if (
      !editor ||
      (!editor.document.fileName.endsWith('.yaml') &&
        !editor.document.fileName.endsWith('.yml'))
    ) {
      this.updateWebview();
      vscode.window.showWarningMessage('No active YAML document to recalculate.');
      return;
    }
    try {
      const doc = parseYamlDocumentWithTags(editor.document.getText());
      this.lastParsedDoc = { doc, data: doc.toJSON(), isValid: true };
      await this.saveDoc(editor, doc);
      vscode.window.showInformationMessage('Offsets and lengths recalculated successfully.');
    } catch (e) {
      this.updateWebview();
      vscode.window.showErrorMessage(`Recalculation failed: ${e}`);
    }
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

  private async addSlaveAt(sIndex: number) {
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
      if (newSlaveNode) {
        slavesList.items.splice(sIndex, 0, newSlaveNode as any);
        await this.saveDoc(editor, doc);
      }
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
    await this.saveDoc(editor, doc);
  }

  private async renameSlaveAlias(sIndex: number, newAlias: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;
    const slaveItem = doc.getIn(['slaves', sIndex]);
    if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) return;
    const snKey = String(
      yaml.isScalar(slaveItem.items[0].key) ? slaveItem.items[0].key.value : '',
    );

    const latencyTopic = doc.getIn(['slaves', sIndex, snKey, 'latency_pub_topic']);
    let currentAlias = snKey;
    if (typeof latencyTopic === 'string') {
      const m = latencyTopic.match(/^\/ecat\/([^/]+)\/latency/);
      if (m) currentAlias = m[1];
    }
    if (currentAlias === newAlias) return;

    if (typeof latencyTopic === 'string') {
      doc.setIn(
        ['slaves', sIndex, snKey, 'latency_pub_topic'],
        latencyTopic.replace(`/ecat/${currentAlias}/`, `/ecat/${newAlias}/`),
      );
    }

    const tasksList = doc.getIn(['slaves', sIndex, snKey, 'tasks']);
    if (yaml.isSeq(tasksList)) {
      tasksList.items.forEach((taskNode: any, tIndex: number) => {
        if (!yaml.isMap(taskNode) || taskNode.items.length === 0) return;
        const taskKey = String(
          yaml.isScalar(taskNode.items[0].key) ? taskNode.items[0].key.value : '',
        );
        const base = ['slaves', sIndex, snKey, 'tasks', tIndex, taskKey];
        for (const field of ['pub_topic', 'sub_topic'] as const) {
          const topic = doc.getIn([...base, field]);
          if (typeof topic === 'string' && topic.includes(`/ecat/${currentAlias}/`)) {
            doc.setIn([...base, field], topic.replace(`/ecat/${currentAlias}/`, `/ecat/${newAlias}/`));
          }
        }
      });
    }

    await this.saveDoc(editor, doc);
  }

  private async addTask(sIndex: number) {
    if (!this._view) return;

    // Request task type selection from webview
    this._view.webview.postMessage({
      type: 'requestTaskType',
      sIndex,
      tIndex: -1, // -1 means append
    });
  }

  private async addTaskAt(sIndex: number, tIndex: number) {
    if (!this._view) return;

    // Request task type selection from webview
    this._view.webview.postMessage({
      type: 'requestTaskType',
      sIndex,
      tIndex,
    });
  }

  private async createTaskWithType(sIndex: number, tIndex: number, taskType: number) {
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
      const segment = this.nextAppNewSegment(doc);

      if (tIndex === -1) {
        // Append to end
        const appIdx = tasksList.items.length + 1;
        const taskKey = `app_${appIdx}`;
        const newTaskStr = generateTaskTemplate(taskKey, snKey, segment, taskType);
        const newTaskNode = parseYamlDocumentWithTags(newTaskStr).contents;
        if (newTaskNode) {
          tasksList.items.push(newTaskNode as any);
          doc.setIn(['slaves', sIndex, snKey, 'task_count'], tasksList.items.length);
          await this.saveDoc(editor, doc);
        }
      } else {
        // Insert at position
        const taskKey = `app_${tIndex + 1}`;
        const newTaskStr = generateTaskTemplate(taskKey, snKey, segment, taskType);
        const newTaskNode = parseYamlDocumentWithTags(newTaskStr).contents;
        if (newTaskNode) {
          tasksList.items.splice(tIndex, 0, newTaskNode as any);
          doc.setIn(['slaves', sIndex, snKey, 'task_count'], tasksList.items.length);
          await this.saveDoc(editor, doc);
        }
      }
    }
  }

  private nextAppNewSegment(doc: yaml.Document): string {
    const data = doc.toJSON();
    let maxN = 0;
    if (data?.slaves && Array.isArray(data.slaves)) {
      for (const slave of data.slaves) {
        if (!slave || typeof slave !== 'object') continue;
        const slaveKey = Object.keys(slave)[0];
        const tasks = slave[slaveKey]?.tasks;
        if (!Array.isArray(tasks)) continue;
        for (const task of tasks) {
          if (!task || typeof task !== 'object') continue;
          const taskKey = Object.keys(task)[0];
          const info = task[taskKey];
          for (const topic of [info?.pub_topic, info?.sub_topic]) {
            if (typeof topic !== 'string') continue;
            const match = topic.match(/\/ecat\/[^/]+\/app_new_(\d+)\//);
            if (match) {
              const n = parseInt(match[1], 10);
              if (n > maxN) maxN = n;
            }
          }
        }
      }
    }
    return `app_new_${maxN + 1}`;
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

  private async moveTask(
    fromSIndex: number,
    fromTIndex: number,
    toSIndex: number,
    toTIndex: number,
  ) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;

    // Get source
    const fromSlaveItem = doc.getIn(['slaves', fromSIndex]);
    if (!yaml.isMap(fromSlaveItem) || fromSlaveItem.items.length === 0) return;
    const fromSnKey = String(
      yaml.isScalar(fromSlaveItem.items[0].key) ? fromSlaveItem.items[0].key.value : '',
    );
    const fromTasksList = doc.getIn(['slaves', fromSIndex, fromSnKey, 'tasks']);
    if (!yaml.isSeq(fromTasksList) || fromTIndex >= fromTasksList.items.length) return;

    // Remove from source
    const taskNode = fromTasksList.items.splice(fromTIndex, 1)[0];
    doc.setIn(
      ['slaves', fromSIndex, fromSnKey, 'task_count'],
      fromTasksList.items.length,
    );

    // Adjust destination index if same slave
    let adjustedTIndex = toTIndex;
    if (fromSIndex === toSIndex && fromTIndex < toTIndex) {
      adjustedTIndex = toTIndex - 1;
    }

    // Get destination
    const toSlaveItem = doc.getIn(['slaves', toSIndex]);
    if (!yaml.isMap(toSlaveItem) || toSlaveItem.items.length === 0) return;
    const toSnKey = String(
      yaml.isScalar(toSlaveItem.items[0].key) ? toSlaveItem.items[0].key.value : '',
    );

    let toTasksList = doc.getIn(['slaves', toSIndex, toSnKey, 'tasks']);
    if (!toTasksList) {
      doc.setIn(['slaves', toSIndex, toSnKey, 'tasks'], []);
      toTasksList = doc.getIn(['slaves', toSIndex, toSnKey, 'tasks']);
    }

    if (yaml.isSeq(toTasksList)) {
      // Cross-slave: update topic namespace
      if (fromSIndex !== toSIndex) {
        this.remapTaskTopics(taskNode, fromSnKey, toSnKey);
      }

      toTasksList.items.splice(adjustedTIndex, 0, taskNode);
      doc.setIn(
        ['slaves', toSIndex, toSnKey, 'task_count'],
        toTasksList.items.length,
      );
      await this.saveDoc(editor, doc);
    }
  }

  private async moveSlave(fromIndex: number, toIndex: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
    const doc = this.lastParsedDoc.doc;

    const slavesList = doc.getIn(['slaves']);
    if (!yaml.isSeq(slavesList)) return;

    const slaveNode = slavesList.items.splice(fromIndex, 1)[0];

    let adjustedIndex = toIndex;
    if (fromIndex < toIndex) {
      adjustedIndex = toIndex - 1;
    }

    slavesList.items.splice(adjustedIndex, 0, slaveNode);
    await this.saveDoc(editor, doc);
  }

  /** Update /ecat/{oldSlave}/... → /ecat/{newSlave}/... in task topics */
  private remapTaskTopics(taskNode: any, oldSnKey: string, newSnKey: string) {
    if (!yaml.isMap(taskNode)) return;
    const innerMap = taskNode.items[0]?.value;
    if (!yaml.isMap(innerMap)) return;

    for (const item of innerMap.items) {
      if (!yaml.isScalar(item.key)) continue;
      const key = String(item.key.value);
      if ((key === 'pub_topic' || key === 'sub_topic') && yaml.isScalar(item.value)) {
        const topic = String(item.value.value);
        if (topic.includes(`/ecat/${oldSnKey}/`)) {
          item.value.value = topic.replace(`/ecat/${oldSnKey}/`, `/ecat/${newSnKey}/`);
        }
      }
    }
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
