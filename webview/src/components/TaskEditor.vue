<template>
  <div class="task-container">
    <div class="task-title">
      <span>{{ tKey }}</span>
      <div class="btn-group">
        <button class="btn-sm btn-secondary" @click="onRename">Rename</button>
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
import { computed } from 'vue';
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

function onRename() {
  renameTask(props.sIndex, props.tIndex, props.tKey);
}

function onRemove() {
  removeTask(props.sIndex, props.tIndex);
}
</script>
