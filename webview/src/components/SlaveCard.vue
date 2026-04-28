<template>
  <details class="slave-panel" :class="{ dragging: isSlaveDragging }" open @toggle="onToggle">
    <summary
      class="header-row"
      draggable="true"
      @mousedown="onSummaryMousedown"
      @dragstart="onSlaveDragStart"
      @dragend="onSlaveDragEnd"
    >
      <span class="chevron"></span>
      <input
        v-if="editMode !== null"
        ref="inputRef"
        v-model="editingValue"
        class="inline-edit-input"
        @click.stop
        @keydown.enter="commitEdit"
        @keydown.escape="cancelEdit"
        @blur="commitEdit"
      />
      <h3 v-else class="slave-title">
        <span>{{ displayAlias }}</span>
      </h3>
      <div class="btn-group" @click.stop>
        <button class="btn-sm btn-secondary" @click="startEditKey">Change SN</button>
        <button class="btn-sm btn-danger" @click="onRemoveSlave">Delete</button>
      </div>
    </summary>

    <SlavePdoStatus :s-index="sIndex" :slave="slave" />

    <div class="slave-content">
      <!-- Insert zone before first task (hidden when no tasks) -->
      <div
        v-if="tasks.length > 0"
        class="insert-zone task-insert-zone"
        :class="{ 'drag-over': dragOverIndex === 0 }"
        @dragover="onTaskDragOver($event, 0)"
        @dragleave="onDragLeave($event, 0)"
        @drop="onTaskDrop(0)"
      >
        <div class="insert-divider">
          <span class="insert-line"></span>
          <button class="insert-btn" @click="onInsertTask(0)" title="Insert a new task here">+</button>
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
          @dragleave="onDragLeave($event, tIdx + 1)"
          @drop="onTaskDrop(tIdx + 1)"
        >
          <div class="insert-divider">
            <span class="insert-line"></span>
            <button class="insert-btn" @click="onInsertTask(tIdx + 1)" title="Insert a new task here">+</button>
            <span class="insert-line"></span>
          </div>
        </div>
      </template>

      <!-- Bottom bar: click to append, drop to append -->
      <div
        class="add-bottom-bar"
        :class="{ 'drag-over': dragOverBottom }"
        @dragover="onBottomDragOver"
        @dragleave="onBottomDragLeave"
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
import SlavePdoStatus from './SlavePdoStatus.vue';
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

const displayAlias = computed(() => sKey.value);

// Inline editing — 'key' = Change SN
const editMode = ref<'key' | null>(null);
const editingValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

function startEditKey() {
  editingValue.value = sKey.value;
  editMode.value = 'key';
  nextTick(() => inputRef.value?.select());
}

function commitEdit() {
  if (!editMode.value) return;
  const newValue = editingValue.value.trim();
  const mode = editMode.value;
  editMode.value = null;
  if (!newValue) return;
  if (mode === 'key' && newValue !== sKey.value) {
    renameSlave(props.sIndex, newValue);
  }
}

function cancelEdit() {
  editMode.value = null;
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

function onDragLeave(e: DragEvent, idx: number) {
  if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as Node)) return;
  if (dragOverIndex.value === idx) dragOverIndex.value = null;
}

function onBottomDragOver(e: DragEvent) {
  if (dragState?.type !== 'task') return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  dragOverBottom.value = true;
}

function onBottomDragLeave(e: DragEvent) {
  if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as Node)) return;
  dragOverBottom.value = false;
}

const preToggleStickyTop = ref(-1);

function onSummaryMousedown(e: MouseEvent) {
  const el = e.target as HTMLElement;
  if (el.closest('.btn-group') || el.tagName === 'INPUT') {
    preToggleStickyTop.value = -1;
    return;
  }
  const summary = e.currentTarget as HTMLElement;
  const stickyTop = parseFloat(getComputedStyle(summary).top) || 0;
  const rect = summary.getBoundingClientRect();
  preToggleStickyTop.value = Math.abs(rect.top - stickyTop) <= 1 ? stickyTop : -1;
}

function onToggle(e: Event) {
  if (preToggleStickyTop.value < 0) return;
  const stickyTop = preToggleStickyTop.value;
  preToggleStickyTop.value = -1;
  const details = e.target as HTMLDetailsElement;
  requestAnimationFrame(() => {
    const summary = details.querySelector('summary') as HTMLElement;
    if (!summary) return;
    const delta = summary.getBoundingClientRect().top - stickyTop;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  });
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
