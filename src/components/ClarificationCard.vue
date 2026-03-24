<template>
  <div class="clarification-card" v-if="request">
    <p class="question">{{ request.question }}</p>
    <div class="options">
      <label v-for="option in request.options" :key="option.value" class="option-label">
        <input type="checkbox" :value="option.value" v-model="selected" />
        {{ option.label }}
      </label>
      <div class="free-text">
        <label class="option-label">
          <span>직접 입력:</span>
          <input type="text" v-model="freeText" placeholder="여기에 입력하세요..." class="text-input" />
        </label>
      </div>
    </div>
    <button class="btn-submit" @click="submit" :disabled="!hasInput">선택 완료</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

defineProps<{
  request: {
    id: string
    question: string
    options: Array<{ label: string; value: string }>
  } | null
}>()

const emit = defineEmits<{
  respond: [selected: string[], freeText?: string]
}>()

const selected = ref<string[]>([])
const freeText = ref('')
const hasInput = computed(() => selected.value.length > 0 || freeText.value.trim().length > 0)

function submit() {
  emit('respond', selected.value, freeText.value.trim() || undefined)
  selected.value = []
  freeText.value = ''
}
</script>

<style scoped>
.clarification-card {
  background: #f0f4ff;
  border-radius: 12px;
  padding: 16px;
  margin: 8px 0;
}
.question { font-weight: 600; margin: 0 0 12px; }
.options { display: flex; flex-direction: column; gap: 8px; }
.option-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.option-label:hover { background: #e0e8ff; }
.free-text { margin-top: 8px; }
.text-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 0.9rem;
  margin-left: 8px;
}
.btn-submit {
  margin-top: 12px;
  padding: 8px 20px;
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-submit:hover:not(:disabled) { background: #3a7bc8; }
</style>
