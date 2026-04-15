<template>
  <div>
    <div class="header-row">
      <h3>{{ sKey }}</h3>
      <div class="btn-group">
        <button class="btn-sm" @click="onRenameSlave">Rename</button>
        <button class="btn-sm btn-danger" @click="onRemoveSlave">Delete</button>
      </div>
    </div>

    <div style="margin-bottom: 8px">
      <button class="btn-sm" @click="onAddTask">+ Add Task</button>
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
import TaskEditor from './TaskEditor.vue';
import { addTask, renameSlave, removeSlave } from '../composables/useVscode';

const props = defineProps<{
  sIndex: number;
  slave: any;
}>();

const sKey = Object.keys(props.slave)[0];
const sInfo = props.slave[sKey];
const tasks: any[] = Array.isArray(sInfo?.tasks) ? sInfo.tasks : [];

function taskKey(idx: number): string {
  return Object.keys(tasks[idx])[0];
}

function taskInfo(idx: number): Record<string, any> {
  return tasks[idx][taskKey(idx)];
}

function onAddTask() {
  addTask(props.sIndex);
}

function onRenameSlave() {
  renameSlave(props.sIndex, sKey);
}

function onRemoveSlave() {
  removeSlave(props.sIndex);
}
</script>
