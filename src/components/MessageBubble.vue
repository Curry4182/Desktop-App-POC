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
          {{ src.title }}
        </button>
      </div>

      <!-- Processing steps: current status + expandable history -->
      <div v-if="message.steps && message.steps.length > 0" class="process-steps">
        <div class="step-current" @click="showSteps = !showSteps">
          <span class="toggle-arrow">{{ showSteps ? '▾' : '▸' }}</span>
          <span class="current-label">{{ lastStep.summary }}</span>
          <span v-if="message.isStreaming" class="step-spinner"></span>
        </div>
        <div v-if="showSteps" class="steps-tree">
          <div
            v-for="(step, i) in message.steps"
            :key="i"
            class="step-node"
            :class="stepClass(step)"
          >
            <span class="step-label">{{ step.summary }}</span>
          </div>
        </div>
      </div>

      <!-- Streaming cursor -->
      <span v-if="message.isStreaming" class="streaming-cursor">|</span>

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

const lastStep = computed(() => {
  const steps = props.message.steps || []
  return steps[steps.length - 1] || { summary: '' }
})
const selectedSource = ref(null)

function toggleDetails() {
  showDetails.value = !showDetails.value
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function stepClass(step) {
  // category: system (top-level), research (indent 1), search (indent 2), answer (top-level)
  return `step-${step.category || step.step || 'system'}`
}

const formattedContent = computed(() => {
  let text = props.message.content || ''
  // Remove source/reference lines
  text = text.replace(/^[-*]?\s*\[출처:[^\]]*\]\([^)]*\),?\s*/gm, '')
  text = text.replace(/^[-*]?\s*\[출처:[^\]]*\]\s*$/gm, '')
  text = text.replace(/\[출처:[^\]]*\]\([^)]*\),?\s*/g, '')
  text = text.replace(/\[출처:[^\]]*-\s*https?:\/\/[^\]]*\],?\s*/g, '')
  text = text.replace(/\[출처:[^\]]*\],?\s*/g, '')
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
.message-bubble.user { align-self: flex-end; }
.message-bubble.assistant { align-self: flex-start; }

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

/* ─── Processing Steps (hierarchical tree) ─── */
.process-steps {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.step-current {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #64748b;
  user-select: none;
}
.step-current:hover { color: #475569; }
.toggle-arrow { font-size: 10px; width: 12px; color: #94a3b8; }
.current-label { flex: 1; }

.step-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid #e2e8f0;
  border-top-color: #64748b;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.steps-tree {
  margin-top: 6px;
}

.step-node {
  font-size: 12px;
  color: #64748b;
  padding: 2px 0;
  line-height: 1.5;
}

.step-label {
  display: inline;
}

/* Hierarchy indentation */
.step-system {
  color: #94a3b8;
  font-weight: 500;
  padding-top: 4px;
}
.step-system:first-child { padding-top: 0; }

.step-research {
  padding-left: 16px;
  color: #475569;
  border-left: 2px solid #e2e8f0;
  margin-left: 4px;
}

.step-search {
  padding-left: 32px;
  color: #94a3b8;
  font-size: 11px;
  border-left: 2px solid #f1f5f9;
  margin-left: 4px;
}

.step-answer {
  color: #002C5F;
  font-weight: 500;
  padding-top: 4px;
}

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

/* ─── Streaming ─── */
.streaming-cursor {
  animation: blink 0.8s infinite;
  color: #4a90d9;
  font-weight: 300;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
</style>
