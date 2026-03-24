<template>
  <div class="source-modal-overlay" v-if="source" @click.self="$emit('close')">
    <div class="source-modal">
      <div class="source-modal-header">
        <div class="source-badge-type">{{ sourceTypeLabel }}</div>
        <h3>{{ source.title }}</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>
      <div class="source-modal-body">
        <div class="source-content">{{ source.content }}</div>
      </div>
      <div class="source-modal-footer">
        <div class="source-meta">
          <span v-if="source.url" class="meta-item">
            <span class="meta-label">URL</span>
            <a :href="source.url" class="meta-link" target="_blank" rel="noopener">{{ source.url }}</a>
          </span>
          <span v-if="source.documentId" class="meta-item">
            <span class="meta-label">문서 ID</span>
            <span class="meta-value">{{ source.documentId }}</span>
          </span>
          <span v-if="source.sourceType" class="meta-item">
            <span class="meta-label">소스</span>
            <span class="meta-value">{{ sourceTypeLabel }}</span>
          </span>
          <span v-if="source.lastUpdated" class="meta-item">
            <span class="meta-label">최종 수정</span>
            <span class="meta-value">{{ source.lastUpdated }}</span>
          </span>
          <template v-if="source.metadata">
            <span v-for="(val, key) in source.metadata" :key="key" class="meta-item">
              <span class="meta-label">{{ key }}</span>
              <span class="meta-value">{{ val }}</span>
            </span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  source: {
    title: string
    content: string
    sourceType: string
    url?: string
    documentId?: string
    lastUpdated?: string
    metadata?: Record<string, unknown>
  } | null
}>()

defineEmits<{ close: [] }>()

const SOURCE_TYPE_LABELS: Record<string, string> = {
  wikipedia: 'Wikipedia',
  internal: '사내 정보',
  other: '기타',
}

const sourceTypeLabel = computed(() =>
  props.source ? SOURCE_TYPE_LABELS[props.source.sourceType] || props.source.sourceType : ''
)
</script>

<style scoped>
.source-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.source-modal {
  background: #fff;
  border-radius: 16px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.source-modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.source-modal-header h3 {
  flex: 1;
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: #1e293b;
}

.source-badge-type {
  font-size: 11px;
  font-weight: 600;
  background: #e0e8f0;
  color: #002C5F;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.close-btn:hover { color: #1e293b; }

.source-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.source-content {
  font-size: 14px;
  line-height: 1.7;
  color: #334155;
  white-space: pre-wrap;
}

.source-modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0 0 16px 16px;
}

.source-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.meta-label {
  color: #94a3b8;
  font-weight: 500;
}

.meta-value { color: #64748b; }

.meta-link {
  color: #4a90d9;
  text-decoration: none;
  word-break: break-all;
}

.meta-link:hover { text-decoration: underline; }
</style>
