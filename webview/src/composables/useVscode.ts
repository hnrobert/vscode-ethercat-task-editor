import { ref } from 'vue';

const vscode = acquireVsCodeApi();

export const data = ref<any>(null);
export const errorMessage = ref<string | null>(null);

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'number' | 'select' | 'radio' | 'hex' | 'text';
  data_type: string;
  default?: any;
  min?: number;
  max?: number;
  group?: string;
  help?: string;
  options?: FieldOption[];
}

export interface FieldOption {
  value: any;
  label: string;
  description?: string;
}

export interface TaskTypeDef {
  id: number;
  name: string;
  has_read: boolean;
  has_write: boolean;
  fields?: FieldDefinition[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export const taskTypes = ref<TaskTypeDef[]>([]);
export const boardTypes = ref<
  { id: number; name: string; max_tx_pdo: number; max_rx_pdo: number }[]
>([]);

// Task fields cache
export const taskFieldsCache = ref<Map<number, FieldDefinition[]>>(new Map());

// Expose event emitter for task type picker
export const taskTypePickerEvent = ref<{
  sIndex: number;
  tIndex: number;
} | null>(null);

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'updateData':
      data.value = message.data;
      taskTypes.value = message.taskTypes || [];
      boardTypes.value = message.boardTypes || [];
      errorMessage.value = null;
      break;
    case 'setError':
      errorMessage.value = message.message;
      data.value = null;
      break;
    case 'collapseAll':
      document
        .querySelectorAll('.slave-panel, .task-container')
        .forEach((el) => {
          (el as HTMLDetailsElement).open = false;
        });
      break;
    case 'expandAll':
      document
        .querySelectorAll('.slave-panel, .task-container')
        .forEach((el) => {
          (el as HTMLDetailsElement).open = true;
        });
      break;
    case 'requestTaskType':
      taskTypePickerEvent.value = {
        sIndex: message.sIndex,
        tIndex: message.tIndex,
      };
      break;
    case 'taskFieldsResponse':
      taskFieldsCache.value.set(message.taskType, message.fields);
      break;
  }
});

function postMessage(msg: any) {
  vscode.postMessage(msg);
}

export { vscode };

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

export function moveTask(
  fromSIndex: number,
  fromTIndex: number,
  toSIndex: number,
  toTIndex: number,
) {
  postMessage({ type: 'moveTask', fromSIndex, fromTIndex, toSIndex, toTIndex });
}

export function moveSlave(fromIndex: number, toIndex: number) {
  postMessage({ type: 'moveSlave', fromIndex, toIndex });
}

// --- Task Field APIs ---

/**
 * 获取 task 的字段定义
 */
export function getTaskFields(taskType: number): FieldDefinition[] {
  // 如果缓存中有，直接返回
  if (taskFieldsCache.value.has(taskType)) {
    return taskFieldsCache.value.get(taskType)!;
  }

  // 否则请求后端
  postMessage({ type: 'getTaskFields', taskType });
  return [];
}

/**
 * 检查字段是否可见
 */
export function isFieldVisible(
  taskType: number,
  fieldKey: string,
  taskData: Record<string, any>
): boolean {
  const fields = taskFieldsCache.value.get(taskType);
  if (!fields) return true;

  const field = fields.find(f => f.key === fieldKey);
  if (!field) return true;

  // 这里需要在前端实现 visible_when 的评估
  // 暂时返回 true
  return true;
}

/**
 * 获取字段的有效选项
 */
export function getValidOptions(
  taskType: number,
  fieldKey: string,
  taskData: Record<string, any>
): FieldOption[] {
  const fields = taskFieldsCache.value.get(taskType);
  if (!fields) return [];

  const field = fields.find(f => f.key === fieldKey);
  if (!field || !field.options) return [];

  // 这里需要在前端实现 valid_when 的过滤
  // 暂时返回所有选项
  return field.options;
}

/**
 * 验证 task 配置
 */
export function validateTask(
  taskType: number,
  taskData: Record<string, any>
): ValidationError[] {
  const fields = taskFieldsCache.value.get(taskType);
  if (!fields) return [];

  const errors: ValidationError[] = [];

  for (const field of fields) {
    const value = taskData[field.key];

    // 检查必填字段
    if (value === undefined || value === null) {
      if (field.default === undefined) {
        errors.push({
          field: field.key,
          message: `Field '${field.label}' is required`,
          severity: 'error',
        });
      }
      continue;
    }

    // 检查数值范围
    if (field.type === 'number' && typeof value === 'number') {
      if (field.min !== undefined && value < field.min) {
        errors.push({
          field: field.key,
          message: `Value ${value} is less than minimum ${field.min}`,
          severity: 'error',
        });
      }
      if (field.max !== undefined && value > field.max) {
        errors.push({
          field: field.key,
          message: `Value ${value} is greater than maximum ${field.max}`,
          severity: 'error',
        });
      }
    }
  }

  return errors;
}
