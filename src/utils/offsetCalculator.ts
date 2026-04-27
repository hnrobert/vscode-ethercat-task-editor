import * as yaml from 'yaml';
import { MsgField } from './msgParser';
import { TaskRegistry } from '../tasks';

export function maintainYamlSpacing(doc: yaml.Document): void {
  const contents = doc.contents;
  if (!yaml.isMap(contents)) return;

  const slavesNode = contents.get('slaves', true);
  if (!yaml.isSeq(slavesNode)) return;

  // console.log('[maintainYamlSpacing] Processing', slavesNode.items.length, 'slaves');

  slavesNode.items.forEach((slaveItem: any, sIndex: number) => {
    if (!yaml.isMap(slaveItem)) return;

    // Add spacing between slaves
    if (sIndex > 0) {
      slaveItem.spaceBefore = true;
      // console.log('[maintainYamlSpacing] Set spaceBefore=true for slave', sIndex);
    }

    // Find the tasks node within this slave
    for (const pair of slaveItem.items) {
      if (!yaml.isPair(pair)) continue;
      const slaveValue = pair.value;
      if (!yaml.isMap(slaveValue)) continue;

      // Find tasks pair
      for (const slavePair of slaveValue.items) {
        if (!yaml.isPair(slavePair)) continue;
        if (yaml.isScalar(slavePair.key) && slavePair.key.value === 'tasks') {
          const tasksNode = slavePair.value;
          if (!yaml.isSeq(tasksNode)) continue;

          // Set spaceBefore on the tasks pair itself (the key-value pair)
          (slavePair as any).spaceBefore = true;
          // console.log('[maintainYamlSpacing] Set spaceBefore=true on tasks pair in slave', sIndex);

          // Ensure first task has NO blank line after tasks:
          if (tasksNode.items.length > 0) {
            (tasksNode.items[0] as any).spaceBefore = false;
            // console.log('[maintainYamlSpacing] Set spaceBefore=false for first task in slave', sIndex);

            // Add spacing between subsequent tasks
            for (let tIndex = 1; tIndex < tasksNode.items.length; tIndex++) {
              (tasksNode.items[tIndex] as any).spaceBefore = true;
              // console.log('[maintainYamlSpacing] Set spaceBefore=true for task', tIndex, 'in slave', sIndex);
            }
          }
        }
      }
    }
  });

  // console.log('[maintainYamlSpacing] Complete');
}

export function calculateOffsets(
  doc: yaml.Document,
  data: any,
  _msgs: Record<string, MsgField[]>,
): void {
  if (!data || typeof data !== 'object' || !Array.isArray(data.slaves)) return;

  data.slaves.forEach((slave: any, index: number) => {
    if (!slave || typeof slave !== 'object') return;
    const slaveKey = Object.keys(slave)[0];
    const slaveValues = slave[slaveKey];
    if (
      !slaveValues ||
      typeof slaveValues !== 'object' ||
      !Array.isArray(slaveValues.tasks)
    )
      return;

    // Update task_count to match actual tasks length
    const actualTaskCount = slaveValues.tasks.length;
    const recordedTaskCount = slaveValues.task_count;
    if (recordedTaskCount !== actualTaskCount) {
      doc.setIn(['slaves', index, slaveKey, 'task_count'], actualTaskCount);
    }

    let pdoread_offset = 0;
    let pdowrite_offset = 0;
    let sdoLen = 1; // +1 for task_count byte

    slaveValues.tasks.forEach((task: any, taskIndex: number) => {
      if (!task || typeof task !== 'object') return;
      const taskKey = Object.keys(task)[0];
      const taskValues = task[taskKey] as Record<string, any>;
      if (!taskValues || typeof taskValues !== 'object') return;

      const pathBase = ['slaves', index, slaveKey, 'tasks', taskIndex, taskKey];

      if (taskValues.pdoread_offset !== undefined) {
        taskValues.pdoread_offset = pdoread_offset;
        doc.setIn([...pathBase, 'pdoread_offset'], pdoread_offset);
      }
      if (taskValues.pdowrite_offset !== undefined) {
        taskValues.pdowrite_offset = pdowrite_offset;
        doc.setIn([...pathBase, 'pdowrite_offset'], pdowrite_offset);
      }

      // Accumulate sdo_len: sum sdowrite_* field sizes by YAML type tag
      for (const fieldName of Object.keys(taskValues)) {
        if (!fieldName.startsWith('sdowrite_')) continue;
        const fieldNode = doc.getIn([...pathBase, fieldName], true);
        if (!yaml.isScalar(fieldNode)) continue;
        const tag = (fieldNode as yaml.Scalar).tag;
        if (tag === '!uint8_t' || tag === '!int8_t') sdoLen += 1;
        else if (tag === '!uint16_t' || tag === '!int16_t') sdoLen += 2;
        else if (tag === '!uint32_t' || tag === '!int32_t' || tag === '!float')
          sdoLen += 4;
      }

      const type = Number(taskValues.sdowrite_task_type);
      const taskDef = TaskRegistry.getTask(type);
      if (taskDef) {
        pdoread_offset += taskDef.calculateTxPdoSize(taskValues);
        pdowrite_offset += taskDef.calculateRxPdoSize(taskValues);
      }
    });

    doc.setIn(['slaves', index, slaveKey, 'sdo_len'], sdoLen);
  });

  // Maintain spacing after offset calculation
  maintainYamlSpacing(doc);
}
