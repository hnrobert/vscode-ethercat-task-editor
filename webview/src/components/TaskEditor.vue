<template>
  <details class="task-container" :class="{ dragging: isDragging }" open @toggle="onToggle">
    <summary
      class="task-title"
      draggable="true"
      @mousedown="onSummaryMousedown"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
    >
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
        <button class="btn-sm btn-secondary" @click="startRename">Alias</button>
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
import { renameTask, removeTask, setDragState, taskTypes } from '../composables/useVscode';

const props = defineProps<{
  sIndex: number;
  sKey: string;
  tIndex: number;
  tKey: string;
  tInfo: Record<string, any>;
}>();

const visibleProps = computed(() => {
  // 获取 task type（标准化为数字）
  const rawTaskType = props.tInfo.sdowrite_task_type;
  const taskType = typeof rawTaskType === 'string' && rawTaskType.startsWith('0x')
    ? parseInt(rawTaskType, 16)
    : rawTaskType;
  if (!taskType) {
    // 如果没有 task type，使用原来的逻辑
    return Object.keys(props.tInfo).filter(
      (p) => p !== 'pdoread_offset' && p !== 'pdowrite_offset' && p !== 'pub_topic' && p !== 'sub_topic' && !p.startsWith('_'),
    );
  }

  // 从 taskTypes 中获取字段定义
  const taskTypeDef = taskTypes.value.find((t: any) => t.id === taskType);
  if (!taskTypeDef?.fields) {
    // 如果没有字段定义，使用原来的逻辑
    // console.log(`[TaskEditor] No field definition for task type ${taskType}, using fallback`);
    return Object.keys(props.tInfo).filter(
      (p) => p !== 'pdoread_offset' && p !== 'pdowrite_offset' && p !== 'pub_topic' && p !== 'sub_topic' && !p.startsWith('_'),
    );
  }

  // 按照字段定义的顺序返回存在于 tInfo 中的字段
  const orderedProps: string[] = [];

  // 首先添加固定的基础字段
  const baseFields = [
    'sdowrite_task_type',
    'conf_connection_lost_read_action',
    'sdowrite_connection_lost_write_action',
  ];

  for (const field of baseFields) {
    if (field in props.tInfo) {
      orderedProps.push(field);
    }
  }

  // 然后按照字段定义的顺序添加其他字段
  for (const fieldDef of taskTypeDef.fields) {
    if (fieldDef.key in props.tInfo && !orderedProps.includes(fieldDef.key)) {
      orderedProps.push(fieldDef.key);
    }
  }

  // 最后添加任何未在字段定义中的字段（除了 offset 和 topic）
  for (const key of Object.keys(props.tInfo)) {
    if (
      !orderedProps.includes(key) &&
      key !== 'pdoread_offset' &&
      key !== 'pdowrite_offset' &&
      key !== 'pub_topic' &&
      key !== 'sub_topic' &&
      !key.startsWith('_') // 排除内部字段
    ) {
      orderedProps.push(key);
    }
  }

  // console.log(`[TaskEditor] Task ${props.tKey} visible props:`, orderedProps.length, orderedProps);
  return orderedProps;
});

/** Extract the topic segment from pub_topic, e.g. /ecat/dji_motor_1/read → dji_motor_1 */
const segment = computed(() => {
  const topic = props.tInfo.pub_topic || props.tInfo.sub_topic || '';
  const match = topic.match(/^\/ecat\/([^/]+)\//);
  if (match) return match[1];
  return props.tKey.replace('_', '');
});

// Inline alias editing (edits topic segment, not YAML key)
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

// Drag
const isDragging = ref(false);

// Sticky scroll correction — capture state before browser toggles
const preToggleStickyTop = ref(-1);

function onSummaryMousedown(e: MouseEvent) {
  const el = e.target as HTMLElement;
  if (el.closest('.btn-group') || el.tagName === 'INPUT') {
    preToggleStickyTop.value = -1;
    return;
  }
  const summary = e.currentTarget as HTMLElement;
  const stickyTop = parseFloat(getComputedStyle(summary).top) || 0;
  const rect = summary.getBoundingClientRect();
  preToggleStickyTop.value = Math.abs(rect.top - stickyTop) <= 1 ? stickyTop : -1;
}

function onToggle(e: Event) {
  if (preToggleStickyTop.value < 0) return;
  const stickyTop = preToggleStickyTop.value;
  preToggleStickyTop.value = -1;
  const details = e.target as HTMLDetailsElement;
  requestAnimationFrame(() => {
    const summary = details.querySelector('summary') as HTMLElement;
    if (!summary) return;
    const delta = summary.getBoundingClientRect().top - stickyTop;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  });
}

function onDragStart(e: DragEvent) {
  isDragging.value = true;
  setDragState({ type: 'task', fromSIndex: props.sIndex, fromTIndex: props.tIndex });
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', '');
}

function onDragEnd() {
  isDragging.value = false;
  setDragState(null);
}
</script>
