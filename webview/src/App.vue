<template>
  <div>
    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
    <template v-else-if="data?.slaves">
      <div class="slave-list">
        <!-- Insert zone before first slave -->
        <div
          class="insert-zone slave-insert-zone"
          :class="{ 'drag-over': dragOverIndex === 0 }"
          @dragover="onSlaveDragOver($event, 0)"
          @dragleave="onDragLeave($event, 0)"
          @drop="onSlaveDrop(0)"
        >
          <div class="insert-divider" @click="onInsertSlave(0)">
            <span class="insert-line"></span>
            <button class="insert-btn">+</button>
            <span class="insert-line"></span>
          </div>
        </div>

        <template v-for="(_, sIdx) in data.slaves" :key="sIdx">
          <SlaveCard
            :s-index="sIdx"
            :slave="data.slaves[sIdx]"
          />
          <!-- Insert zone between slaves (not after last) -->
          <div
            v-if="sIdx < data.slaves.length - 1"
            class="insert-zone slave-insert-zone"
            :class="{ 'drag-over': dragOverIndex === sIdx + 1 }"
            @dragover="onSlaveDragOver($event, sIdx + 1)"
            @dragleave="onDragLeave($event, sIdx + 1)"
            @drop="onSlaveDrop(sIdx + 1)"
          >
            <div class="insert-divider" @click="onInsertSlave(sIdx + 1)">
              <span class="insert-line"></span>
              <button class="insert-btn">+</button>
              <span class="insert-line"></span>
            </div>
          </div>
        </template>

        <!-- Bottom bar: click to append, drop to append -->
        <div
          class="add-bottom-bar"
          :class="{ 'drag-over': dragOverBottom }"
          @dragover="onBottomDragOver"
          @dragleave="onBottomDragLeave"
          @drop="onSlaveDrop(data.slaves.length)"
        >
          <button @click="onAddSlave">+ Add Slave (SN)</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SlaveCard from './components/SlaveCard.vue';
import { data, errorMessage, addSlave, addSlaveAt, moveSlave, dragState, setDragState } from './composables/useVscode';

function onAddSlave() {
  addSlave();
}

function onInsertSlave(sIndex: number) {
  addSlaveAt(sIndex);
}

// --- Slave drop targets ---
const dragOverIndex = ref<number | null>(null);
const dragOverBottom = ref(false);

function onSlaveDragOver(e: DragEvent, idx: number) {
  if (dragState?.type !== 'slave') return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  dragOverIndex.value = idx;
}

function onDragLeave(e: DragEvent, idx: number) {
  if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as Node)) return;
  if (dragOverIndex.value === idx) dragOverIndex.value = null;
}

function onBottomDragLeave(e: DragEvent) {
  if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as Node)) return;
  dragOverBottom.value = false;
}

function onBottomDragOver(e: DragEvent) {
  if (dragState?.type !== 'slave') return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  dragOverBottom.value = true;
}

function onSlaveDrop(toIndex: number) {
  dragOverIndex.value = null;
  dragOverBottom.value = false;
  if (dragState?.type !== 'slave') return;
  const { fromSIndex } = dragState;
  if (fromSIndex === toIndex || fromSIndex + 1 === toIndex) return;
  moveSlave(fromSIndex, toIndex);
  setDragState(null);
}
</script>
