import * as vscode from 'vscode';
import { SoemConfigTreeDataProvider } from './SoemConfigTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new SoemConfigTreeDataProvider(context);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'ethercatTaskEditor.sidebar',
      provider,
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ethercatTaskEditor.refresh', () =>
      provider.refresh(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ethercatTaskEditor.editValue', (item) =>
      provider.editItem(item),
    ),
  );
}
