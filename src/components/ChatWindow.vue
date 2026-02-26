<template>
  <div class="chat-window">
    <div class="messages" ref="messagesEl">
      <MessageBubble
        v-for="(msg, idx) in chatStore.messages"
        :key="idx"
        :message="msg"
      />
      <div v-if="chatStore.isLoading" class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
    <div class="input-area">
      <div class="route-badge" v-if="chatStore.lastRoute">
        {{ routeLabel(chatStore.lastRoute) }}
      </div>
      <div class="input-row">
        <textarea
          v-model="inputText"
          @keydown.enter.exact.prevent="sendMessage"
          placeholder="메시지를 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
          :disabled="chatStore.isLoading"
          rows="2"
        />
        <button
          @click="sendMessage"
          :disabled="chatStore.isLoading || !inputText.trim()"
          class="send-btn"
        >
          전송
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import MessageBubble from './MessageBubble.vue'
import { useChatStore } from '../stores/chat.js'

const chatStore = useChatStore()
const inputText = ref('')
const messagesEl = ref(null)

const ROUTE_LABELS = {
  rag: 'RAG',
  diagnostic: '진단',
  ui_action: 'UI',
  chat: '채팅',
}

function routeLabel(route) {
  return ROUTE_LABELS[route] || route
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || chatStore.isLoading) return

  inputText.value = ''
  await chatStore.sendMessage(text)
}

watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  }
)

onMounted(() => {
  if (window.electronAPI) {
    window.electronAPI.onUIAction((action) => {
      chatStore.executeUIAction(action)
    })
  }
})
</script>

<style scoped>
.chat-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f3f5f6;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.messages::-webkit-scrollbar {
  width: 4px;
}
.messages::-webkit-scrollbar-track {
  background: transparent;
}
.messages::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 2px;
}

.typing-indicator {
  display: flex;
  gap: 5px;
  padding: 12px 14px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  align-self: flex-start;
  width: fit-content;
}

.typing-indicator span {
  width: 7px;
  height: 7px;
  background: #94a3b8;
  border-radius: 50%;
  animation: bounce 1.2s infinite;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}

.input-area {
  border-top: 1px solid #e2e8f0;
  padding: 12px 24px 16px;
  background: #ffffff;
  flex-shrink: 0;
}

.route-badge {
  font-size: 11px;
  color: #002C5F;
  font-weight: 600;
  margin-bottom: 8px;
  background: #e0e8f0;
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.input-row {
  display: flex;
  gap: 10px;
}

textarea {
  flex: 1;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #1e293b;
  padding: 10px 14px;
  font-size: 14px;
  resize: none;
  outline: none;
  font-family: 'Pretendard', inherit;
  transition: border-color 0.15s ease-in-out;
  line-height: 1.5;
}

textarea:focus {
  border-color: #002C5F;
  background: #ffffff;
}

textarea::placeholder {
  color: #94a3b8;
}

textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.send-btn {
  background: #002C5F;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0 22px;
  font-size: 14px;
  font-weight: 500;
  font-family: 'Pretendard', inherit;
  cursor: pointer;
  transition: background 0.15s ease-in-out;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #001f45;
}

.send-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}
</style>
