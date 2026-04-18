<template>
  <div v-if="show" class="modal-overlay" @click.self="onCancel">
    <div class="modal-content">
      <h2>Select Task Type</h2>
      <div class="task-type-list">
        <button
          v-for="taskType in taskTypes"
          :key="taskType.id"
          class="task-type-item"
          @click="onSelect(taskType.id)"
        >
          <span class="task-type-label">{{ taskType.id }}</span>
          <span class="task-type-desc">{{ taskType.description }}</span>
        </button>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" @click="onCancel">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { taskTypes } from '../composables/useVscode';

const props = defineProps<{
  show: boolean;
  sIndex: number;
  tIndex: number;
}>();

const emit = defineEmits<{
  confirm: [taskType: number];
  cancel: [];
}>();

function onSelect(taskType: number) {
  emit('confirm', taskType);
}

function onCancel() {
  emit('cancel');
}

// Handle ESC key
watch(() => props.show, (newShow) => {
  if (newShow) {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  padding: 20px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-content h2 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
}

.task-type-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.task-type-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 3px;
  cursor: pointer;
  text-align: left;
  height: auto;
}

.task-type-item:hover {
  background: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

.task-type-label {
  font-family: monospace;
  font-weight: 600;
  min-width: 40px;
  opacity: 0.9;
}

.task-type-desc {
  flex: 1;
  opacity: 0.7;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
