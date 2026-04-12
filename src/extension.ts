import * as vscode from 'vscode';
import { SoemConfigWebviewProvider } from './SoemConfigWebviewProvider';

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
}
