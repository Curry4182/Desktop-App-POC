<template>
  <div class="message-bubble" :class="message.role">
    <div class="bubble-content">
      <div class="text" v-html="formattedContent"></div>

      <!-- Source badges (clickable) -->
      <div v-if="message.sources && message.sources.length > 0" class="source-badges">
        <button
          v-for="(src, i) in message.sources"
          :key="i"
          class="source-badge"
          @click="selectedSource = src"
        >
          <span class="badge-icon">📄</span>
          {{ src.title }}
        </button>
      </div>

      <!-- ReAct steps (collapsible) -->
      <div v-if="message.steps && message.steps.length > 0" class="react-steps">
        <div class="step-toggle" @click="showSteps = !showSteps">
          {{ showSteps ? '▼' : '▶' }} 처리 과정 ({{ message.steps.length }}단계)
        </div>
        <div v-if="showSteps" class="steps-list">
          <div v-for="(step, i) in message.steps" :key="i" class="step-item">
            <span class="step-icon">
              {{ step.step === 'thinking' ? '🤔' : step.step === 'action' ? '🔍' : '📄' }}
            </span>
            {{ step.summary }}
          </div>
        </div>
      </div>

      <!-- Streaming cursor -->
      <span v-if="message.isStreaming" class="streaming-cursor">▌</span>

      <span class="time">{{ formatTime(message.timestamp) }}</span>
    </div>
    <div v-if="message.diagnosticResults" class="diagnostic-summary">
      <button @click="toggleDetails" class="toggle-btn">
        {{ showDetails ? '▲ 상세 닫기' : '▼ 진단 결과 보기' }}
      </button>
      <pre v-if="showDetails" class="diagnostic-json">{{ JSON.stringify(message.diagnosticResults, null, 2) }}</pre>
    </div>

    <!-- Source content modal -->
    <SourceModal
      :source="selectedSource"
      @close="selectedSource = null"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import SourceModal from './SourceModal.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

const showDetails = ref(false)
const showSteps = ref(false)
const selectedSource = ref(null)

function toggleDetails() {
  showDetails.value = !showDetails.value
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

const formattedContent = computed(() => {
  let text = props.message.content || ''

  // Remove source/reference lines from text (they're shown as badges now)
  // Pattern: [출처: ...], [출처: ... - URL], [출처: Title](url), - [출처: ...]
  text = text.replace(/^[-*]?\s*\[출처:[^\]]*\]\([^)]*\),?\s*/gm, '')   // markdown links
  text = text.replace(/^[-*]?\s*\[출처:[^\]]*\]\s*$/gm, '')              // plain brackets
  text = text.replace(/\[출처:[^\]]*\]\([^)]*\),?\s*/g, '')              // inline markdown links
  text = text.replace(/\[출처:[^\]]*-\s*https?:\/\/[^\]]*\],?\s*/g, '')  // [출처: Title - URL]
  text = text.replace(/\[출처:[^\]]*\],?\s*/g, '')                        // any remaining [출처: ...]
  // Clean up multiple consecutive blank lines
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.trim()

  // Markdown formatting
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

.user .time { color: #1e293b; }
.assistant .time { color: #64748b; }

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

/* ─── Source Badges ─── */
.source-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #f0f4ff;
  border: 1px solid #d0daf0;
  border-radius: 6px;
  font-size: 12px;
  color: #002C5F;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.source-badge:hover {
  background: #dbe4ff;
  border-color: #002C5F;
}

.badge-icon { font-size: 13px; }

/* ─── Diagnostic ─── */
.diagnostic-summary { margin-top: 6px; }

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

/* ─── ReAct Steps ─── */
.react-steps { margin-top: 8px; font-size: 0.85rem; }
.step-toggle { cursor: pointer; color: #888; user-select: none; }
.step-toggle:hover { color: #555; }
.steps-list { margin-top: 4px; padding-left: 8px; border-left: 2px solid #e0e0e0; }
.step-item { padding: 4px 0; display: flex; align-items: center; gap: 6px; }
.step-icon { font-size: 0.9rem; }
.streaming-cursor { animation: blink 0.8s infinite; color: #4a90d9; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
</style>
