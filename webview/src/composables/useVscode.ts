import { ref } from 'vue';

const vscode = acquireVsCodeApi();

export const data = ref<any>(null);
export const errorMessage = ref<string | null>(null);
export const taskTypes = ref<{ label: string; description: string; value: string }[]>([]);

// Runtime memory: slaveName -> taskName -> taskTypeValue -> { prop: value }
const taskTypeMemory = new Map<string, Map<string, Map<number, Record<string, any>>>>();

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'updateData':
      data.value = message.data;
      taskTypes.value = message.taskTypes || [];
      errorMessage.value = null;
      break;
    case 'setError':
      errorMessage.value = message.message;
      data.value = null;
      break;
  }
});

export function postMessage(msg: any) {
  vscode.postMessage(msg);
}

// --- Task type memory helpers ---

function saveTaskTypeState(
  slaveName: string,
  taskName: string,
  taskType: number,
  values: Record<string, any>,
) {
  let slaveMap = taskTypeMemory.get(slaveName);
  if (!slaveMap) {
    slaveMap = new Map();
    taskTypeMemory.set(slaveName, slaveMap);
  }
  let taskMap = slaveMap.get(taskName);
  if (!taskMap) {
    taskMap = new Map();
    slaveMap.set(taskName, taskMap);
  }
  taskMap.set(taskType, { ...values });
}

function getSavedTaskTypeState(
  slaveName: string,
  taskName: string,
  taskType: number,
): Record<string, any> | null {
  return taskTypeMemory.get(slaveName)?.get(taskName)?.get(taskType) ?? null;
}

/**
 * Called when user changes sdowrite_task_type in a dropdown.
 * Saves current task properties under the old type, then sends
 * the new type together with any previously-saved values for it.
 */
export function changeTaskType(path: (string | number)[], newType: number) {
  const sKey = path[2] as string; // slave name
  const tKey = path[5] as string; // task name
  const sIndex = path[1] as number;
  const tIndex = path[4] as number;

  const currentData = data.value;
  const taskData: Record<string, any> | undefined =
    currentData?.slaves?.[sIndex]?.[sKey]?.tasks?.[tIndex]?.[tKey];

  if (!taskData) {
    // Fallback: just send the value change without memory
    updateValue(path, newType);
    return;
  }

  const oldType = Number(taskData.sdowrite_task_type);

  // Snapshot current values for the old type (exclude computed offsets)
  const valuesToSave: Record<string, any> = {};
  for (const [key, val] of Object.entries(taskData)) {
    if (key !== 'pdoread_offset' && key !== 'pdowrite_offset') {
      valuesToSave[key] = val;
    }
  }
  saveTaskTypeState(sKey, tKey, oldType, valuesToSave);

  // Restore any previously-saved values for the target type
  const savedValues = getSavedTaskTypeState(sKey, tKey, newType);

  postMessage({
    type: 'updateValue',
    path,
    value: newType,
    savedTaskTypeValues: savedValues,
  });
}

// --- Actions ---

export function addSlave() {
  const name = prompt('Enter new slave name (e.g., sn1234567):', 'sn0000000');
  if (name) postMessage({ type: 'addSlave', name });
}

export function renameSlave(sIndex: number, oldName: string) {
  const name = prompt('Rename slave:', oldName);
  if (name && name !== oldName) {
    // Migrate memory to new name
    const mem = taskTypeMemory.get(oldName);
    if (mem) {
      taskTypeMemory.delete(oldName);
      taskTypeMemory.set(name, mem);
    }
    postMessage({ type: 'renameSlave', sIndex, newName: name });
  }
}

export function removeSlave(sIndex: number) {
  if (confirm('Remove this entire slave?')) {
    postMessage({ type: 'removeSlave', sIndex });
  }
}

export function addTask(sIndex: number) {
  const name = prompt('Enter new task name (e.g., app_1):', 'app_x');
  if (name) postMessage({ type: 'addTask', sIndex, taskName: name });
}

export function renameTask(sIndex: number, tIndex: number, oldName: string) {
  const name = prompt('Rename task:', oldName);
  if (name && name !== oldName) {
    // Migrate memory for this task under the slave
    const currentData = data.value;
    if (currentData?.slaves?.[sIndex]) {
      const slaveName = Object.keys(currentData.slaves[sIndex])[0];
      const slaveMem = taskTypeMemory.get(slaveName);
      if (slaveMem?.has(oldName)) {
        const taskMem = slaveMem.get(oldName)!;
        slaveMem.delete(oldName);
        slaveMem.set(name, taskMem);
      }
    }
    postMessage({ type: 'renameTask', sIndex, tIndex, newName: name });
  }
}

export function removeTask(sIndex: number, tIndex: number) {
  if (confirm('Remove this task?')) {
    postMessage({ type: 'removeTask', sIndex, tIndex });
  }
}

export function updateValue(path: (string | number)[], value: any) {
  postMessage({ type: 'updateValue', path, value });
}
