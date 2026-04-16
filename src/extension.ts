import * as vscode from 'vscode';
import { SoemConfigWebviewProvider } from './SoemConfigWebviewProvider';

function isEthercatYaml(doc: vscode.TextDocument): boolean {
  if (!doc.fileName.endsWith('.yaml') && !doc.fileName.endsWith('.yml')) {
    return false;
  }
  const text = doc.getText().trimStart();
  return text === '' || text.startsWith('slaves:');
}

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
