<template>
  <div>
    <div class="header-row">
      <h3>{{ sKey }}</h3>
      <div class="btn-group">
        <button class="btn-sm btn-secondary" @click="onRenameSlave">Rename</button>
        <button class="btn-sm btn-danger" @click="onRemoveSlave">Delete</button>
      </div>
    </div>

    <div class="add-task-bar">
      <button class="btn-sm btn-secondary" @click="onAddTask">+ Add Task</button>
    </div>

    <TaskEditor
      v-for="(task, tIdx) in tasks"
      :key="tIdx"
      :s-index="sIndex"
      :s-key="sKey"
      :t-index="tIdx"
      :t-key="taskKey(tIdx)"
      :t-info="taskInfo(tIdx)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TaskEditor from './TaskEditor.vue';
import { addTask, renameSlave, removeSlave } from '../composables/useVscode';

const props = defineProps<{
  sIndex: number;
  slave: any;
}>();

const sKey = computed(() => Object.keys(props.slave)[0]);
const sInfo = computed(() => props.slave[sKey.value]);
const tasks = computed<any[]>(() =>
  Array.isArray(sInfo.value?.tasks) ? sInfo.value.tasks : [],
);

function taskKey(idx: number): string {
  return Object.keys(tasks.value[idx])[0];
}

function taskInfo(idx: number): Record<string, any> {
  return tasks.value[idx][taskKey(idx)];
}

function onAddTask() {
  addTask(props.sIndex);
}

function onRenameSlave() {
  renameSlave(props.sIndex, sKey.value);
}

function onRemoveSlave() {
  removeSlave(props.sIndex);
}
</script>
