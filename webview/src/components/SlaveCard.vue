<template>
  <div>
    <div class="header-row">
      <input
        v-if="isEditing"
        ref="inputRef"
        v-model="editingName"
        class="inline-edit-input"
        @keydown.enter="commitRename"
        @keydown.escape="cancelRename"
        @blur="commitRename"
      />
      <h3 v-else>{{ sKey }}</h3>
      <div class="btn-group">
        <button class="btn-sm btn-secondary" @click="startRename">Rename</button>
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
import { computed, nextTick, ref } from 'vue';
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

// Inline rename
const isEditing = ref(false);
const editingName = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

function startRename() {
  editingName.value = sKey.value;
  isEditing.value = true;
  nextTick(() => inputRef.value?.select());
}

function commitRename() {
  if (!isEditing.value) return;
  isEditing.value = false;
  const newName = editingName.value.trim();
  if (newName && newName !== sKey.value) {
    renameSlave(props.sIndex, newName);
  }
}

function cancelRename() {
  isEditing.value = false;
}

function onAddTask() {
  addTask(props.sIndex);
}

function onRemoveSlave() {
  removeSlave(props.sIndex);
}
</script>
