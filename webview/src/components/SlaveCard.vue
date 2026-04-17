<template>
  <details class="slave-panel" open>
    <summary class="header-row">
      <span class="chevron"></span>
      <input
        v-if="isEditing"
        ref="inputRef"
        v-model="editingName"
        class="inline-edit-input"
        @click.stop
        @keydown.enter="commitRename"
        @keydown.escape="cancelRename"
        @blur="commitRename"
      />
      <h3 v-else>{{ sKey }}</h3>
      <div class="btn-group" @click.stop>
        <button class="btn-sm btn-secondary" @click="startRename">Rename</button>
        <button class="btn-sm btn-danger" @click="onRemoveSlave">Delete</button>
      </div>
    </summary>

    <div class="slave-content">
      <!-- Insert zone before first task -->
      <div class="insert-zone">
        <div class="insert-divider" @click="onInsertTask(0)">
          <span class="insert-line"></span>
          <button class="insert-btn">+</button>
          <span class="insert-line"></span>
        </div>
      </div>

      <template v-for="(_, tIdx) in tasks" :key="tIdx">
        <TaskEditor
          :s-index="sIndex"
          :s-key="sKey"
          :t-index="tIdx"
          :t-key="taskKey(tIdx)"
          :t-info="taskInfo(tIdx)"
        />
        <!-- Insert zone between tasks (not after last) -->
        <div v-if="tIdx < tasks.length - 1" class="insert-zone">
          <div class="insert-divider" @click="onInsertTask(tIdx + 1)">
            <span class="insert-line"></span>
            <button class="insert-btn">+</button>
            <span class="insert-line"></span>
          </div>
        </div>
      </template>

      <div class="add-bottom-bar">
        <button @click="onAddTask">+ Add Task</button>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import TaskEditor from './TaskEditor.vue';
import { addTask, addTaskAt, renameSlave, removeSlave } from '../composables/useVscode';

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

function onInsertTask(tIndex: number) {
  addTaskAt(props.sIndex, tIndex);
}

function onRemoveSlave() {
  removeSlave(props.sIndex);
}
</script>
