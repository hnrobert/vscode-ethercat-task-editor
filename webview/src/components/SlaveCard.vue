<template>
  <details class="slave-panel" :class="{ dragging: isSlaveDragging }" open>
    <summary
      class="header-row"
      draggable="true"
      @dragstart="onSlaveDragStart"
      @dragend="onSlaveDragEnd"
    >
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
      <div
        class="insert-zone task-insert-zone"
        :class="{ 'drag-over': dragOverIndex === 0 }"
        @dragover="onTaskDragOver($event, 0)"
        @dragleave="onDragLeave(0)"
        @drop="onTaskDrop(0)"
      >
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
        <div
          v-if="tIdx < tasks.length - 1"
          class="insert-zone task-insert-zone"
          :class="{ 'drag-over': dragOverIndex === tIdx + 1 }"
          @dragover="onTaskDragOver($event, tIdx + 1)"
          @dragleave="onDragLeave(tIdx + 1)"
          @drop="onTaskDrop(tIdx + 1)"
        >
          <div class="insert-divider" @click="onInsertTask(tIdx + 1)">
            <span class="insert-line"></span>
            <button class="insert-btn">+</button>
            <span class="insert-line"></span>
          </div>
        </div>
      </template>

      <!-- Bottom bar: click to append, drop to append -->
      <div
        class="add-bottom-bar"
        :class="{ 'drag-over': dragOverBottom }"
        @dragover="onBottomDragOver"
        @dragleave="dragOverBottom = false"
        @drop="onTaskDrop(tasks.length)"
      >
        <button @click="onAddTask">+ Add Task</button>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import TaskEditor from './TaskEditor.vue';
import {
  addTask, addTaskAt, renameSlave, removeSlave,
  moveTask, setDragState, dragState,
} from '../composables/useVscode';

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

// --- Slave drag ---
const isSlaveDragging = ref(false);

function onSlaveDragStart(e: DragEvent) {
  isSlaveDragging.value = true;
  setDragState({ type: 'slave', fromSIndex: props.sIndex });
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', '');
}

function onSlaveDragEnd() {
  isSlaveDragging.value = false;
  setDragState(null);
}

// --- Task drop targets ---
const dragOverIndex = ref<number | null>(null);
const dragOverBottom = ref(false);

function onTaskDragOver(e: DragEvent, idx: number) {
  if (dragState?.type !== 'task') return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  dragOverIndex.value = idx;
}

function onDragLeave(idx: number) {
  if (dragOverIndex.value === idx) {
    dragOverIndex.value = null;
  }
}

function onBottomDragOver(e: DragEvent) {
  if (dragState?.type !== 'task') return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  dragOverBottom.value = true;
}

function onTaskDrop(toTIndex: number) {
  dragOverIndex.value = null;
  dragOverBottom.value = false;
  if (dragState?.type !== 'task') return;
  const { fromSIndex, fromTIndex } = dragState;
  if (fromSIndex === props.sIndex && (fromTIndex === toTIndex || fromTIndex + 1 === toTIndex)) return;
  moveTask(fromSIndex, fromTIndex, props.sIndex, toTIndex);
  setDragState(null);
}
</script>
