<template>
  <div class="confirm-dialog-overlay" v-if="request">
    <div class="confirm-dialog">
      <div class="confirm-icon">🔧</div>
      <h3>다음 작업을 실행할까요?</h3>
      <p class="action-name">{{ request.action }}</p>
      <p class="action-desc">{{ request.description }}</p>
      <div class="confirm-actions">
        <button class="btn-confirm" @click="$emit('confirm', true)">확인</button>
        <button class="btn-cancel" @click="$emit('confirm', false)">취소</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  request: {
    id: string
    action: string
    description: string
    scriptId?: string
  } | null
}>()

defineEmits<{
  confirm: [confirmed: boolean]
}>()
</script>

<style scoped>
.confirm-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.confirm-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  max-width: 420px;
  width: 90%;
  text-align: center;
}
.confirm-icon { font-size: 2rem; margin-bottom: 8px; }
.confirm-dialog h3 { margin: 0 0 12px; font-size: 1.1rem; }
.action-name { font-weight: 600; margin: 4px 0; }
.action-desc { color: #666; font-size: 0.9rem; margin: 4px 0 16px; }
.confirm-actions { display: flex; gap: 12px; justify-content: center; }
.btn-confirm, .btn-cancel {
  padding: 8px 24px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-confirm { background: #4a90d9; color: #fff; }
.btn-confirm:hover { background: #3a7bc8; }
.btn-cancel { background: #e8e8e8; color: #333; }
.btn-cancel:hover { background: #ddd; }
</style>
