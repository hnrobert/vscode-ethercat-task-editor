import { ref } from 'vue';

const vscode = acquireVsCodeApi();

export const data = ref<any>(null);
export const errorMessage = ref<string | null>(null);
export const taskTypes = ref<{ label: string; description: string; value: string }[]>([]);

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

export function addSlave() {
  const name = prompt('Enter new slave name (e.g., sn1234567):', 'sn0000000');
  if (name) postMessage({ type: 'addSlave', name });
}

export function renameSlave(sIndex: number, oldName: string) {
  const name = prompt('Rename slave:', oldName);
  if (name && name !== oldName) postMessage({ type: 'renameSlave', sIndex, newName: name });
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
  if (name && name !== oldName) postMessage({ type: 'renameTask', sIndex, tIndex, newName: name });
}

export function removeTask(sIndex: number, tIndex: number) {
  if (confirm('Remove this task?')) {
    postMessage({ type: 'removeTask', sIndex, tIndex });
  }
}

export function updateValue(path: (string | number)[], value: any) {
  postMessage({ type: 'updateValue', path, value });
}
