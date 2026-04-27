<template>
  <div v-if="data?.slaves && data.slaves.length > 0" class="pdo-status-panel">
    <div class="overall-status" :class="getOverallStatusClass()">
      <span class="status-icon">{{ getOverallStatusIcon() }}</span>
      <span class="status-text">{{ getOverallStatusText() }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { data, boardTypes } from '../composables/useVscode';
import { TaskRegistry } from '@tasks';

function getBoardType(slave: any): number {
  const key = getSlaveKey(slave);
  if (!key) return 3;
  const slaveData = slave[key];
  return slaveData?.board_type ?? 3;
}

function getSlaveKey(slave: any): string {
  if (!slave || typeof slave !== 'object') return '';
  return Object.keys(slave)[0] || '';
}

function getMaxTxPdo(boardType: number): number {
  const def = boardTypes.value.find(bt => bt.id === boardType);
  return def?.max_tx_pdo ?? 80;
}

function getMaxRxPdo(boardType: number): number {
  const def = boardTypes.value.find(bt => bt.id === boardType);
  return def?.max_rx_pdo ?? 80;
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
      const endOffset = offset + (TaskRegistry.getTask(taskType)?.calculateTxPdoSize(taskData) ?? 0);
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
      const endOffset = offset + (TaskRegistry.getTask(taskType)?.calculateRxPdoSize(taskData) ?? 0);
      if (endOffset > maxOffset) {
        maxOffset = endOffset;
      }
    }
  }
  return maxOffset;
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
