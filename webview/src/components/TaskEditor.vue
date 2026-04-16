<template>
  <div class="task-container">
    <div class="task-title">
      <input
        v-if="isEditing"
        ref="inputRef"
        v-model="editingName"
        class="inline-edit-input"
        @keydown.enter="commitRename"
        @keydown.escape="cancelRename"
        @blur="commitRename"
      />
      <span v-else>{{ tKey }}</span>
      <div class="btn-group">
        <button class="btn-sm btn-secondary" @click="startRename">Rename</button>
        <button class="btn-sm btn-danger" @click="onRemove">Delete</button>
      </div>
    </div>
    <PropertyField
      v-for="prop in visibleProps"
      :key="prop"
      :path="['slaves', sIndex, sKey, 'tasks', tIndex, tKey, prop]"
      :prop="prop"
      :val="tInfo[prop]"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import PropertyField from './PropertyField.vue';
import { renameTask, removeTask } from '../composables/useVscode';

const props = defineProps<{
  sIndex: number;
  sKey: string;
  tIndex: number;
  tKey: string;
  tInfo: Record<string, any>;
}>();

const visibleProps = computed(() =>
  Object.keys(props.tInfo).filter(
    (p) => p !== 'pdoread_offset' && p !== 'pdowrite_offset',
  ),
);

// Inline rename
const isEditing = ref(false);
const editingName = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

function startRename() {
  editingName.value = props.tKey;
  isEditing.value = true;
  nextTick(() => inputRef.value?.select());
}

function commitRename() {
  if (!isEditing.value) return;
  isEditing.value = false;
  const newName = editingName.value.trim();
  if (newName && newName !== props.tKey) {
    renameTask(props.sIndex, props.tIndex, newName);
  }
}

function cancelRename() {
  isEditing.value = false;
}

function onRemove() {
  removeTask(props.sIndex, props.tIndex);
}
</script>
