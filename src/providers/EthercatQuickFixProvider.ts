import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { parseYamlDocumentWithTags, stringifyYamlDocumentWithTags } from '../utils/yamlParser';
import { calculateOffsets } from '../utils/offsetCalculator';
import { TaskRegistry } from '../tasks';

function normalizeTaskData(taskData: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(taskData)) {
    if (typeof value === 'string' && value.startsWith('0x')) {
      normalized[key] = parseInt(value, 16);
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

const STRUCTURAL_FIELDS = new Set([
  'sdowrite_task_type',
  'conf_connection_lost_read_action',
  'sdowrite_connection_lost_write_action',
  'pub_topic',
  'sub_topic',
  'pdoread_offset',
  'pdowrite_offset',
]);

export class EthercatQuickFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    const offsetDiags = context.diagnostics.filter((d) => d.code === 'offset-mismatch');
    const fieldDiags = context.diagnostics.filter((d) => d.code === 'field-mismatch');

    if (offsetDiags.length > 0) {
      const action = new vscode.CodeAction(
        'Fix all offsets and lengths',
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = offsetDiags;
      action.isPreferred = true;
      action.edit = this.createOffsetFix(document);
      actions.push(action);
    }

    if (fieldDiags.length > 0) {
      const action = new vscode.CodeAction(
        'Fix missing and extra fields',
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = fieldDiags;
      action.isPreferred = true;
      action.edit = this.createFieldFix(document);
      actions.push(action);
    }

    return actions;
  }

  private createOffsetFix(document: vscode.TextDocument): vscode.WorkspaceEdit {
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

  private createFieldFix(document: vscode.TextDocument): vscode.WorkspaceEdit {
    const text = document.getText();
    const doc = parseYamlDocumentWithTags(text);
    const data = doc.toJSON();

    const root = doc.contents;
    if (!yaml.isMap(root) || !data?.slaves) return new vscode.WorkspaceEdit();
    const slavesNode = root.get('slaves', true);
    if (!yaml.isSeq(slavesNode)) return new vscode.WorkspaceEdit();

    data.slaves.forEach((slave: any, sIndex: number) => {
      if (!slave || typeof slave !== 'object') return;
      const slaveKey = Object.keys(slave)[0];
      const slaveValues = slave[slaveKey];
      if (!slaveValues || typeof slaveValues !== 'object' || !Array.isArray(slaveValues.tasks)) return;

      slaveValues.tasks.forEach((task: any, tIndex: number) => {
        if (!task || typeof task !== 'object') return;
        const taskKey = Object.keys(task)[0];
        const taskValues = task[taskKey] as Record<string, any>;
        if (!taskValues || typeof taskValues !== 'object') return;

        const pathBase = ['slaves', sIndex, slaveKey, 'tasks', tIndex, taskKey];
        const type = Number(taskValues.sdowrite_task_type);
        const taskDef = TaskRegistry.getTask(type);
        if (!taskDef) return;

        const taskNode = doc.getIn(pathBase, true);
        if (!yaml.isMap(taskNode)) return;

        // Add missing visible fields (normalize hex strings for visible_when checks)
        const normalized = normalizeTaskData(taskValues);
        const expectedKeys = taskDef.getExpectedFields(normalized);
        const fields = taskDef.getFields();
        const fieldMap = new Map(fields.map((f) => [f.key, f]));
        for (const key of expectedKeys) {
          if (key in taskValues) continue;
          const field = fieldMap.get(key);
          if (!field || field.default === undefined) continue;

          const valueScalar = new yaml.Scalar(field.default);
          valueScalar.tag = `!${field.data_type}`;
          if ((field.is_hex || field.yaml_hex) && typeof field.default === 'number') {
            valueScalar.format = 'HEX';
            const hexStr = field.default.toString(16).toUpperCase().padStart(2, '0');
            (valueScalar as any)._originalSource = `0x${hexStr}`;
            valueScalar.toJSON = function () {
              return '0x' + (this as any).value.toString(16).toUpperCase().padStart(2, '0');
            };
          }
          taskNode.add(new yaml.Pair(new yaml.Scalar(field.key), valueScalar));
        }

        // Remove extra fields
        const expectedKeySet = new Set(expectedKeys);
        const keysToRemove: any[] = [];
        for (const item of taskNode.items) {
          if (!yaml.isScalar(item.key)) continue;
          const keyStr = String(item.key.value);
          if (STRUCTURAL_FIELDS.has(keyStr)) continue;
          if (expectedKeySet.has(keyStr)) continue;
          if (keyStr.startsWith('sdowrite_') || keyStr.startsWith('conf_')) {
            keysToRemove.push(item.key);
          }
        }
        keysToRemove.forEach((k) => taskNode.delete(k));
      });
    });

    calculateOffsets(doc, doc.toJSON());

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(text.length),
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange, stringifyYamlDocumentWithTags(doc));
    return edit;
  }
}
