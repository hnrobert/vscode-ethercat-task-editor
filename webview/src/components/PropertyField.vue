<template>
  <div v-if="isVisible" class="prop-row" :class="{ 'has-error': validationError }">
    <div class="prop-label-container">
      <label class="prop-label" :title="fieldDef?.help">
        {{ displayLabel }}
        <span v-if="fieldDef?.help" class="help-icon">?</span>
      </label>
      <span v-if="validationError" class="error-message">{{ validationError.message }}</span>
    </div>

    <!-- Task Type Selector -->
    <select
      v-if="prop === 'sdowrite_task_type'"
      class="prop-select"
      :value="String(val)"
      @change="onTaskTypeChange"
    >
      <option v-for="ty in taskTypes" :key="ty.id" :value="ty.id">
        {{ ty.id }} - {{ ty.name }}
      </option>
    </select>

    <!-- Boolean Field -->
    <select
      v-else-if="fieldDef?.type === 'select' && typeof val === 'boolean'"
      class="prop-select"
      :value="String(val)"
      @change="onBooleanChange"
    >
      <option value="true">true</option>
      <option value="false">false</option>
    </select>

    <!-- Select Field with Options -->
    <select
      v-else-if="fieldDef?.type === 'select' && fieldDef.options"
      class="prop-select"
      :value="String(normalizedValue)"
      @change="onSelectChange"
    >
      <option
        v-for="option in validOptions"
        :key="option.value"
        :value="String(option.value)"
        :title="option.description"
      >
        {{ option.label }}
      </option>
    </select>

    <!-- Radio Field with Options -->
    <div v-else-if="fieldDef?.type === 'radio' && fieldDef.options" class="radio-group">
      <label
        v-for="option in validOptions"
        :key="option.value"
        class="radio-option"
        :title="option.description"
      >
        <input
          type="radio"
          :name="`radio-${path.join('-')}-${prop}`"
          :value="option.value"
          :checked="normalizedValue === option.value"
          @change="onRadioChange(option.value)"
        />
        <span>{{ option.label }}</span>
      </label>
    </div>

    <!-- Number Field -->
    <input
      v-else-if="fieldDef?.type === 'number'"
      type="number"
      class="prop-input"
      :value="val"
      :min="fieldDef.min"
      :max="fieldDef.max"
      :step="fieldDef.data_type === 'float' ? 'any' : '1'"
      @change="onInputChange"
    />

    <!-- Hex Field -->
    <input
      v-else-if="fieldDef?.type === 'hex'"
      type="text"
      class="prop-input"
      :value="formatHex(val)"
      @change="onHexChange"
      placeholder="0x..."
    />

    <!-- Text Field -->
    <input
      v-else-if="fieldDef?.type === 'text'"
      type="text"
      class="prop-input"
      :value="val"
      @change="onInputChange"
    />

    <!-- Fallback: Generic Input -->
    <input
      v-else
      type="text"
      class="prop-input"
      :value="val"
      @change="onInputChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  taskTypes,
  updateValue,
  data,
  taskFieldsCache,
  type FieldDefinition,
  type FieldOption,
  type ValidationError,
} from '../composables/useVscode';

const props = defineProps<{
  path: (string | number)[];
  prop: string;
  val: any;
}>();

// 获取当前 task 的数据
const taskData = computed(() => {
  if (props.path.length < 6) return null;

  const sIndex = props.path[1] as number;
  const sKey = props.path[2] as string;
  const tIndex = props.path[4] as number;
  const tKey = props.path[5] as string;

  return data.value?.slaves?.[sIndex]?.[sKey]?.tasks?.[tIndex]?.[tKey];
});

// 获取当前 task type
const taskTypeId = computed(() => {
  return taskData.value?.sdowrite_task_type;
});

// 获取字段定义
const fieldDef = computed<FieldDefinition | undefined>(() => {
  if (!taskTypeId.value) return undefined;

  // 首先尝试从 taskTypes 中获取（已经包含了字段定义）
  const taskType = taskTypes.value.find(t => t.id === taskTypeId.value);
  if (taskType?.fields) {
    return taskType.fields.find(f => f.key === props.prop);
  }

  // 如果没有，尝试从缓存中获取
  const fields = taskFieldsCache.value.get(taskTypeId.value);
  if (fields) {
    return fields.find(f => f.key === props.prop);
  }

  return undefined;
});

// 显示标签
const displayLabel = computed(() => {
  return fieldDef.value?.label || props.prop;
});

// 标准化当前值为数字（用于比较）
const normalizedValue = computed(() => {
  if (typeof props.val === 'string' && props.val.startsWith('0x')) {
    return parseInt(props.val, 16);
  } else if (typeof props.val === 'string') {
    const num = Number(props.val);
    return isNaN(num) ? props.val : num;
  }
  return props.val;
});

// 检查字段是否可见
const isVisible = computed(() => {
  // 如果没有字段定义，显示所有字段
  if (!fieldDef.value) {
    return true;
  }

  // 如果没有 taskData，默认可见
  if (!taskData.value) {
    return true;
  }

  // 如果字段没有 visible_when，默认可见
  if (!fieldDef.value.has_visible_when) {
    return true;
  }

  // 使用硬编码的逻辑（用于向后兼容和性能）
  // motor fields 只在 motor 启用时显示
  const motorMatch = props.prop.match(/motor(\d+)/);
  if (motorMatch) {
    const motorIndex = motorMatch[1];
    const canIdKey = `sdowrite_motor${motorIndex}_can_id`;
    const canId = taskData.value[canIdKey];

    // 如果是 motor 的 can_id 字段，总是显示
    if (props.prop === canIdKey) {
      return true;
    }

    // 其他 motor 字段只在 can_id != 0 时显示
    if (canId === 0 || canId === undefined) {
      return false;
    }

    // 检查 control_type 相关的可见性
    const controlTypeKey = `sdowrite_motor${motorIndex}_control_type`;
    const controlType = taskData.value[controlTypeKey];

    // Speed PID 字段只在 control_type >= 2 时显示
    if (props.prop.includes('speed_pid') && controlType < 2) {
      return false;
    }

    // Angle PID 字段只在 control_type >= 3 时显示
    if (props.prop.includes('angle_pid') && controlType < 3) {
      return false;
    }
  }

  return true;
});

// 获取有效选项
const validOptions = computed<FieldOption[]>(() => {
  if (!fieldDef.value?.options) {
    return [];
  }

  if (!taskData.value) {
    return fieldDef.value.options || [];
  }

  // 将当前值转换为数字（如果是十六进制字符串）
  let currentNumValue = props.val;
  if (typeof props.val === 'string' && props.val.startsWith('0x')) {
    currentNumValue = parseInt(props.val, 16);
  } else if (typeof props.val === 'string') {
    currentNumValue = Number(props.val);
  }

  // 过滤选项：使用硬编码逻辑（因为函数无法序列化）
  const filtered = fieldDef.value.options.filter(option => {
    // 如果选项没有 valid_when，总是有效
    if (!option.has_valid_when) {
      return true;
    }

    // 硬编码的过滤逻辑（针对 DJI Motor CAN ID）
    if (props.prop.includes('motor') && props.prop.includes('_can_id')) {
      let packetId = taskData.value.sdowrite_can_packet_id;

      // 标准化 packetId 为数字
      if (typeof packetId === 'string' && packetId.startsWith('0x')) {
        packetId = parseInt(packetId, 16);
      } else if (typeof packetId === 'string') {
        packetId = Number(packetId);
      }

      // 0x201-0x204 只在 packet_id === 0x200 时有效
      if ([0x201, 0x202, 0x203, 0x204].includes(option.value)) {
        return packetId === 0x200;
      }

      // 0x205-0x207 在多个 packet_id 时有效
      if ([0x205, 0x206, 0x207].includes(option.value)) {
        return [0x1ff, 0x2ff, 0x1fe, 0x2fe].includes(packetId);
      }

      // 0x208 只在特定 packet_id 时有效
      if (option.value === 0x208) {
        return [0x1ff, 0x1fe].includes(packetId);
      }
    }

    return true;
  });

  // 如果当前值不在有效选项中，添加它（避免选择框为空）
  const currentValueInOptions = filtered.some(opt => opt.value === currentNumValue);
  if (!currentValueInOptions && currentNumValue !== undefined && currentNumValue !== null && !isNaN(currentNumValue)) {
    // 从所有选项中找到当前值的选项
    const currentOption = fieldDef.value.options.find(opt => opt.value === currentNumValue);
    if (currentOption) {
      filtered.push(currentOption);
    }
  }

  return filtered;
});

// 验证错误
const validationError = computed<ValidationError | null>(() => {
  if (!fieldDef.value || !taskData.value) return null;

  const field = fieldDef.value;
  const value = props.val;

  // 检查必填字段
  if (value === undefined || value === null || value === '') {
    if (field.default === undefined) {
      return {
        field: field.key,
        message: 'Required',
        severity: 'error',
      };
    }
  }

  // 检查数值范围
  if (field.type === 'number' && typeof value === 'number') {
    if (field.min !== undefined && value < field.min) {
      return {
        field: field.key,
        message: `Min: ${field.min}`,
        severity: 'error',
      };
    }
    if (field.max !== undefined && value > field.max) {
      return {
        field: field.key,
        message: `Max: ${field.max}`,
        severity: 'error',
      };
    }
  }

  return null;
});

// 格式化十六进制值
function formatHex(value: any): string {
  if (typeof value === 'number') {
    return '0x' + value.toString(16).toUpperCase();
  }
  return String(value || '');
}

// 事件处理
function onTaskTypeChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  updateValue(props.path, Number(target.value));
}

function onBooleanChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  updateValue(props.path, target.value === 'true');
}

function onSelectChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  const value = target.value;

  // 尝试转换为数字（因为 HTML select 总是返回字符串）
  const numValue = Number(value);
  if (!isNaN(numValue) && value !== '') {
    updateValue(props.path, numValue);
  } else {
    updateValue(props.path, value);
  }
}

function onRadioChange(value: any) {
  // Radio 的 value 已经是正确的类型
  updateValue(props.path, value);
}

function onInputChange(e: Event) {
  const target = e.target as HTMLInputElement;
  let value: any = target.value;

  if (fieldDef.value?.type === 'number') {
    value = fieldDef.value.data_type === 'float' ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(value)) return;
  }

  updateValue(props.path, value);
}

function onHexChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const value = target.value.trim();

  if (value.toLowerCase().startsWith('0x')) {
    const numValue = parseInt(value, 16);
    if (!isNaN(numValue)) {
      updateValue(props.path, numValue);
    }
  } else {
    const numValue = parseInt(value, 16);
    if (!isNaN(numValue)) {
      updateValue(props.path, numValue);
    }
  }
}
</script>

<style scoped>
.prop-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.prop-row.has-error {
  background: rgba(255, 0, 0, 0.05);
}

.prop-label-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.prop-label {
  font-size: 12px;
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: help;
}

.help-icon {
  display: inline-block;
  width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;
  border-radius: 50%;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-size: 10px;
  font-weight: bold;
}

.error-message {
  font-size: 11px;
  color: var(--vscode-errorForeground);
}

.prop-input,
.prop-select {
  width: 100%;
  padding: 4px 8px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  font-size: 12px;
}

.prop-input:focus,
.prop-select:focus {
  outline: 1px solid var(--vscode-focusBorder);
}

.has-error .prop-input,
.has-error .prop-select {
  border-color: var(--vscode-inputValidation-errorBorder);
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  cursor: pointer;
  font-size: 12px;
}

.radio-option:hover {
  background: var(--vscode-list-hoverBackground);
}

.radio-option input[type="radio"] {
  cursor: pointer;
}

.radio-option span {
  flex: 1;
}
</style>
