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

    <!-- Connection Lost Action Fields -->
    <select
      v-else-if="prop === 'conf_connection_lost_read_action' || prop === 'sdowrite_connection_lost_write_action'"
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
      <template v-for="(option, idx) in validOptions" :key="option.value">
        <div v-if="option.group && (idx === 0 || validOptions[idx - 1].group !== option.group)" class="radio-group-divider">
          {{ option.group }}
        </div>
        <label
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
      </template>
    </div>

    <!-- Number Field -->
    <input
      v-else-if="fieldDef?.type === 'number' && !fieldDef?.is_hex"
      type="number"
      class="prop-input"
      :value="val"
      :min="fieldDef.min"
      :max="fieldDef.max"
      :step="fieldDef.data_type === 'float' ? 'any' : '1'"
      :disabled="isDisabled"
      @change="onInputChange"
    />

    <!-- Hex Field -->
    <input
      v-else-if="fieldDef?.type === 'number' && fieldDef?.is_hex"
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
  // 特殊字段的显示标签
  const specialLabels: Record<string, string> = {
    'sdowrite_task_type': 'Task Type',
    'conf_connection_lost_read_action': 'Connection Lost Read Action',
    'sdowrite_connection_lost_write_action': 'Connection Lost Write Action',
  };

  if (props.prop in specialLabels) {
    return specialLabels[props.prop];
  }

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

  // 使用后端预计算的可见性
  if (taskData.value._fieldVisibility && props.prop in taskData.value._fieldVisibility) {
    return taskData.value._fieldVisibility[props.prop];
  }

  // 如果字段没有 visible_when，默认可见
  if (!fieldDef.value.has_visible_when) {
    return true;
  }

  // 后备：默认可见
  return true;
});

// 检查字段是否禁用
const isDisabled = computed(() => {
  if (!fieldDef.value || !taskData.value) return false;
  if (!fieldDef.value.has_disabled_when) return false;
  if (taskData.value._fieldDisabled && props.prop in taskData.value._fieldDisabled) {
    return taskData.value._fieldDisabled[props.prop];
  }
  return false;
});

// 获取有效选项
const validOptions = computed<FieldOption[]>(() => {
  // 特殊字段的选项定义
  const specialFieldOptions: Record<string, FieldOption[]> = {
    'conf_connection_lost_read_action': [
      { value: 1, label: 'Keep Last', description: 'Keep last value when connection is lost' },
      { value: 2, label: 'Reset to Default', description: 'Reset to default value when connection is lost' },
    ],
    'sdowrite_connection_lost_write_action': [
      { value: 1, label: 'Keep Last', description: 'Keep last value when connection is lost' },
      { value: 2, label: 'Reset to Default', description: 'Reset to default value when connection is lost' },
    ],
  };

  // 如果是特殊字段，返回预定义的选项
  if (props.prop in specialFieldOptions) {
    return specialFieldOptions[props.prop];
  }

  if (!fieldDef.value?.options) {
    return [];
  }

  if (!taskData.value) {
    return fieldDef.value.options || [];
  }

  // 使用后端预计算的有效选项
  if (taskData.value._fieldValidOptions && props.prop in taskData.value._fieldValidOptions) {
    const validOpts = taskData.value._fieldValidOptions[props.prop];

    // 将当前值转换为数字（如果是十六进制字符串）
    let currentNumValue = props.val;
    if (typeof props.val === 'string' && props.val.startsWith('0x')) {
      currentNumValue = parseInt(props.val, 16);
    } else if (typeof props.val === 'string') {
      currentNumValue = Number(props.val);
    }

    // 如果当前值不在有效选项中，添加它（避免选择框为空）
    const currentValueInOptions = validOpts.some((opt: any) => opt.value === currentNumValue);
    if (!currentValueInOptions && currentNumValue !== undefined && currentNumValue !== null && !isNaN(currentNumValue)) {
      const currentOption = fieldDef.value.options.find(opt => opt.value === currentNumValue);
      if (currentOption) {
        return [...validOpts, currentOption];
      }
    }

    return validOpts;
  }

  // 后备：返回所有选项
  return fieldDef.value.options || [];
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
