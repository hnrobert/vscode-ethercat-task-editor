import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { TaskRegistry } from '../tasks';
import type { TaskBase } from '../tasks/TaskBase';

const STRUCTURAL_FIELDS = new Set([
  'sdowrite_task_type',
  'conf_connection_lost_read_action',
  'sdowrite_connection_lost_write_action',
  'pub_topic',
  'sub_topic',
  'pdoread_offset',
  'pdowrite_offset',
]);

const READ_FIELDS: Record<string, string> = {
  pub_topic: 'pub_topic',
  pdoread_offset: 'pdoread_offset',
  conf_connection_lost_read_action: 'conf_connection_lost_read_action',
};

const WRITE_FIELDS: Record<string, string> = {
  sub_topic: 'sub_topic',
  pdowrite_offset: 'pdowrite_offset',
  sdowrite_connection_lost_write_action: 'sdowrite_connection_lost_write_action',
};

export function validateOffsets(
  document: vscode.TextDocument,
  doc: yaml.Document,
  data: any,
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  if (!data?.slaves || !Array.isArray(data.slaves)) return diagnostics;

  const root = doc.contents;
  if (!yaml.isMap(root)) return diagnostics;
  const slavesNode = root.get('slaves', true);
  if (!yaml.isSeq(slavesNode)) return diagnostics;

  data.slaves.forEach((slave: any, sIndex: number) => {
    if (!slave || typeof slave !== 'object') return;
    const slaveKey = Object.keys(slave)[0];
    const slaveValues = slave[slaveKey];
    if (!slaveValues || typeof slaveValues !== 'object' || !Array.isArray(slaveValues.tasks)) return;

    // Validate task_count
    const actualTaskCount = slaveValues.tasks.length;
    if (slaveValues.task_count !== undefined && slaveValues.task_count !== actualTaskCount) {
      const range = getFieldRange(document, doc, ['slaves', sIndex, slaveKey, 'task_count']);
      if (range) {
        diagnostics.push(new vscode.Diagnostic(
          range,
          `task_count should be ${actualTaskCount}, got ${slaveValues.task_count}`,
          vscode.DiagnosticSeverity.Error,
        ));
        diagnostics[diagnostics.length - 1].source = 'ethercat-task-editor';
        diagnostics[diagnostics.length - 1].code = 'offset-mismatch';
      }
    }

    let pdoread_offset = 0;
    let pdowrite_offset = 0;
    let sdoLen = 1;

    slaveValues.tasks.forEach((task: any, tIndex: number) => {
      if (!task || typeof task !== 'object') return;
      const taskKey = Object.keys(task)[0];
      const taskValues = task[taskKey] as Record<string, any>;
      if (!taskValues || typeof taskValues !== 'object') return;

      const pathBase = ['slaves', sIndex, slaveKey, 'tasks', tIndex, taskKey];

      // Validate pdoread_offset
      if (taskValues.pdoread_offset !== undefined && taskValues.pdoread_offset !== pdoread_offset) {
        const range = getFieldRange(document, doc, [...pathBase, 'pdoread_offset']);
        if (range) {
          const d = new vscode.Diagnostic(
            range,
            `pdoread_offset should be ${pdoread_offset}, got ${taskValues.pdoread_offset}`,
            vscode.DiagnosticSeverity.Error,
          );
          d.source = 'ethercat-task-editor';
          d.code = 'offset-mismatch';
          diagnostics.push(d);
        }
      }

      // Validate pdowrite_offset
      if (taskValues.pdowrite_offset !== undefined && taskValues.pdowrite_offset !== pdowrite_offset) {
        const range = getFieldRange(document, doc, [...pathBase, 'pdowrite_offset']);
        if (range) {
          const d = new vscode.Diagnostic(
            range,
            `pdowrite_offset should be ${pdowrite_offset}, got ${taskValues.pdowrite_offset}`,
            vscode.DiagnosticSeverity.Error,
          );
          d.source = 'ethercat-task-editor';
          d.code = 'offset-mismatch';
          diagnostics.push(d);
        }
      }

      // Accumulate sdo_len
      for (const fieldName of Object.keys(taskValues)) {
        if (!fieldName.startsWith('sdowrite_')) continue;
        const fieldNode = doc.getIn([...pathBase, fieldName], true);
        if (!yaml.isScalar(fieldNode)) continue;
        const tag = (fieldNode as yaml.Scalar).tag;
        if (tag === '!uint8_t' || tag === '!int8_t') sdoLen += 1;
        else if (tag === '!uint16_t' || tag === '!int16_t') sdoLen += 2;
        else if (tag === '!uint32_t' || tag === '!int32_t' || tag === '!float') sdoLen += 4;
      }

      // Advance offsets
      const type = Number(taskValues.sdowrite_task_type);
      const taskDef = TaskRegistry.getTask(type);
      if (taskDef) {
        pdoread_offset += taskDef.calculateTxPdoSize(taskValues);
        pdowrite_offset += taskDef.calculateRxPdoSize(taskValues);

        // Field validation (normalize hex strings to numbers for visible_when checks)
        const normalized = normalizeTaskData(taskValues);
        validateTaskFields(document, doc, pathBase, taskKey, normalized, taskDef, diagnostics);
      }
    });

    // Validate sdo_len
    if (slaveValues.sdo_len !== undefined && slaveValues.sdo_len !== sdoLen) {
      const range = getFieldRange(document, doc, ['slaves', sIndex, slaveKey, 'sdo_len']);
      if (range) {
        const d = new vscode.Diagnostic(
          range,
          `sdo_len should be ${sdoLen}, got ${slaveValues.sdo_len}`,
          vscode.DiagnosticSeverity.Error,
        );
        d.source = 'ethercat-task-editor';
        d.code = 'offset-mismatch';
        diagnostics.push(d);
      }
    }
  });

  return diagnostics;
}

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

function validateTaskFields(
  document: vscode.TextDocument,
  doc: yaml.Document,
  pathBase: (string | number)[],
  _taskKey: string,
  taskValues: Record<string, any>,
  taskDef: TaskBase,
  diagnostics: vscode.Diagnostic[],
): void {
  const expectedKeys = new Set(taskDef.getExpectedFields(taskValues));
  const actualFields = new Set(
    Object.keys(taskValues).filter((k) => !k.startsWith('_')),
  );

  // Check required structural fields based on has_read/has_write
  const config = taskDef.getConfig();
  const requiredStructural: string[] = [];
  if (config.has_read) {
    requiredStructural.push(...Object.keys(READ_FIELDS));
  }
  if (config.has_write) {
    requiredStructural.push(...Object.keys(WRITE_FIELDS));
  }
  const missingStructural: string[] = [];
  for (const key of requiredStructural) {
    if (!actualFields.has(key)) {
      missingStructural.push(key);
    }
  }

  // Missing task-specific fields
  const missingFields: string[] = [];
  for (const key of expectedKeys) {
    if (!actualFields.has(key)) {
      missingFields.push(key);
    }
  }

  // Extra fields (sdowrite_*/conf_* not in expected set)
  const extraFields: string[] = [];
  for (const key of actualFields) {
    if (STRUCTURAL_FIELDS.has(key)) continue;
    if (expectedKeys.has(key)) continue;
    if (key.startsWith('sdowrite_') || key.startsWith('conf_')) {
      extraFields.push(key);
    }
  }

  // Report missing fields — range on task key
  if (missingStructural.length > 0) {
    const range = getFieldRange(document, doc, pathBase);
    if (range) {
      const d = new vscode.Diagnostic(
        range,
        `Missing required field${missingStructural.length > 1 ? 's' : ''}: ${missingStructural.join(', ')}`,
        vscode.DiagnosticSeverity.Error,
      );
      d.source = 'ethercat-task-editor';
      d.code = 'field-mismatch';
      diagnostics.push(d);
    }
  }

  if (missingFields.length > 0) {
    const range = getFieldRange(document, doc, pathBase);
    if (range) {
      const d = new vscode.Diagnostic(
        range,
        `Missing field${missingFields.length > 1 ? 's' : ''}: ${missingFields.join(', ')}`,
        vscode.DiagnosticSeverity.Error,
      );
      d.source = 'ethercat-task-editor';
      d.code = 'field-mismatch';
      diagnostics.push(d);
    }
  }

  // Report extra fields — range on each extra field
  for (const key of extraFields) {
    const range = getFieldRange(document, doc, [...pathBase, key]);
    if (range) {
      const d = new vscode.Diagnostic(
        range,
        `Unexpected field: ${key}`,
        vscode.DiagnosticSeverity.Warning,
      );
      d.source = 'ethercat-task-editor';
      d.code = 'field-mismatch';
      diagnostics.push(d);
    }
  }
}

function getFieldRange(
  document: vscode.TextDocument,
  doc: yaml.Document,
  path: (string | number)[],
): vscode.Range | null {
  try {
    const node = doc.getIn(path, true);
    if (!node) return null;

    // Scalar node — return its range directly
    if (yaml.isScalar(node) && node.range) {
      return new vscode.Range(
        document.positionAt(node.range[0]),
        document.positionAt(node.range[1]),
      );
    }

    // Map/Pair node — use the key's range for task-level diagnostics
    if (yaml.isMap(node) && node.items.length > 0) {
      const key = node.items[0].key;
      if (yaml.isScalar(key) && key.range) {
        const line = document.positionAt(key.range[0]).line;
        const lineEnd = document.lineAt(line).range.end;
        return new vscode.Range(
          document.positionAt(key.range[0]),
          lineEnd,
        );
      }
    }

    return null;
  } catch {
    return null;
  }
}
