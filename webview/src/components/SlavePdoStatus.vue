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
      const endOffset = offset + getTaskTxPdoSize(taskType, taskData);
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
      const endOffset = offset + getTaskRxPdoSize(taskType, taskData);
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

function getTaskTxPdoSize(taskType: number, taskData: any): number {
  switch (taskType) {
    case 1:
      return 19;
    case 2: {
      const cType = Number(taskData.sdowrite_control_type) || 0;
      return cType !== 8 ? 8 : 32;
    }
    case 3:
      return 21;
    case 5:
    case 15: {
      let size = 0;
      for (let i = 1; i <= 4; i++) {
        const motorCanId = taskData[`sdowrite_motor${i}_can_id`];
        if (motorCanId !== undefined && Number(motorCanId) !== 0) {
          size += 9;
        }
      }
      return size;
    }
    case 8:
      return 9;
    case 10:
      return 7;
    case 11:
      return 24;
    case 12:
      return 9;
    case 13:
      return 7;
    case 14:
      return 18;
    default:
      return 0;
  }
}

function getTaskRxPdoSize(taskType: number, taskData: any): number {
  switch (taskType) {
    case 2: {
      const cType = Number(taskData.sdowrite_control_type) || 0;
      switch (cType) {
        case 1:
        case 2:
          return 3;
        case 3:
          return 7;
        case 4:
          return 5;
        case 5:
          return 7;
        case 6:
          return 6;
        case 7:
        case 8:
          return 8;
        default:
          return 0;
      }
    }
    case 4:
    case 6:
      return 8;
    case 5:
    case 15: {
      let size = 0;
      for (let i = 1; i <= 4; i++) {
        const motorCanId = taskData[`sdowrite_motor${i}_can_id`];
        if (motorCanId !== undefined && Number(motorCanId) !== 0) {
          size += 3;
        }
      }
      return size;
    }
    case 7: {
      const channelNum = Number(taskData.sdowrite_channel_num) || 0;
      return channelNum * 2;
    }
    case 13:
      return 4;
    default:
      return 0;
  }
}

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
  margin-top: 8px;
  padding: 10px 12px;
  background-color: var(--vscode-editor-background);
  border-radius: 4px;
  border: 1px solid var(--vscode-panel-border);
}

.board-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}

.board-type-row label {
  color: var(--vscode-descriptionForeground);
  font-weight: 500;
  flex-shrink: 0;
}

.board-type-row select {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--vscode-input-border);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
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
