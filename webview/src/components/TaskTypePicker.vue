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
          <span class="task-type-desc">{{ taskType.name }}</span>
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
