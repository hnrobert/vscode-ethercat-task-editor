<template>
  <details class="task-container" open>
    <summary class="task-title">
      <span class="chevron"></span>
      <template v-if="isEditing">
        <input
          ref="inputRef"
          v-model="editingSegment"
          class="inline-edit-input"
          @click.stop
          @keydown.enter="commitRename"
          @keydown.escape="cancelRename"
          @blur="commitRename"
        />
      </template>
      <template v-else>
        <span class="task-label" :title="'YAML key: ' + tKey">{{ segment }}</span>
        <span class="task-key-badge">{{ tKey }}</span>
      </template>
      <div class="btn-group" @click.stop>
        <button class="btn-sm btn-secondary" @click="startRename">Rename</button>
        <button class="btn-sm btn-danger" @click="onRemove">Delete</button>
      </div>
    </summary>

    <div class="task-content">
      <PropertyField
        v-for="prop in visibleProps"
        :key="prop"
        :path="['slaves', sIndex, sKey, 'tasks', tIndex, tKey, prop]"
        :prop="prop"
        :val="tInfo[prop]"
      />
    </div>
  </details>
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

/** Extract the topic segment from pub_topic, e.g. /ecat/sn1/app1/read → app1 */
const segment = computed(() => {
  const topic = props.tInfo.pub_topic || props.tInfo.sub_topic || '';
  const match = topic.match(/^\/ecat\/[^/]+\/([^/]+)\//);
  if (match) return match[1];
  // Fallback: derive from key (app_1 → app1)
  return props.tKey.replace('_', '');
});

// Inline rename (edits topic segment, not YAML key)
const isEditing = ref(false);
const editingSegment = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

function startRename() {
  editingSegment.value = segment.value;
  isEditing.value = true;
  nextTick(() => inputRef.value?.select());
}

function commitRename() {
  if (!isEditing.value) return;
  isEditing.value = false;
  const newSeg = editingSegment.value.trim();
  if (newSeg && newSeg !== segment.value) {
    renameTask(props.sIndex, props.tIndex, newSeg);
  }
}

function cancelRename() {
  isEditing.value = false;
}

function onRemove() {
  removeTask(props.sIndex, props.tIndex);
}
</script>
