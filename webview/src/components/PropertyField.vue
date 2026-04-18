<template>
  <div v-if="isVisible" class="prop-row">
    <div class="prop-label">{{ prop }}</div>
    <select
      v-if="prop === 'sdowrite_task_type'"
      class="prop-select"
      :value="String(val)"
      @change="onTaskTypeChange"
    >
      <option
        v-for="ty in taskTypes"
        :key="ty.id"
        :value="ty.id"
      >
        {{ ty.id }} - {{ ty.description }}
      </option>
    </select>
    <select
      v-else-if="typeof val === 'boolean'"
      class="prop-select"
      :value="String(val)"
      @change="onBooleanChange"
    >
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
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
import { taskTypes, updateValue, data } from '../composables/useVscode';

const props = defineProps<{
  path: (string | number)[];
  prop: string;
  val: any;
}>();

// Check if this field should be visible based on ui_config
const isVisible = computed(() => {
  if (
    props.path.length >= 6 &&
    props.path[0] === 'slaves' &&
    props.path[3] === 'tasks'
  ) {
    const sIndex = props.path[1] as number;
    const sKey = props.path[2] as string;
    const tIndex = props.path[4] as number;
    const tKey = props.path[5] as string;

    const taskData = data.value?.slaves?.[sIndex]?.[sKey]?.tasks?.[tIndex]?.[tKey];
    if (taskData?.sdowrite_task_type) {
      const taskType = taskTypes.value.find(
        (t) => t.id === Number(taskData.sdowrite_task_type),
      );

      if (taskType?.ui_config?.field_visibility) {
        for (const rule of taskType.ui_config.field_visibility) {
          // Extract motor index from field name (e.g., motor1 -> 1)
          const motorMatch = props.prop.match(/motor(\d+)/);
          if (motorMatch) {
            const motorIndex = motorMatch[1];
            const pattern = rule.field_pattern.replace('{n}', motorIndex);
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');

            if (regex.test(props.prop)) {
              // Evaluate visible_when condition
              const condition = rule.visible_when.replace('{n}', motorIndex);
              const match = condition.match(/(\w+)\s*([><=]+)\s*(\d+)/);
              if (match) {
                const [, fieldName, operator, value] = match;
                const fieldValue = taskData[fieldName];
                const numValue = Number(value);

                switch (operator) {
                  case '>':
                    return Number(fieldValue) > numValue;
                  case '>=':
                    return Number(fieldValue) >= numValue;
                  case '<':
                    return Number(fieldValue) < numValue;
                  case '<=':
                    return Number(fieldValue) <= numValue;
                  case '==':
                  case '===':
                    return Number(fieldValue) === numValue;
                  default:
                    return true;
                }
              }
            }
          }
        }
      }
    }
  }
  return true;
});

function onTaskTypeChange(e: Event) {
  const value = Number((e.target as HTMLSelectElement).value);
  updateValue(props.path, value);
}

function onBooleanChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value === 'true';
  updateValue(props.path, value);
}

function onInputChange(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  let value: any = raw;
  if (raw.toLowerCase().startsWith('0x')) {
    value = raw;
  } else if (!isNaN(Number(raw))) {
    value = Number(raw);
  }
  updateValue(props.path, value);
}
</script>
