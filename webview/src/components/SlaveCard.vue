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
        <span v-if="titleSuffix" class="sn-badge">{{ titleSuffix }}</span>
      </h3>
      <div class="btn-group" @click.stop>
        <button class="btn-sm btn-secondary" @click="startEditKey">Change SN</button>
        <button class="btn-sm btn-secondary" @click="startEditAlias">Rename</button>
        <button class="btn-sm btn-danger" @click="onRemoveSlave">Delete</button>
      </div>
    </summary>

    <div class="slave-content">
      <!-- Insert zone before first task -->
      <div
        class="insert-zone task-insert-zone"
        :class="{ 'drag-over': dragOverIndex === 0 }"
        @dragover="onTaskDragOver($event, 0)"
        @dragleave="onDragLeave($event, 0)"
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
          @dragleave="onDragLeave($event, tIdx + 1)"
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
import {
  addTask, addTaskAt, renameSlave, renameSlaveAlias, removeSlave,
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

/** Extract the slave/alias part from a topic string /ecat/{alias}/... */
function extractTopicAlias(topic: string): string | null {
  const m = topic.match(/^\/ecat\/([^/]+)\//);
  return m ? m[1] : null;
}

/** The consistent alias used across all topics of this slave.
 *  Falls back to sKey if there are inconsistencies or no topics. */
const topicAlias = computed<string>(() => {
  const latency = sInfo.value?.latency_pub_topic;
  let alias: string | null = null;

  if (typeof latency === 'string') {
    const m = latency.match(/^\/ecat\/([^/]+)\/latency/);
    if (m) alias = m[1];
  }

  for (const task of tasks.value) {
    const tKey = Object.keys(task)[0];
    const info = task[tKey];
    for (const topic of [info?.pub_topic, info?.sub_topic]) {
      if (typeof topic !== 'string') continue;
      const a = extractTopicAlias(topic);
      if (!a) continue;
      if (alias === null) {
        alias = a;
      } else if (alias !== a) {
        return sKey.value; // inconsistent — fall back to sn key
      }
    }
  }

  return alias ?? sKey.value;
});

const displayAlias = computed(() => topicAlias.value);
const titleSuffix = computed(() =>
  topicAlias.value !== sKey.value ? `(${sKey.value})` : '',
);

// Inline editing — 'key' = Change SN, 'alias' = Rename topics
const editMode = ref<'key' | 'alias' | null>(null);
const editingValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

function startEditKey() {
  editingValue.value = sKey.value;
  editMode.value = 'key';
  nextTick(() => inputRef.value?.select());
}

function startEditAlias() {
  editingValue.value = topicAlias.value;
  editMode.value = 'alias';
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
  } else if (mode === 'alias' && newValue !== topicAlias.value) {
    renameSlaveAlias(props.sIndex, newValue);
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
