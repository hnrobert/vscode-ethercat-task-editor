<template>
  <div class="slave-pdo-status">
    <div class="board-type-row" v-if="hasBoardType || showSelector">
      <label>Board Type:</label>
      <select :value="boardType" @change="onBoardTypeChange">
        <option v-for="bt in boardTypes" :key="bt.id" :value="bt.id">
          0x{{ bt.id.toString(16).padStart(2, '0') }} - {{ bt.name }}
        </option>
      </select>
    </div>
    <button v-else class="add-board-type-btn" @click="onAddBoardType">
      + Set Board Type
    </button>

    <div class="pdo-info-row">
      <div class="pdo-metrics">
        <div class="pdo-item">
          <span class="pdo-label">TXPDO:</span>
          <span class="pdo-value" :class="{ 'overflow': isTxOverflow }">
            {{ txLen }}/{{ maxTx }}
          </span>
        </div>
        <div class="pdo-item">
          <span class="pdo-label">RXPDO:</span>
          <span class="pdo-value" :class="{ 'overflow': isRxOverflow }">
            {{ rxLen }}/{{ maxRx }}
          </span>
        </div>
      </div>
      <div class="status-badge" :class="statusClass">
        {{ statusText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { vscode, boardTypes } from '../composables/useVscode';
import { TaskRegistry } from '@tasks';

const props = defineProps<{
  sIndex: number;
  slave: any;
}>();

const showSelector = ref(false);

const slaveKey = computed(() => {
  if (!props.slave || typeof props.slave !== 'object') return '';
  return Object.keys(props.slave)[0] || '';
});

const slaveData = computed(() => {
  if (!slaveKey.value) return null;
  return props.slave[slaveKey.value];
});

const hasBoardType = computed(() => {
  return slaveData.value?.board_type !== undefined;
});

const boardType = computed(() => {
  const rawValue = slaveData.value?.board_type;
  if (rawValue === undefined) return 3;

  // Handle both numeric and hex string formats
  if (typeof rawValue === 'string') {
    return parseInt(rawValue, 16);
  }
  return Number(rawValue);
});

const currentBoardDef = computed(() => {
  return boardTypes.value.find(bt => bt.id === boardType.value);
});

const maxTx = computed(() => {
  return currentBoardDef.value?.max_tx_pdo ?? 80;
});

const maxRx = computed(() => {
  return currentBoardDef.value?.max_rx_pdo ?? 80;
});

const txLen = computed(() => {
  const tasks = slaveData.value?.tasks || [];
  let maxOffset = 0;

  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    const taskKey = Object.keys(task)[0];
    const taskData = task[taskKey];
    if (taskData?.pdoread_offset !== undefined) {
      const offset = Number(taskData.pdoread_offset);
      const taskType = Number(taskData.sdowrite_task_type);
      const endOffset = offset + (TaskRegistry.getTask(taskType)?.calculateTxPdoSize(taskData) ?? 0);
      if (endOffset > maxOffset) {
        maxOffset = endOffset;
      }
    }
  }
  return maxOffset;
});

const rxLen = computed(() => {
  const tasks = slaveData.value?.tasks || [];
  let maxOffset = 0;

  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    const taskKey = Object.keys(task)[0];
    const taskData = task[taskKey];
    if (taskData?.pdowrite_offset !== undefined) {
      const offset = Number(taskData.pdowrite_offset);
      const taskType = Number(taskData.sdowrite_task_type);
      const endOffset = offset + (TaskRegistry.getTask(taskType)?.calculateRxPdoSize(taskData) ?? 0);
      if (endOffset > maxOffset) {
        maxOffset = endOffset;
      }
    }
  }
  return maxOffset;
});

const isTxOverflow = computed(() => txLen.value > maxTx.value);
const isRxOverflow = computed(() => rxLen.value > maxRx.value);

const statusClass = computed(() => {
  if (isTxOverflow.value || isRxOverflow.value) return 'status-error';
  return 'status-ok';
});

const statusText = computed(() => {
  if (isTxOverflow.value) return 'TXPDO Overflow';
  if (isRxOverflow.value) return 'RXPDO Overflow';
  return 'OK';
});

function onBoardTypeChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const newBoardType = parseInt(target.value);

  vscode.postMessage({
    type: 'updateValue',
    path: ['slaves', props.sIndex, slaveKey.value, 'board_type'],
    value: newBoardType,
  });
}

function onAddBoardType() {
  showSelector.value = true;
  // Immediately set default board_type to 3 (0x03)
  vscode.postMessage({
    type: 'updateValue',
    path: ['slaves', props.sIndex, slaveKey.value, 'board_type'],
    value: 3,
  });
}
</script>
