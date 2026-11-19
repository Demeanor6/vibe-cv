<script setup lang="ts">
import { ref } from 'vue';
import { BADGE_ROWS, MEDIA } from '@/data/cases';

const emit = defineEmits<{
  (e: 'swing'): void;
}>();

const rootEl = ref<HTMLElement | null>(null);

defineExpose({
  el: rootEl,
});
</script>

<template>
  <div ref="rootEl" class="badge">
    <img :src="MEDIA.badge" alt="Designer ID badge lanyard" draggable="false" />
    <div class="card">
      <h4>DESIGNER<br />CARD</h4>
      <span class="yr">2026</span>
      <div class="role">ART DIRECTOR // DESIGNER</div>
      <div
        class="ph"
        :style="{ backgroundImage: `url(${MEDIA.cut})` }"
        aria-hidden="true"
      />
      <div v-for="row in BADGE_ROWS" :key="row.label" class="row">
        <span>{{ row.label }}</span>
        <b>{{ row.value }}</b>
      </div>
    </div>
    <div class="hit" @pointerenter="emit('swing')" />
  </div>
</template>
