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
    case 'collapseAll':
      document.querySelectorAll('.slave-panel, .task-container').forEach((el) => {
        (el as HTMLDetailsElement).open = false;
      });
      break;
    case 'expandAll':
      document.querySelectorAll('.slave-panel, .task-container').forEach((el) => {
        (el as HTMLDetailsElement).open = true;
      });
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

export function addSlaveAt(sIndex: number) {
  postMessage({ type: 'addSlaveAt', sIndex });
}

export function renameSlave(sIndex: number, newName: string) {
  postMessage({ type: 'renameSlave', sIndex, newName });
}

export function renameSlaveAlias(sIndex: number, newAlias: string) {
  postMessage({ type: 'renameSlaveAlias', sIndex, newAlias });
}

export function removeSlave(sIndex: number) {
  postMessage({ type: 'removeSlave', sIndex });
}

export function addTask(sIndex: number) {
  postMessage({ type: 'addTask', sIndex });
}

export function addTaskAt(sIndex: number, tIndex: number) {
  postMessage({ type: 'addTaskAt', sIndex, tIndex });
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

// --- Drag-and-drop state ---

export type DragState =
  | { type: 'task'; fromSIndex: number; fromTIndex: number }
  | { type: 'slave'; fromSIndex: number }
  | null;

export let dragState: DragState = null;

export function setDragState(state: DragState) {
  dragState = state;
  document.body.classList.toggle('dragging-task', state?.type === 'task');
  document.body.classList.toggle('dragging-slave', state?.type === 'slave');
}

export function moveTask(fromSIndex: number, fromTIndex: number, toSIndex: number, toTIndex: number) {
  postMessage({ type: 'moveTask', fromSIndex, fromTIndex, toSIndex, toTIndex });
}

export function moveSlave(fromIndex: number, toIndex: number) {
  postMessage({ type: 'moveSlave', fromIndex, toIndex });
}
