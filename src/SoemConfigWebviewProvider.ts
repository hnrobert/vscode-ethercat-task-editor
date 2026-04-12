import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'yaml';
import { parseYamlDocumentWithTags } from './YamlParser';
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

    // Apply new value
    doc.setIn(propertyPath, value);

    // Attempt automatic formatting for HEX values starting with 0x
    const targetNode = doc.getIn(propertyPath, true);
    if (
      yaml.isScalar(targetNode) &&
      typeof value === 'number' &&
      String(value).toLowerCase().startsWith('0x')
    ) {
      targetNode.format = 'HEX';
    }

    // Re-calculate offsets
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
    edit.replace(editor.document.uri, fullRange, String(doc));
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
    .task-title { font-weight: bold; margin: 8px 0; }
  </style>
</head>
<body>
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

    function debounceUpdate(path, value) {
      // In a real app we'd debounce, but for simple AST writes just send immediately
      vscode.postMessage({ type: 'updateValue', path, value });
    }

    function render() {
      if (!currentData || !currentData.slaves) return;
      let html = '';
      
      currentData.slaves.forEach((slave, sIndex) => {
        const sKey = Object.keys(slave)[0];
        html += '<h3>' + sKey + '</h3>';
        
        const sInfo = slave[sKey];
        if (sInfo && Array.isArray(sInfo.tasks)) {
          sInfo.tasks.forEach((task, tIndex) => {
            const tKey = Object.keys(task)[0];
            const tInfo = task[tKey];
            
            html += '<div class="task-container">';
            html += '<div class="task-title">' + tKey + '</div>';
            
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
                 html += '<input type="text" class="prop-input" value="' + val + '" onchange="vscode.postMessage({type: \\'updateValue\\', path: ' + pathArg.replace(/"/g, "&quot;") + ', value: isNaN(Number(this.value)) ? this.value : (this.value.includes(\\'0x\\') ? parseInt(this.value, 16) : Number(this.value)) })" />';
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
