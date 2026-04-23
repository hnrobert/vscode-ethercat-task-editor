import * as vscode from 'vscode';
import { SoemConfigWebviewProvider } from './providers/SoemConfigWebviewProvider';
import { EthercatYamlFormatter } from './providers/EthercatYamlFormatter';
import { isEthercatYaml, setEthercatYamlLanguage } from './utils/languageDetector';

async function updateEthercatContext() {
  const editor = vscode.window.activeTextEditor;
  const yes = editor ? isEthercatYaml(editor.document) : false;
  await vscode.commands.executeCommand(
    'setContext',
    'ethercatTaskEditor.isEthercatYaml',
    yes,
  );
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new SoemConfigWebviewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SoemConfigWebviewProvider.viewType,
      provider,
    ),
  );

  // 注册格式化提供者
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      'ethercat-yaml',
      new EthercatYamlFormatter(),
    ),
  );

  // 自动检测并设置语言
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      await setEthercatYamlLanguage(document);
      await updateEthercatContext();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      await setEthercatYamlLanguage(event.document);
      await updateEthercatContext();
    }),
  );

  // 初始化时检测当前文档
  if (vscode.window.activeTextEditor) {
    setEthercatYamlLanguage(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('ethercatTaskEditor.refresh', () =>
      provider.refresh(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ethercatTaskEditor.collapseAll', () =>
      provider.collapseAll(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ethercatTaskEditor.expandAll', () =>
      provider.expandAll(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ethercatTaskEditor.showPanel',
      async () => {
        provider.show();
        await vscode.commands.executeCommand(
          'ethercatTaskEditor.sidebar.focus',
        );
      },
    ),
  );

  // Track whether the active editor is an EtherCAT YAML
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => updateEthercatContext()),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) {
        updateEthercatContext();
      }
    }),
  );
  updateEthercatContext();
}
