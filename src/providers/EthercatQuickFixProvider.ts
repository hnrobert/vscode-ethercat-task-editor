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
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    const offsetDiags = context.diagnostics.filter((d) => d.code === 'offset-mismatch');
    const fieldDiags = context.diagnostics.filter((d) => d.code === 'field-mismatch');

    // "Fix this" — only fix the single diagnostic under the cursor
    const clickedField = fieldDiags.find((d) => d.range.contains(range));
    if (clickedField) {
      const action = new vscode.CodeAction('Fix this', vscode.CodeActionKind.QuickFix);
      action.diagnostics = [clickedField];
      action.edit = this.createSingleFieldFix(document, clickedField);
      actions.push(action);
    }

    const clickedOffset = offsetDiags.find((d) => d.range.contains(range));
    if (clickedOffset) {
      const action = new vscode.CodeAction('Fix this', vscode.CodeActionKind.QuickFix);
      action.diagnostics = [clickedOffset];
      action.edit = this.createSingleOffsetFix(document, clickedOffset);
      actions.push(action);
    }

    // "Fix all"
    if (fieldDiags.length > 0) {
      const action = new vscode.CodeAction('Fix all field issues', vscode.CodeActionKind.QuickFix);
      action.diagnostics = fieldDiags;
      action.isPreferred = true;
      action.edit = this.createAllFieldFix(document);
      actions.push(action);
    }

    if (offsetDiags.length > 0) {
      const action = new vscode.CodeAction('Fix all offsets and lengths', vscode.CodeActionKind.QuickFix);
      action.diagnostics = offsetDiags;
      action.edit = this.createOffsetFix(document);
      actions.push(action);
    }

    return actions;
  }

  /**
   * Fix only the single clicked diagnostic.
   * - "Unexpected field: xxx" → remove only that field
   * - "Missing fields: a, b" → add only those fields
   */
  private createSingleFieldFix(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
  ): vscode.WorkspaceEdit {
    const text = document.getText();
    const doc = parseYamlDocumentWithTags(text);
    const data = doc.toJSON();

    const taskPath = this.findDiagTaskPath(document, diag);
    if (!taskPath) return this.applyEdit(document, text, doc);

    const taskValues = this.getTaskValues(data, taskPath);
    if (!taskValues) return this.applyEdit(document, text, doc);

    const taskNode = doc.getIn(taskPath, true);
    if (!yaml.isMap(taskNode)) return this.applyEdit(document, text, doc);

    const msg = diag.message;

    if (msg.startsWith('Unexpected field: ')) {
      // Remove just the one extra field
      const fieldKey = msg.replace('Unexpected field: ', '');
      taskNode.delete(fieldKey);
    } else if (msg.startsWith('Missing field')) {
      // Add only the listed missing fields
      const fieldList = msg.includes(': ') ? msg.split(': ')[1].split(', ') : [];
      const type = Number(taskValues.sdowrite_task_type);
      const taskDef = TaskRegistry.getTask(type);
      if (taskDef) {
        const fields = taskDef.getFields();
        const fieldMap = new Map(fields.map((f) => [f.key, f]));
        for (const key of fieldList) {
          const field = fieldMap.get(key);
          if (!field || field.default === undefined) continue;
          this.addFieldNode(taskNode, field);
        }
      }
    }

    calculateOffsets(doc, doc.toJSON());
    return this.applyEdit(document, text, doc);
  }

  /**
   * Fix a single offset diagnostic by patching only the specific YAML node.
   */
  private createSingleOffsetFix(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
  ): vscode.WorkspaceEdit {
    const text = document.getText();
    const doc = parseYamlDocumentWithTags(text);

    const msg = diag.message;

    // Parse "pdoread_offset should be X, got Y" or "pdowrite_offset should be X, got Y"
    // or "sdo_len should be X, got Y" or "task_count should be X, got Y"
    const match = msg.match(/^(\w+) should be (\d+), got (\d+)$/);
    if (!match) return this.applyEdit(document, text, doc);

    const fieldKey = match[1];
    const correctValue = parseInt(match[2], 10);

    if (fieldKey === 'sdo_len' || fieldKey === 'task_count') {
      // Slave-level fields — find which slave
      const slavePath = this.findDiagSlavePath(document, diag);
      if (slavePath) {
        doc.setIn([...slavePath, fieldKey], correctValue);
      }
    } else {
      // Task-level fields — find which task
      const taskPath = this.findDiagTaskPath(document, diag);
      if (taskPath) {
        doc.setIn([...taskPath, fieldKey], correctValue);
      }
    }

    return this.applyEdit(document, text, doc);
  }

  private findDiagSlavePath(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
  ): (string | number)[] | null {
    const text = document.getText();
    const doc = parseYamlDocumentWithTags(text);

    const root = doc.contents;
    if (!yaml.isMap(root)) return null;
    const slavesNode = root.get('slaves', true);
    if (!yaml.isSeq(slavesNode)) return null;

    const diagLine = diag.range.start.line;

    for (let sIndex = 0; sIndex < slavesNode.items.length; sIndex++) {
      const slaveItem = slavesNode.items[sIndex];
      if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) continue;
      const slaveKeyNode = slaveItem.items[0].key;
      if (!yaml.isScalar(slaveKeyNode) || !slaveKeyNode.range) continue;

      const slaveStart = document.positionAt(slaveKeyNode.range[0]).line;

      // Find end of this slave (start of next slave or end of file)
      let slaveEnd: number;
      if (sIndex + 1 < slavesNode.items.length) {
        const nextSlave = slavesNode.items[sIndex + 1];
        if (yaml.isMap(nextSlave) && nextSlave.items.length > 0) {
          const nextKey = nextSlave.items[0].key;
          slaveEnd = yaml.isScalar(nextKey) && nextKey.range
            ? document.positionAt(nextKey.range[0]).line
            : Number.MAX_SAFE_INTEGER;
        } else {
          slaveEnd = Number.MAX_SAFE_INTEGER;
        }
      } else {
        slaveEnd = Number.MAX_SAFE_INTEGER;
      }

      if (diagLine >= slaveStart && diagLine < slaveEnd) {
        const slaveKey = String(slaveKeyNode.value);
        return ['slaves', sIndex, slaveKey];
      }
    }
    return null;
  }

  /**
   * Fix all field issues across all tasks.
   */
  private createAllFieldFix(document: vscode.TextDocument): vscode.WorkspaceEdit {
    const text = document.getText();
    const doc = parseYamlDocumentWithTags(text);
    const data = doc.toJSON();

    const root = doc.contents;
    if (!yaml.isMap(root) || !data?.slaves) return new vscode.WorkspaceEdit();

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

        const normalized = normalizeTaskData(taskValues);
        const expectedKeys = taskDef.getExpectedFields(normalized);
        const fields = taskDef.getFields();
        const fieldMap = new Map(fields.map((f) => [f.key, f]));

        // Add missing fields
        for (const key of expectedKeys) {
          if (key in taskValues) continue;
          const field = fieldMap.get(key);
          if (!field || field.default === undefined) continue;
          this.addFieldNode(taskNode, field);
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
    return this.applyEdit(document, text, doc);
  }

  private createOffsetFix(document: vscode.TextDocument): vscode.WorkspaceEdit {
    const text = document.getText();
    const doc = parseYamlDocumentWithTags(text);
    const data = doc.toJSON();
    calculateOffsets(doc, data);
    return this.applyEdit(document, text, doc);
  }

  private addFieldNode(taskNode: yaml.YAMLMap, field: { key: string; data_type: string; default?: any; is_hex?: boolean; yaml_hex?: boolean }) {
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

  private getTaskValues(data: any, path: (string | number)[]): Record<string, any> | null {
    try {
      let current: any = data;
      for (const seg of path) {
        current = current[seg];
        if (!current) return null;
      }
      return current;
    } catch {
      return null;
    }
  }

  private findDiagTaskPath(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
  ): (string | number)[] | null {
    const text = document.getText();
    const doc = parseYamlDocumentWithTags(text);

    const root = doc.contents;
    if (!yaml.isMap(root)) return null;
    const slavesNode = root.get('slaves', true);
    if (!yaml.isSeq(slavesNode)) return null;

    const diagLine = diag.range.start.line;

    for (let sIndex = 0; sIndex < slavesNode.items.length; sIndex++) {
      const slaveItem = slavesNode.items[sIndex];
      if (!yaml.isMap(slaveItem) || slaveItem.items.length === 0) continue;
      const slaveKeyNode = slaveItem.items[0].key;
      if (!yaml.isScalar(slaveKeyNode) || !slaveKeyNode.range) continue;

      const slaveData = slaveItem.items[0].value;
      if (!yaml.isMap(slaveData)) continue;
      const tasksNode = slaveData.get('tasks', true);
      if (!yaml.isSeq(tasksNode)) continue;

      const slaveKey = String(slaveKeyNode.value);

      for (let tIndex = 0; tIndex < tasksNode.items.length; tIndex++) {
        const taskItem = tasksNode.items[tIndex];
        if (!yaml.isMap(taskItem) || taskItem.items.length === 0) continue;
        const taskKeyNode = taskItem.items[0].key;
        if (!yaml.isScalar(taskKeyNode) || !taskKeyNode.range) continue;

        const taskStart = document.positionAt(taskKeyNode.range[0]).line;
        const nextTask = tIndex + 1 < tasksNode.items.length ? tasksNode.items[tIndex + 1] : null;
        let taskEnd: number;
        if (nextTask && yaml.isMap(nextTask) && nextTask.items.length > 0) {
          const nextKey = nextTask.items[0].key;
          taskEnd = yaml.isScalar(nextKey) && nextKey.range
            ? document.positionAt(nextKey.range[0]).line
            : Number.MAX_SAFE_INTEGER;
        } else {
          taskEnd = Number.MAX_SAFE_INTEGER;
        }

        if (diagLine >= taskStart && diagLine < taskEnd) {
          const taskKey = String(taskKeyNode.value);
          return ['slaves', sIndex, slaveKey, 'tasks', tIndex, taskKey];
        }
      }
    }
    return null;
  }

  private applyEdit(
    document: vscode.TextDocument,
    originalText: string,
    doc: yaml.Document,
  ): vscode.WorkspaceEdit {
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(originalText.length),
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange, stringifyYamlDocumentWithTags(doc));
    return edit;
  }
}
