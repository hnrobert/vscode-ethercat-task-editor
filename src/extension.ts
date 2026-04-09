import * as vscode from 'vscode';
import { YamlCustomEditorProvider } from './YamlCustomEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'ethercatTaskEditor.yaml',
            new YamlCustomEditorProvider(context),
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        )
    );
}
