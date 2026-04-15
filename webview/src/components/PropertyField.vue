<template>
  <div class="prop-row">
    <div class="prop-label">{{ prop }}</div>
    <select
      v-if="prop === 'sdowrite_task_type'"
      :value="String(val)"
      @change="onTaskTypeChange"
    >
      <option
        v-for="ty in taskTypes"
        :key="ty.value"
        :value="ty.value"
      >
        {{ ty.label }} - {{ ty.description }}
      </option>
    </select>
    <select
      v-else-if="typeof val === 'boolean'"
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
import { taskTypes, updateValue } from '../composables/useVscode';

const props = defineProps<{
  path: (string | number)[];
  prop: string;
  val: any;
}>();

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
