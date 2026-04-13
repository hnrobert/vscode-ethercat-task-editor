import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  parseYamlDocumentWithTags,
  stringifyYamlDocumentWithTags,
} from './YamlParser';
import { parseMsgFolder, MsgField } from './msgParser';
import { TASK_TYPES } from './constants';

export class SoemConfigWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ethercatTaskEditor.sidebar';
  private _view?: vscode.WebviewView;
  private readonly msgFolderPath: string;
  private lastParsedDoc?: { doc: yaml.Document; data: any; isValid: boolean };

  constructor(private readonly context: vscode.ExtensionContext) {
    this.msgFolderPath = path.join(context.extensionPath, 'assets', 'msg');
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
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
          await this.addSlave(data.name);
          break;
        case 'removeSlave':
          await this.removeSlave(data.sIndex);
          break;
        case 'renameSlave':
          await this.renameSlave(data.sIndex, data.newName);
          break;
        case 'addTask':
          await this.addTask(data.sIndex, data.taskName);
          break;
        case 'removeTask':
          await this.removeTask(data.sIndex, data.tIndex);
          break;
        case 'renameTask':
          await this.renameTask(data.sIndex, data.tIndex, data.newName);
          break;
      }
    });

    vscode.window.onDidChangeActiveTextEditor(() => this.updateWebview());
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) {
        this.updateWebview();
      }
    });

    this.updateWebview();
  }

  public refresh() {
    this.updateWebview();
  }

  private updateWebview() {
    if (!this._view) {
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

  private async updateYamlValue(propertyPath: (string | number)[], value: any) {
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

    await this.applyAndSaveYaml(editor, doc);
  }

  private async addSlave(snName: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastParsedDoc?.doc) return;
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
    if (yaml.isMap(slaveItem) && slaveItem.items.length > 0) {
      const keyNode = slaveItem.items[0].key;
      if (yaml.isScalar(keyNode)) {
        keyNode.value = newName;
        // update pub/sub topic references automatically?
        const latencyTopic = doc.getIn([
          'slaves',
          sIndex,
          String(keyNode.value),
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
    }
  }

  private async addTask(sIndex: number, taskName: string) {
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
      yaml.isScalar(slaveItem.items[0].key) ? slaveItem.items[0].key.value : '',
    );

    const taskItem = doc.getIn(['slaves', sIndex, snKey, 'tasks', tIndex]);
    if (yaml.isMap(taskItem) && taskItem.items.length > 0) {
      const keyNode = taskItem.items[0].key;
      if (yaml.isScalar(keyNode)) {
        keyNode.value = newName;
        // try to automatically update topics if they're standard
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
    }
  }

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
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SOEM Editor</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: transparent; padding: 10px; }
    .prop-row { display: flex; flex-direction: column; margin-bottom: 8px; }
    .prop-label { font-size: 12px; margin-bottom: 2px; opacity: 0.8; }
    .prop-input, select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px; box-sizing: border-box; width: 100%; border-radius: 2px; }
    .task-container { border-left: 2px solid var(--vscode-focusBorder); padding-left: 8px; margin-bottom: 12px; }
    .task-title { font-weight: bold; margin: 8px 0; display:flex; justify-content:space-between; }
    .header-row { display:flex; justify-content:space-between; align-items:center; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border:none; padding:4px 8px; cursor:pointer; border-radius:2px; font-size:12px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .btn-sm { padding: 2px 4px; font-size: 10px; margin-left: 4px; }
    .btn-danger { background: var(--vscode-errorForeground); color: white; }
    .btn-group { display: flex; gap: 4px; }
  </style>
</head>
<body>
  <div style="margin-bottom:10px;"><button onclick="addSlave()">+ Add Slave (SN)</button></div>
  <div id="content">Loading...</div>
  <script>
    const vscode = acquireVsCodeApi();
    const contentDiv = document.getElementById('content');
    
    let currentData = null;
    let taskTypes = [];

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'setError':
          contentDiv.innerHTML = '<div style="color:var(--vscode-errorForeground)">' + message.message + '</div>';
          break;
        case 'updateData':
          currentData = message.data;
          taskTypes = message.taskTypes || [];
          render();
          break;
      }
    });

    function addSlave() {
        const name = prompt("Enter new slave name (e.g., sn1234567):", "sn0000000");
        if (name) vscode.postMessage({ type: 'addSlave', name });
    }
    function renameSlave(sIndex, oldName) {
        const name = prompt("Rename slave:", oldName);
        if (name && name !== oldName) vscode.postMessage({ type: 'renameSlave', sIndex, newName: name });
    }
    function removeSlave(sIndex) {
        if (confirm("Remove this entire slave?")) {
            vscode.postMessage({ type: 'removeSlave', sIndex });
        }
    }
    function addTask(sIndex) {
        const name = prompt("Enter new task name (e.g., app_1):", "app_x");
        if (name) vscode.postMessage({ type: 'addTask', sIndex, taskName: name });
    }
    function renameTask(sIndex, tIndex, oldName) {
        const name = prompt("Rename task:", oldName);
        if (name && name !== oldName) vscode.postMessage({ type: 'renameTask', sIndex, tIndex, newName: name });
    }
    function removeTask(sIndex, tIndex) {
        if (confirm("Remove this task?")) {
            vscode.postMessage({ type: 'removeTask', sIndex, tIndex });
        }
    }

    function render() {
      if (!currentData || !currentData.slaves) return;
      let html = '';
      
      currentData.slaves.forEach((slave, sIndex) => {
        const sKey = Object.keys(slave)[0];
        html += '<div class="header-row"><h3>' + sKey + '</h3>';
        html += '<div class="btn-group"><button class="btn-sm" onclick="renameSlave(' + sIndex + ', \\'' + sKey + '\\')">Rename</button>';
        html += '<button class="btn-sm btn-danger" onclick="removeSlave(' + sIndex + ')">Delete</button>';
        html += '</div></div>';
        
        html += '<div style="margin-bottom:8px;"><button class="btn-sm" onclick="addTask(' + sIndex + ')">+ Add Task</button></div>';

        const sInfo = slave[sKey];
        if (sInfo && Array.isArray(sInfo.tasks)) {
          sInfo.tasks.forEach((task, tIndex) => {
            const tKey = Object.keys(task)[0];
            const tInfo = task[tKey];
            
            html += '<div class="task-container">';
            html += '<div class="task-title"><span>' + tKey + '</span>';
            html += '<div class="btn-group"><button class="btn-sm" onclick="renameTask(' + sIndex + ', ' + tIndex + ', \\'' + tKey + '\\')">Ren</button>';
            html += '<button class="btn-sm btn-danger" onclick="removeTask(' + sIndex + ', ' + tIndex + ')">Del</button></div></div>';
            
            Object.keys(tInfo).forEach(prop => {
              if (prop === 'pdoread_offset' || prop === 'pdowrite_offset') return;
              
              const val = tInfo[prop];
              html += '<div class="prop-row">';
              html += '<div class="prop-label">' + prop + '</div>';
              
              const pathArg = JSON.stringify(['slaves', sIndex, sKey, 'tasks', tIndex, tKey, prop]);
              
              if (prop === 'sdowrite_task_type') {
                html += '<select onchange="vscode.postMessage({type: \\'updateValue\\', path: ' + pathArg.replace(/"/g, "&quot;") + ', value: Number(this.value)})">';
                taskTypes.forEach(ty => {
                  const sel = (Number(ty.value) === Number(val)) ? 'selected' : '';
                  html += '<option value="' + ty.value + '" ' + sel + '>' + ty.label + ' - ' + ty.description + '</option>';
                });
                html += '</select>';
              } else if (typeof val === 'boolean') {
                html += '<select onchange="vscode.postMessage({type: \\'updateValue\\', path: ' + pathArg.replace(/"/g, "&quot;") + ', value: this.value === \\'true\\'})">';
                html += '<option value="true" ' + (val ? 'selected' : '') + '>true</option>';
                html += '<option value="false" ' + (!val ? 'selected' : '') + '>false</option>';
                html += '</select>';
              } else {
                 html += '<input type="text" class="prop-input" value="' + val + '" onchange="vscode.postMessage({type: \\'updateValue\\', path: ' + pathArg.replace(/"/g, "&quot;") + ', value: isNaN(Number(this.value)) ? this.value : (this.value.toLowerCase().startsWith(\\'0x\\') ? this.value : Number(this.value)) })" />';
              }
              html += '</div>';
            });
            html += '</div>';
          });
        }
      });
      contentDiv.innerHTML = html;
    }
  </script>
</body>
</html>`;
  }
}
