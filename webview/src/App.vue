<template>
  <div>
    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
    <template v-else-if="data?.slaves">
      <div class="slave-list">
        <!-- Insert zone before first slave -->
        <div class="insert-zone">
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
          <div v-if="sIdx < data.slaves.length - 1" class="insert-zone">
            <div class="insert-divider" @click="onInsertSlave(sIdx + 1)">
              <span class="insert-line"></span>
              <button class="insert-btn">+</button>
              <span class="insert-line"></span>
            </div>
          </div>
        </template>

        <div class="add-bottom-bar">
          <button @click="onAddSlave">+ Add Slave (SN)</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import SlaveCard from './components/SlaveCard.vue';
import { data, errorMessage, addSlave, addSlaveAt } from './composables/useVscode';

function onAddSlave() {
  addSlave();
}

function onInsertSlave(sIndex: number) {
  addSlaveAt(sIndex);
}
</script>
