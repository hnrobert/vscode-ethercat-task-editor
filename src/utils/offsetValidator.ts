import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { TaskRegistry } from '../tasks';

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

function getFieldRange(
  document: vscode.TextDocument,
  doc: yaml.Document,
  path: (string | number)[],
): vscode.Range | null {
  try {
    const node = doc.getIn(path, true);
    if (!node || !yaml.isScalar(node)) return null;
    const range = node.range;
    if (!range) return null;
    return new vscode.Range(
      document.positionAt(range[0]),
      document.positionAt(range[1]),
    );
  } catch {
    return null;
  }
}
