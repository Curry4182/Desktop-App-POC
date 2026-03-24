<template>
  <div class="search-toggle">
    <label class="toggle-label">
      <span class="toggle-text">검색</span>
      <div class="toggle-switch" :class="{ active: enabled }" @click="toggle">
        <div class="toggle-thumb" />
      </div>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const enabled = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

function toggle() {
  enabled.value = !enabled.value
}
</script>

<style scoped>
.search-toggle { display: inline-flex; align-items: center; }
.toggle-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.toggle-text { font-size: 0.85rem; color: #666; }
.toggle-switch {
  width: 40px;
  height: 22px;
  background: #ccc;
  border-radius: 11px;
  position: relative;
  transition: background 0.2s;
}
.toggle-switch.active { background: #4a90d9; }
.toggle-thumb {
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: left 0.2s;
}
.toggle-switch.active .toggle-thumb { left: 20px; }
</style>
