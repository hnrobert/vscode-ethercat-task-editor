<template>
  <div>
    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
    <template v-else-if="data?.slaves?.length">

      <PdoStatusPanel />
      <div class="slave-list">
        <!-- Insert zone before first slave (hidden when no slaves) -->
        <div
          v-if="data.slaves.length > 0"
          class="insert-zone slave-insert-zone"
          :class="{ 'drag-over': dragOverIndex === 0 }"
          @dragover="onSlaveDragOver($event, 0)"
          @dragleave="onDragLeave($event, 0)"
          @drop="onSlaveDrop(0)"
        >
          <div class="insert-divider">
            <span class="insert-line"></span>
            <button class="insert-btn" @click="onInsertSlave(0)" title="Insert a new slave here">+</button>
            <span class="insert-line"></span>
          </div>
        </div>

        <template v-for="(_, sIdx) in data.slaves" :key="sIdx">
          <SlaveCard
            :s-index="Number(sIdx)"
            :slave="data.slaves[sIdx]"
          />
          <!-- Insert zone between slaves (not after last) -->
          <div
            v-if="Number(sIdx) < data.slaves.length - 1"
            class="insert-zone slave-insert-zone"
            :class="{ 'drag-over': dragOverIndex === Number(sIdx) + 1 }"
            @dragover="onSlaveDragOver($event, Number(sIdx) + 1)"
            @dragleave="onDragLeave($event, Number(sIdx) + 1)"
            @drop="onSlaveDrop(Number(sIdx) + 1)"
          >
            <div class="insert-divider">
              <span class="insert-line"></span>
              <button class="insert-btn" @click="onInsertSlave(Number(sIdx) + 1)" title="Insert a new slave here">+</button>
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
          @drop="onSlaveDrop(data.slaves.length)"
        >
          <button @click="onAddSlave">+ Add Slave (SN)</button>
        </div>
      </div>
      <div class="bottom-spacer"></div>
    </template>

    <template v-else>
      <div class="welcome">
        <div class="welcome-header">
          <img class="welcome-icon" :src="iconUri" alt="EtherCAT" />
          <h2>EtherCAT Task Editor</h2>
          <p class="welcome-subtitle">Visual editor for SOEM YAML configuration files</p>
        </div>

        <div class="welcome-steps">
          <div class="welcome-step">
            <span class="step-num">1</span>
            <div>
              <strong>Add a Slave</strong>
              <p>Enter the slave serial number (e.g., sn1234567)</p>
            </div>
          </div>
          <div class="welcome-step">
            <span class="step-num">2</span>
            <div>
              <strong>Set Board Type</strong>
              <p>Choose the board type for PDO size validation</p>
            </div>
          </div>
          <div class="welcome-step">
            <span class="step-num">3</span>
            <div>
              <strong>Add Tasks</strong>
              <p>Pick a task type and configure its parameters</p>
            </div>
          </div>
        </div>

        <button class="welcome-btn" @click="onAddSlave">+ Add Slave (SN)</button>

        <div class="welcome-hint">
          Open a <code>.yaml</code> file with a <code>slaves:</code> section to auto-load an existing config.
        </div>
      </div>
    </template>

    <TaskTypePicker
      :show="showTaskTypePicker"
      :s-index="pendingTaskSIndex"
      :t-index="pendingTaskTIndex"
      @confirm="onTaskTypeConfirm"
      @cancel="onTaskTypeCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import SlaveCard from './components/SlaveCard.vue';
import TaskTypePicker from './components/TaskTypePicker.vue';

const iconUri = (document.getElementById('app')?.dataset.iconUri) ?? '';
import PdoStatusPanel from './components/PdoStatusPanel.vue';
import { data, errorMessage, addSlave, addSlaveAt, moveSlave, dragState, setDragState, vscode, taskTypePickerEvent } from './composables/useVscode';

// Task type picker state
const showTaskTypePicker = ref(false);
const pendingTaskSIndex = ref(0);
const pendingTaskTIndex = ref(0);

// Watch for task type picker requests
watch(taskTypePickerEvent, (event) => {
  if (event) {
    pendingTaskSIndex.value = event.sIndex;
    pendingTaskTIndex.value = event.tIndex;
    showTaskTypePicker.value = true;
    taskTypePickerEvent.value = null;
  }
});

function onAddSlave() {
  addSlave();
}

function onInsertSlave(sIndex: number) {
  addSlaveAt(sIndex);
}

function onTaskTypeConfirm(taskType: number) {
  vscode.postMessage({
    type: 'confirmTaskType',
    sIndex: pendingTaskSIndex.value,
    tIndex: pendingTaskTIndex.value,
    taskType,
  });
  showTaskTypePicker.value = false;
}

function onTaskTypeCancel() {
  showTaskTypePicker.value = false;
}

// --- Slave drop targets ---
const dragOverIndex = ref<number | null>(null);
const dragOverBottom = ref(false);

function onSlaveDragOver(e: DragEvent, idx: number) {
  if (dragState?.type !== 'slave') return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  dragOverIndex.value = idx;
}

function onDragLeave(e: DragEvent, idx: number) {
  if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as Node)) return;
  if (dragOverIndex.value === idx) dragOverIndex.value = null;
}

function onBottomDragLeave(e: DragEvent) {
  if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as Node)) return;
  dragOverBottom.value = false;
}

function onBottomDragOver(e: DragEvent) {
  if (dragState?.type !== 'slave') return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  dragOverBottom.value = true;
}

function onSlaveDrop(toIndex: number) {
  dragOverIndex.value = null;
  dragOverBottom.value = false;
  if (dragState?.type !== 'slave') return;
  const { fromSIndex } = dragState;
  if (fromSIndex === toIndex || fromSIndex + 1 === toIndex) return;
  moveSlave(fromSIndex, toIndex);
  setDragState(null);
}
</script>
