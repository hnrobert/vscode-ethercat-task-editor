import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { stringifyYamlDocumentWithTags } from './yamlParser';
import { MsgField } from './msgParser';
import { calculateOffsets } from './offsetCalculator';

export type PathEntry = string | number;

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (isObject(value)) return '{...}';
  return String(value);
}

export function isSoemFormat(data: unknown): boolean {
  if (!isObject(data) || !Array.isArray(data.slaves)) {
    return false;
  }
  return data.slaves.every((slave) => {
    if (!isObject(slave)) return false;
    const slaveKey = Object.keys(slave)[0];
    const slaveValues = slave[slaveKey];
    return isObject(slaveValues) && Array.isArray((slaveValues as any).tasks);
  });
}

export function getValueByPath(data: unknown, path: PathEntry[]): unknown {
  let current = data;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment];
    } else if (isObject(current) && typeof segment === 'string') {
      current = current[segment];
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

export function setValueAtPath(
  data: unknown,
  path: PathEntry[],
  value: unknown,
): void {
  let current: any = data;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment];
    } else if (isObject(current) && typeof segment === 'string') {
      current = current[segment];
    } else {
      return;
    }
  }
  const last = path[path.length - 1];
  if (Array.isArray(current) && typeof last === 'number') {
    current[last] = value;
  } else if (isObject(current) && typeof last === 'string') {
    current[last] = value;
  }
}

export function parseTopicSegment(topic: string): string | null {
  const match = topic.match(/^\/ecat\/[^/]+\/([^/]+)\//);
  return match ? match[1] : null;
}

export function normalizeTaskKeys(doc: yaml.Document) {
  const data = doc.toJSON();
  if (!data?.slaves || !Array.isArray(data.slaves)) return;

  // 导入 TaskRegistry
  const { TaskRegistry } = require('../tasks');

  for (let sIndex = 0; sIndex < data.slaves.length; sIndex++) {
    const slave = data.slaves[sIndex];
    if (!slave || typeof slave !== 'object') continue;
    const slaveKey = Object.keys(slave)[0];
    const tasks = slave[slaveKey]?.tasks;
    if (!Array.isArray(tasks)) continue;

    for (let tIndex = 0; tIndex < tasks.length; tIndex++) {
      const task = tasks[tIndex];
      if (!task || typeof task !== 'object') continue;
      const currentKey = Object.keys(task)[0];
      const expectedKey = `app_${tIndex + 1}`;

      // 规范化 task key
      if (currentKey !== expectedKey) {
        const taskNode = doc.getIn(
          ['slaves', sIndex, slaveKey, 'tasks', tIndex],
          true,
        );
        if (yaml.isMap(taskNode) && taskNode.items.length > 0) {
          const keyNode = taskNode.items[0].key;
          if (yaml.isScalar(keyNode)) {
            keyNode.value = expectedKey;
          }
        }
      }

      // 重新排序 task 字段
      const taskData = task[currentKey] || task[expectedKey];
      if (taskData?.sdowrite_task_type) {
        const taskType = Number(taskData.sdowrite_task_type);
        const taskDef = TaskRegistry.getTask(taskType);
        if (taskDef) {
          const taskNode = doc.getIn(
            ['slaves', sIndex, slaveKey, 'tasks', tIndex, expectedKey],
            true,
          );
          if (yaml.isMap(taskNode)) {
            // console.log(`[normalizeTaskKeys] Reordering fields for task ${expectedKey} (type ${taskType})`);
            taskDef.reorderFields(taskNode);
          }
        }
      }
    }
  }
}

export async function writeDocument(
  document: vscode.TextDocument,
  doc: yaml.Document,
): Promise<void> {
  const yamlText = String(doc);
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange, yamlText);
  await vscode.workspace.applyEdit(edit);
  await document.save();
}

export async function applyAndSaveYaml(
  editor: vscode.TextEditor,
  doc: yaml.Document,
  msgs: Record<string, MsgField[]>,
  onUpdate?: () => void,
): Promise<void> {
  normalizeTaskKeys(doc);
  calculateOffsets(doc, doc.toJSON(), msgs);

  const fullRange = new vscode.Range(
    editor.document.positionAt(0),
    editor.document.positionAt(editor.document.getText().length),
  );

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    editor.document.uri,
    fullRange,
    stringifyYamlDocumentWithTags(doc),
  );
  await vscode.workspace.applyEdit(edit);
  await editor.document.save();

  onUpdate?.();
}
