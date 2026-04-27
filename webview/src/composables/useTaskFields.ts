/**
 * Task Field Composable
 * 处理 task 字段的定义、验证和可见性
 */

import { computed, ComputedRef } from 'vue';
import { data } from './useVscode';

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

export interface TaskType {
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

/**
 * 获取 task 的字段定义
 */
export function useTaskFields(
  taskTypeId: ComputedRef<number | undefined>
): ComputedRef<FieldDefinition[]> {
  return computed(() => {
    if (!taskTypeId.value) return [];

    // 这里需要从后端获取字段定义
    // 暂时返回空数组，后续会通过 message passing 从后端获取
    return [];
  });
}

/**
 * 检查字段是否可见
 */
export function useFieldVisibility(
  fieldKey: ComputedRef<string>,
  taskPath: ComputedRef<(string | number)[]>
): ComputedRef<boolean> {
  return computed(() => {
    const path = taskPath.value;
    if (path.length < 6) return true;

    const sIndex = path[1] as number;
    const sKey = path[2] as string;
    const tIndex = path[4] as number;
    const tKey = path[5] as string;

    const taskData = data.value?.slaves?.[sIndex]?.[sKey]?.tasks?.[tIndex]?.[tKey];
    if (!taskData) return true;

    // 这里需要调用后端的 isFieldVisible 方法
    // 暂时返回 true，后续会实现
    return true;
  });
}

/**
 * 获取字段的有效选项
 */
export function useFieldOptions(
  fieldKey: ComputedRef<string>,
  taskPath: ComputedRef<(string | number)[]>
): ComputedRef<FieldOption[]> {
  return computed(() => {
    const path = taskPath.value;
    if (path.length < 6) return [];

    const sIndex = path[1] as number;
    const sKey = path[2] as string;
    const tIndex = path[4] as number;
    const tKey = path[5] as string;

    const taskData = data.value?.slaves?.[sIndex]?.[sKey]?.tasks?.[tIndex]?.[tKey];
    if (!taskData) return [];

    // 这里需要调用后端的 getValidOptions 方法
    // 暂时返回空数组，后续会实现
    return [];
  });
}

/**
 * 验证字段值
 */
export function useFieldValidation(
  fieldKey: ComputedRef<string>,
  fieldValue: ComputedRef<any>,
  taskPath: ComputedRef<(string | number)[]>
): ComputedRef<ValidationError | null> {
  return computed(() => {
    const path = taskPath.value;
    if (path.length < 6) return null;

    const sIndex = path[1] as number;
    const sKey = path[2] as string;
    const tIndex = path[4] as number;
    const tKey = path[5] as string;

    const taskData = data.value?.slaves?.[sIndex]?.[sKey]?.tasks?.[tIndex]?.[tKey];
    if (!taskData) return null;

    // 这里需要调用后端的 validate 方法
    // 暂时返回 null，后续会实现
    return null;
  });
}
