<template>
  <div class="message-bubble" :class="message.role">
    <div class="bubble-content">
      <div class="text" v-html="formattedContent"></div>
      <span class="time">{{ formatTime(message.timestamp) }}</span>
    </div>
    <div v-if="message.diagnosticResults" class="diagnostic-summary">
      <button @click="toggleDetails" class="toggle-btn">
        {{ showDetails ? '▲ 상세 닫기' : '▼ 진단 결과 보기' }}
      </button>
      <pre v-if="showDetails" class="diagnostic-json">{{ JSON.stringify(message.diagnosticResults, null, 2) }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

const showDetails = ref(false)

function toggleDetails() {
  showDetails.value = !showDetails.value
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

const formattedContent = computed(() => {
  let text = props.message.content || ''
  text = text.replace(/```[\s\S]*?```/g, (m) => `<pre class="code-block">${m.replace(/```\w*\n?/g, '')}</pre>`)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\n/g, '<br>')
  return text
})
</script>

<style scoped>
.message-bubble {
  display: flex;
  flex-direction: column;
  max-width: 76%;
}

.message-bubble.user {
  align-self: flex-end;
}

.message-bubble.assistant {
  align-self: flex-start;
}

.bubble-content {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
}

.user .bubble-content {
  background: #002C5F;
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.assistant .bubble-content {
  background: #ffffff;
  color: #1e293b;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 4px;
}

.time {
  display: block;
  font-size: 10px;
  margin-top: 4px;
  opacity: 0.5;
  text-align: right;
}

.user .time {
  color: #1e293b;
}

.assistant .time {
  color: #64748b;
}

:deep(.code-block) {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  overflow-x: auto;
  margin: 6px 0;
  white-space: pre;
  font-family: ui-monospace, 'Courier New', monospace;
  color: #1e293b;
}

:deep(code) {
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  font-family: ui-monospace, 'Courier New', monospace;
  color: #002C5F;
}

.diagnostic-summary {
  margin-top: 6px;
}

.toggle-btn {
  font-size: 12px;
  font-family: 'Pretendard', inherit;
  background: none;
  border: 1px solid #cbd5e1;
  color: #64748b;
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.toggle-btn:hover {
  border-color: #002C5F;
  color: #002C5F;
}

.diagnostic-json {
  margin-top: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 11px;
  overflow-x: auto;
  max-height: 280px;
  overflow-y: auto;
  color: #64748b;
  white-space: pre;
  font-family: ui-monospace, 'Courier New', monospace;
}
</style>
