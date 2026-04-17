<template>
  <div v-if="data?.slaves && data.slaves.length > 0" class="pdo-status-panel">
    <div class="overall-status" :class="getOverallStatusClass()">
      <span class="status-icon">{{ getOverallStatusIcon() }}</span>
      <span class="status-text">{{ getOverallStatusText() }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { data } from '../composables/useVscode';

function getBoardType(slave: any): number {
  const key = getSlaveKey(slave);
  if (!key) return 0x03;
  const slaveData = slave[key];
  return slaveData?.board_type ?? 0x03;
}

function getSlaveKey(slave: any): string {
  if (!slave || typeof slave !== 'object') return '';
  return Object.keys(slave)[0] || '';
}

function getMaxTxPdo(boardType: number): number {
  switch (boardType) {
    case 0x03:
      return 80;
    case 0x04:
      return 112;
    default:
      return 80;
  }
}

function getMaxRxPdo(boardType: number): number {
  return 80;
}

function getTxPdoLen(slave: any): number {
  const key = getSlaveKey(slave);
  if (!key) return 0;
  const slaveData = slave[key];
  const tasks = slaveData?.tasks || [];

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
}

function getRxPdoLen(slave: any): number {
  const key = getSlaveKey(slave);
  if (!key) return 0;
  const slaveData = slave[key];
  const tasks = slaveData?.tasks || [];

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
}

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

function checkSlaveStatus(slave: Record<string, any>): boolean {
  const boardType = getBoardType(slave);
  const txLen = getTxPdoLen(slave);
  const rxLen = getRxPdoLen(slave);
  const maxTx = getMaxTxPdo(boardType);
  const maxRx = getMaxRxPdo(boardType);
  return txLen <= maxTx && rxLen <= maxRx;
}

function getOverallStatusClass(): string {
  if (!data.value?.slaves) return 'status-unknown';
  const allOk = data.value.slaves.every((slave: Record<string, any>) => checkSlaveStatus(slave));
  return allOk ? 'status-ok' : 'status-error';
}

function getOverallStatusIcon(): string {
  if (!data.value?.slaves) return '?';
  const allOk = data.value.slaves.every((slave: Record<string, any>) => checkSlaveStatus(slave));
  return allOk ? '✓' : '✗';
}

function getOverallStatusText(): string {
  if (!data.value?.slaves) return 'No slaves';
  const allOk = data.value.slaves.every((slave: Record<string, any>) => checkSlaveStatus(slave));
  return allOk ? 'All PDO configurations OK' : 'PDO overflow detected';
}
</script>

<style scoped>
.pdo-status-panel {
  margin-bottom: 16px;
}

.overall-status {
  padding: 12px 16px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 14px;
}

.status-ok {
  background-color: var(--vscode-inputValidation-infoBackground);
  border: 1px solid var(--vscode-inputValidation-infoBorder);
  color: var(--vscode-editor-foreground);
}

.status-error {
  background-color: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  color: var(--vscode-errorForeground);
}

.status-unknown {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  color: var(--vscode-descriptionForeground);
}

.status-icon {
  font-size: 18px;
  font-weight: bold;
}
</style>
