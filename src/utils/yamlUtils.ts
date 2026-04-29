import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { stringifyYamlDocumentWithTags } from './yamlParser';
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
  const match = topic.match(/^\/ecat\/([^/]+)\//);
  return match ? match[1] : null;
}

export function toSnakeCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function nextTopicIndex(data: any, snakeName: string): number {
  if (!data?.slaves || !Array.isArray(data.slaves)) return 1;

  const regex = new RegExp(
    `/ecat/${snakeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)/`,
  );
  let maxN = 0;

  for (const slave of data.slaves) {
    if (!slave || typeof slave !== 'object') continue;
    const slaveKey = Object.keys(slave)[0];
    const tasks = slave[slaveKey]?.tasks;
    if (!Array.isArray(tasks)) continue;

    for (const task of tasks) {
      if (!task || typeof task !== 'object') continue;
      const taskKey = Object.keys(task)[0];
      const info = task[taskKey];
      for (const topic of [info?.pub_topic, info?.sub_topic]) {
        if (typeof topic !== 'string') continue;
        const match = topic.match(regex);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > maxN) maxN = n;
        }
      }
    }
  }

  return maxN + 1;
}

export function normalizeTaskKeys(doc: yaml.Document) {
  const data = doc.toJSON();
  if (!data?.slaves || !Array.isArray(data.slaves)) return;

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
            taskDef.reorderFields(taskNode);
          }
        }
      }
    }
  }
}

/**
 * 修复所有十六进制字段的格式（将十进制值转为 0x 十六进制表示）
 */
export function normalizeHexFormat(doc: yaml.Document) {
  const data = doc.toJSON();
  if (!data?.slaves || !Array.isArray(data.slaves)) return;

  const { TaskRegistry } = require('../tasks');

  const alwaysHexKeys = new Set([
    'conf_connection_lost_read_action',
    'sdowrite_connection_lost_write_action',
    'sdowrite_task_type',
  ]);

  for (let sIndex = 0; sIndex < data.slaves.length; sIndex++) {
    const slave = data.slaves[sIndex];
    if (!slave || typeof slave !== 'object') continue;
    const slaveKey = Object.keys(slave)[0];
    const tasks = slave[slaveKey]?.tasks;
    if (!Array.isArray(tasks)) continue;

    for (let tIndex = 0; tIndex < tasks.length; tIndex++) {
      const task = tasks[tIndex];
      if (!task || typeof task !== 'object') continue;
      const taskKey = Object.keys(task)[0];
      const taskData = task[taskKey];
      if (!taskData?.sdowrite_task_type) continue;

      const taskType = Number(taskData.sdowrite_task_type);
      const taskDef = TaskRegistry.getTask(taskType);
      if (!taskDef) continue;

      const taskNode = doc.getIn(
        ['slaves', sIndex, slaveKey, 'tasks', tIndex, taskKey],
        true,
      );
      if (!yaml.isMap(taskNode)) continue;

      // 收集该 task 的 is_hex 字段
      const hexFieldKeys = new Set<string>();
      for (const field of taskDef.getFields()) {
        if (field.is_hex) hexFieldKeys.add(field.key);
      }

      // 遍历 task 节点的所有字段，修复十六进制格式
      for (const item of taskNode.items) {
        if (!yaml.isScalar(item.key)) continue;
        const key = String(item.key.value);
        const node = item.value;
        if (!yaml.isScalar(node) || typeof node.value !== 'number') continue;

        const shouldHex = alwaysHexKeys.has(key) || hexFieldKeys.has(key);
        if (!shouldHex) continue;

        const numVal = node.value as number;
        node.format = 'HEX';
        const hexStr = numVal.toString(16).toUpperCase().padStart(2, '0');
        (node as any)._originalSource = `0x${hexStr}`;
        node.toJSON = function () {
          return '0x' + (this as any).value.toString(16).toUpperCase().padStart(2, '0');
        };
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
  onUpdate?: () => void,
): Promise<void> {
  normalizeTaskKeys(doc);
  calculateOffsets(doc, doc.toJSON());

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
