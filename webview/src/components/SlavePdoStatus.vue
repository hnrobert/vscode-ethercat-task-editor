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
            {{ txLen }} / {{ maxTx }}
          </span>
        </div>
        <div class="pdo-item">
          <span class="pdo-label">RXPDO:</span>
          <span class="pdo-value" :class="{ 'overflow': isRxOverflow }">
            {{ rxLen }} / {{ maxRx }}
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

<style scoped>
.slave-pdo-status {
  /* margin-top: 8px; */
  padding: 10px 12px;
  background-color: var(--vscode-editor-background);
  /* border: 1px solid var(--vscode-panel-border); */
  overflow: hidden;
  position: sticky;
  top: 30px; /* header-row height + padding */
  z-index: 9;
}

.board-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  min-width: 0;
}

.board-type-row label {
  color: var(--vscode-descriptionForeground);
  font-weight: 500;
  flex-shrink: 0;
}

.board-type-row select {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--vscode-input-border);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
  max-width: 100%;
}

.board-type-row select:focus {
  outline: 1px solid var(--vscode-focusBorder);
}

.add-board-type-btn {
  width: 100%;
  padding: 6px 10px;
  margin-bottom: 8px;
  font-size: 11px;
  background-color: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-weight: 500;
}

.add-board-type-btn:hover {
  background-color: var(--vscode-button-secondaryHoverBackground);
}

.pdo-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pdo-metrics {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
}

.pdo-item {
  display: flex;
  gap: 6px;
  align-items: center;
}

.pdo-label {
  font-weight: 500;
  color: var(--vscode-descriptionForeground);
}

.pdo-value {
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-editor-foreground);
  font-weight: 500;
}

.pdo-value.overflow {
  color: var(--vscode-errorForeground);
  font-weight: 600;
}

.status-badge {
  padding: 3px 10px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  margin-left: auto;
}

.status-badge.status-ok {
  background-color: var(--vscode-testing-iconPassed);
  color: var(--vscode-button-foreground);
}

.status-badge.status-error {
  background-color: var(--vscode-errorForeground);
  color: var(--vscode-button-foreground);
}
</style>
