import { defineStore } from 'pinia'
import { ref } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  diagnosticResults?: unknown
  steps?: Array<{ step: string; summary: string }>
  isStreaming?: boolean
}

interface ConfirmRequest {
  id: string
  action: string
  description: string
  scriptId?: string
}

interface ClarifyRequest {
  id: string
  question: string
  options: Array<{ label: string; value: string }>
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([
    {
      role: 'assistant',
      content: '안녕하세요! Design Assistant입니다.\n\nCAD 설계 질문, PC 진단, 정보 검색 등 무엇이든 물어보세요.',
      timestamp: Date.now(),
    },
  ])
  const isLoading = ref(false)
  const lastAgentName = ref<string | null>(null)
  const lastDiagnosticResult = ref<unknown>(null)
  const showDiagnosticPanel = ref(false)
  const searchEnabled = ref(true)
  const lastError = ref<{ message: string; errorType: string } | null>(null)
  const lastUserMessage = ref<string | null>(null)

  // HITL state
  const pendingConfirm = ref<ConfirmRequest | null>(null)
  const pendingClarify = ref<ClarifyRequest | null>(null)

  let listenersSetup = false

  function setupListeners() {
    if (listenersSetup || !window.electronAPI) return
    listenersSetup = true

    window.electronAPI.onStreamToken((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.content += data.content
      }
    })

    window.electronAPI.onStreamStep((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        if (!lastMsg.steps) lastMsg.steps = []
        lastMsg.steps.push(data)
      }
    })

    window.electronAPI.onStreamDone((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.content = data.response
        lastMsg.isStreaming = false
        lastMsg.diagnosticResults = data.diagnosticResults
      }
      lastAgentName.value = data.agentName
      if (data.diagnosticResults) {
        lastDiagnosticResult.value = data.diagnosticResults
        showDiagnosticPanel.value = true
      }
      isLoading.value = false
      lastError.value = null
    })

    window.electronAPI.onStreamError((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.content = `오류가 발생했습니다: ${data.message}`
        lastMsg.isStreaming = false
      }
      isLoading.value = false
      lastError.value = data
    })

    window.electronAPI.onConfirmRequest((data) => {
      pendingConfirm.value = data
    })

    window.electronAPI.onClarifyRequest((data) => {
      pendingClarify.value = data
    })
  }

  function sendMessage(text: string) {
    setupListeners()

    lastUserMessage.value = text
    lastError.value = null

    messages.value.push({
      role: 'user',
      content: text,
      timestamp: Date.now(),
    })

    // Create streaming placeholder
    messages.value.push({
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      steps: [],
    })

    isLoading.value = true

    if (window.electronAPI) {
      window.electronAPI.sendMessage(text, searchEnabled.value)
    } else {
      // Mock for dev without Electron
      setTimeout(() => {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.isStreaming) {
          lastMsg.content = `[Mock] "${text}" — Electron 환경에서 실제 AI 응답이 표시됩니다.`
          lastMsg.isStreaming = false
        }
        isLoading.value = false
      }, 800)
    }
  }

  function retryLastMessage() {
    if (lastUserMessage.value) {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        messages.value.pop()
      }
      const prevMsg = messages.value[messages.value.length - 1]
      if (prevMsg && prevMsg.role === 'user') {
        messages.value.pop()
      }
      sendMessage(lastUserMessage.value)
    }
  }

  function dismissError() {
    lastError.value = null
  }

  function respondToConfirm(confirmed: boolean) {
    if (pendingConfirm.value && window.electronAPI) {
      window.electronAPI.sendConfirmResponse({
        id: pendingConfirm.value.id,
        confirmed,
      })
      pendingConfirm.value = null
    }
  }

  function respondToClarify(selected: string[], freeText?: string) {
    if (pendingClarify.value && window.electronAPI) {
      window.electronAPI.sendClarifyResponse({
        id: pendingClarify.value.id,
        selected,
        freeText,
      })
      pendingClarify.value = null
    }
  }

  function toggleSearch(enabled: boolean) {
    searchEnabled.value = enabled
    if (window.electronAPI) {
      window.electronAPI.toggleSearch(enabled)
    }
  }

  function clearChat() {
    messages.value = [{
      role: 'assistant',
      content: '안녕하세요! Design Assistant입니다.\n\nCAD 설계 질문, PC 진단, 정보 검색 등 무엇이든 물어보세요.',
      timestamp: Date.now(),
    }]
    lastError.value = null
  }

  return {
    messages,
    isLoading,
    lastAgentName,
    lastDiagnosticResult,
    showDiagnosticPanel,
    searchEnabled,
    lastError,
    pendingConfirm,
    pendingClarify,
    sendMessage,
    retryLastMessage,
    dismissError,
    respondToConfirm,
    respondToClarify,
    toggleSearch,
    clearChat,
  }
})
