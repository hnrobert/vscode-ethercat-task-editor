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

function postMessage(msg: any) {
  vscode.postMessage(msg);
}

// --- Actions: delegate dialogs to backend ---

export function addSlave() {
  postMessage({ type: 'addSlave' });
}

export function renameSlave(sIndex: number, newName: string) {
  postMessage({ type: 'renameSlave', sIndex, newName });
}

export function removeSlave(sIndex: number) {
  postMessage({ type: 'removeSlave', sIndex });
}

export function addTask(sIndex: number) {
  postMessage({ type: 'addTask', sIndex });
}

export function renameTask(sIndex: number, tIndex: number, newSegment: string) {
  postMessage({ type: 'renameTask', sIndex, tIndex, newSegment });
}

export function removeTask(sIndex: number, tIndex: number) {
  postMessage({ type: 'removeTask', sIndex, tIndex });
}

export function updateValue(path: (string | number)[], value: any) {
  postMessage({ type: 'updateValue', path, value });
}
