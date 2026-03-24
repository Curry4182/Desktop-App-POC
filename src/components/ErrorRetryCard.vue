<template>
  <div class="error-card" v-if="error">
    <div class="error-header">
      <span class="error-icon">⚠️</span>
      <span>요청을 처리하는 중 문제가 발생했습니다.</span>
    </div>
    <p class="error-reason">원인: {{ errorMessage }}</p>
    <div class="error-actions">
      <button class="btn-retry" @click="$emit('retry')">다시 시도</button>
      <button class="btn-dismiss" @click="$emit('dismiss')">취소</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  error: { message: string; errorType: string } | null
}>()

defineEmits<{
  retry: []
  dismiss: []
}>()

const ERROR_MESSAGES: Record<string, string> = {
  api_error: 'API 서버 응답 오류',
  timeout: 'API 응답 시간 초과',
  script_error: '스크립트 실행 실패',
  unknown: '알 수 없는 오류',
}

const errorMessage = computed(() => {
  if (!props.error) return ''
  return ERROR_MESSAGES[props.error.errorType] || props.error.message
})
</script>

<style scoped>
.error-card {
  background: #fff5f5;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 16px;
  margin: 8px 0;
}
.error-header { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.error-icon { font-size: 1.2rem; }
.error-reason { color: #666; font-size: 0.9rem; margin: 8px 0; }
.error-actions { display: flex; gap: 12px; }
.btn-retry {
  padding: 6px 16px;
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-dismiss {
  padding: 6px 16px;
  background: #e8e8e8;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>
