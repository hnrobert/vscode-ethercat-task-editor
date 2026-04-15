<template>
  <div>
    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
    <template v-else-if="data?.slaves">
      <div style="margin-bottom: 10px">
        <button @click="onAddSlave">+ Add Slave (SN)</button>
      </div>
      <SlaveCard
        v-for="(slave, sIdx) in data.slaves"
        :key="sIdx"
        :s-index="sIdx"
        :slave="slave"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import SlaveCard from './components/SlaveCard.vue';
import { data, errorMessage, addSlave } from './composables/useVscode';

function onAddSlave() {
  addSlave();
}
</script>
