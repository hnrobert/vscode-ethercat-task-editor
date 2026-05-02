import * as vscode from 'vscode';
import { parseYamlDocumentWithTags, stringifyYamlDocumentWithTags } from '../utils/yamlParser';
import { calculateOffsets } from '../utils/offsetCalculator';

export class OffsetQuickFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const hasOffsetIssue = context.diagnostics.some(
      (d) => d.code === 'offset-mismatch',
    );
    if (!hasOffsetIssue) return [];

    const action = new vscode.CodeAction(
      'Fix all offsets and lengths',
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = context.diagnostics.filter(
      (d) => d.code === 'offset-mismatch',
    );
    action.isPreferred = true;
    action.edit = this.createFix(document);
    return [action];
  }

  private createFix(document: vscode.TextDocument): vscode.WorkspaceEdit {
    const text = document.getText();
    const doc = parseYamlDocumentWithTags(text);
    const data = doc.toJSON();

    calculateOffsets(doc, data);

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(text.length),
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange, stringifyYamlDocumentWithTags(doc));
    return edit;
  }
}
