import * as vscode from 'vscode';
import { SoemConfigWebviewProvider } from './providers/SoemConfigWebviewProvider';
import { EthercatYamlFormatter } from './providers/EthercatYamlFormatter';
import { EthercatCodeLensProvider } from './providers/EthercatCodeLensProvider';
import { EthercatQuickFixProvider } from './providers/EthercatQuickFixProvider';
import { isEthercatYaml, setEthercatYamlLanguage } from './utils/languageDetector';
import { configureFileIcon } from './utils/iconConfigurator';

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

  // 注册 CodeLens 提供者
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      'ethercat-yaml',
      new EthercatCodeLensProvider(),
    ),
  );

  // 注册 Offset Quick Fix 提供者
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      'ethercat-yaml',
      new EthercatQuickFixProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  // CodeLens 点击后在 webview 中定位
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ethercatTaskEditor.focusInWebview',
      async (args: { sIndex: number; tIndex?: number }) => {
        provider.show();
        await vscode.commands.executeCommand('ethercatTaskEditor.sidebar.focus');
        // 短暂延迟等待 webview 就绪
        setTimeout(() => {
          if (args.tIndex !== undefined) {
            provider.scrollToTask(args.sIndex, args.tIndex);
          } else {
            provider.scrollToSlave(args.sIndex);
          }
        }, 150);
      },
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
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ethercatTaskEditor.configureFileIcon',
      () => configureFileIcon(context),
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
