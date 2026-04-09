import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { parseMsgFolder } from './msgParser';
import * as path from 'path';

type YamlParseOptions = yaml.ParseOptions &
  yaml.DocumentOptions &
  yaml.SchemaOptions &
  yaml.ToJSOptions;

const yamlParseOptions: YamlParseOptions = {
  customTags: [
    {
      tag: '!uint8_t',
      resolve: (str: string) => Number(str),
    },
    {
      tag: '!int8_t',
      resolve: (str: string) => Number(str),
    },
    {
      tag: '!uint16_t',
      resolve: (str: string) => Number(str),
    },
    {
      tag: '!int16_t',
      resolve: (str: string) => Number(str),
    },
    {
      tag: '!uint32_t',
      resolve: (str: string) => Number(str),
    },
    {
      tag: '!int32_t',
      resolve: (str: string) => Number(str),
    },
    {
      tag: '!float',
      resolve: (str: string) => Number(str),
    },
    {
      tag: '!std::string',
      resolve: (str: string) => String(str),
    },
  ],
};

export class YamlCustomEditorProvider
  implements vscode.CustomTextEditorProvider
{
  private msgsFolderPath: string = '';

  constructor(private readonly context: vscode.ExtensionContext) {
    this.msgsFolderPath = path.join(context.extensionPath, 'assets', 'msg');
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    const updateWebview = () => {
      const text = document.getText();
      let parsed: unknown;
      try {
        // Standard yaml parse, handles custom tags as generic nodes or strings normally unless configured.
        // We'll use custom tags config to keep them intact.
        parsed = yaml.parse(text, yamlParseOptions);
      } catch (e) {
        // If it fails to parse, we might pass an error state to the UI.
        webviewPanel.webview.postMessage({ type: 'error', message: String(e) });
        return;
      }
      webviewPanel.webview.postMessage({ type: 'update', data: parsed });
    };

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          updateWebview();
        }
      },
    );

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage((e) => {
      switch (e.type) {
        case 'change':
          this.updateTextDocument(document, e.data);
          return;
        case 'calculateOffsets':
          const msgs = parseMsgFolder(this.msgsFolderPath);
          const updatedData = this.calculateOffsets(e.data, msgs);
          this.updateTextDocument(document, updatedData);
          return;
      }
    });

    updateWebview();
  }

  private updateTextDocument(document: vscode.TextDocument, data: unknown) {
    const edit = new vscode.WorkspaceEdit();

    // Define stringifier for tags, yaml library allows custom tags
    const yamlStr = yaml.stringify(data, {
      customTags: [
        {
          tag: '!uint8_t',
          identify: (value: unknown) => typeof value === 'number',
          resolve: (str: string) => parseInt(str),
          stringify: (item: yaml.Scalar) => String(item.value),
        },
        {
          tag: '!int8_t',
          identify: (value: unknown) => typeof value === 'number',
          resolve: (str: string) => parseInt(str),
          stringify: (item: yaml.Scalar) => String(item.value),
        },
        {
          tag: '!uint16_t',
          identify: (value: unknown) => typeof value === 'number',
          resolve: (str: string) => parseInt(str),
          stringify: (item: yaml.Scalar) => String(item.value),
        },
        {
          tag: '!int16_t',
          identify: (value: unknown) => typeof value === 'number',
          resolve: (str: string) => parseInt(str),
          stringify: (item: yaml.Scalar) => String(item.value),
        },
        {
          tag: '!uint32_t',
          identify: (value: unknown) => typeof value === 'number',
          resolve: (str: string) => parseInt(str),
          stringify: (item: yaml.Scalar) => String(item.value),
        },
        {
          tag: '!int32_t',
          identify: (value: unknown) => typeof value === 'number',
          resolve: (str: string) => parseInt(str),
          stringify: (item: yaml.Scalar) => String(item.value),
        },
        {
          tag: '!float',
          identify: (value: unknown) => typeof value === 'number',
          resolve: (str: string) => parseFloat(str),
          stringify: (item: yaml.Scalar) => String(item.value),
        },
        {
          tag: '!std::string',
          identify: (value: unknown) => typeof value === 'string',
          resolve: (str: string) => str,
          stringify: (item: yaml.Scalar) => `'${item.value}'`,
        }, // Need custom serialize logic or let default handle mostly.
      ],
    });

    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      yamlStr,
    );
    vscode.workspace.applyEdit(edit);
  }

  private calculateOffsets(
    data: unknown,
    msgs: Record<string, import('./msgParser').MsgField[]>,
  ): unknown {
    type UnknownRecord = Record<string, unknown>;
    const isObject = (value: unknown): value is UnknownRecord =>
      typeof value === 'object' && value !== null;

    if (!isObject(data)) return data;

    const root = data as UnknownRecord;
    if (!Array.isArray(root.slaves)) return data;

    root.slaves.forEach((slaveObj) => {
      if (!isObject(slaveObj)) return;
      const slaveValues = Object.values(slaveObj)[0];
      if (!isObject(slaveValues)) return;

      const tasks = slaveValues.tasks;
      if (!Array.isArray(tasks)) return;

      let currentOffset = 0;
      tasks.forEach((taskObj, index) => {
        if (!isObject(taskObj)) return;

        const taskValues = Object.values(taskObj)[0];
        if (!isObject(taskValues)) return;

        taskValues.pdoread_offset = currentOffset;

        // Rough estimation based on Task type. Need explicit mapping from task type ID to MSG file
        // For example sdowrite_task_type 1 might map to ReadDJIMotor.msg
        // We can build a mapping or extract size dynamically.
        let size = 19; // Default fallback for ReadDJIMotor etc.

        // You can look up `msgs["ReadDJIMotor"]` to get the true byte size and increment

        currentOffset += size;
      });
    });

    return data;
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
                    .task { border: 1px solid var(--vscode-focusBorder); margin: 10px; padding: 10px; }
                    .task input { margin: 5px; }
                </style>
            </head>
            <body>
                <h1>EtherCAT Task Editor</h1>
                <div id="content"></div>
                <button id="calcOffset">Fix Offsets</button>
                <script>
                    const vscode = acquireVsCodeApi();
                    let currentData = null;

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'update':
                                currentData = message.data;
                                document.getElementById('content').innerText = JSON.stringify(currentData, null, 2);
                                break;
                            case 'error':
                                document.getElementById('content').innerText = 'Error: ' + message.message;
                                break;
                        }
                    });

                    document.getElementById('calcOffset').addEventListener('click', () => {
                        if (currentData) {
                            vscode.postMessage({ type: 'calculateOffsets', data: currentData });
                        }
                    });
                </script>
            </body>
            </html>
        `;
  }
}
