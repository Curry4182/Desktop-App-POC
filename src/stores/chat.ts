import { defineStore } from 'pinia'
import { ref } from 'vue'

interface ResearchSource {
  title: string
  content: string
  sourceType: string
  url?: string
  documentId?: string
  metadata?: Record<string, unknown>
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  steps?: Array<{ type: string; [key: string]: any }>
  sources?: ResearchSource[]
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

function toStep(data: any): { summary: string; category: string } | null {
  switch (data.type) {
    case 'search_start':
      return { summary: `검색: "${data.query}"`, category: 'search' }
    case 'search_result':
      if (data.count === 0) return { summary: '검색 결과 없음', category: 'search' }
      return { summary: `${data.count}개 문서: ${data.titles?.join(', ') || ''}`, category: 'search' }
    case 'source_found':
      return { summary: `출처: ${data.title}`, category: 'search' }
    case 'research_step':
      return { summary: data.step, category: 'research' }
    default:
      return data.summary ? { summary: data.summary, category: data.category || 'system' } : null
  }
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
  const searchEnabled = ref(true)
  const lastError = ref<{ message: string } | null>(null)
  const lastUserMessage = ref<string | null>(null)

  const pendingConfirm = ref<ConfirmRequest | null>(null)
  const pendingClarify = ref<ClarifyRequest | null>(null)

  let listenersSetup = false

  function setupListeners() {
    if (listenersSetup || !window.electronAPI) return
    listenersSetup = true

    window.electronAPI.resetConversation()

    let lastActiveNode = ''
    window.electronAPI.onStreamToken((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        // Add agent step when node changes
        if (data.node && data.node !== lastActiveNode) {
          lastActiveNode = data.node
          if (!lastMsg.steps) lastMsg.steps = []
          const nodeNames: Record<string, string> = {
            research: '자료조사 에이전트',
            pc_fix: 'PC 진단 에이전트',
            chat: '응답 생성 중',
          }
          const label = nodeNames[data.node] || data.node
          lastMsg.steps.push({ summary: label, category: 'system' })
        }
        lastMsg.content += data.content
      }
    })

    window.electronAPI.onStreamCustom((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        if (!lastMsg.steps) lastMsg.steps = []

        // Transform custom event into step format with summary + category
        const step = toStep(data)
        if (step) lastMsg.steps.push(step)

        if (data.type === 'source_found' && data.title && data.url) {
          if (!lastMsg.sources) lastMsg.sources = []
          if (!lastMsg.sources.some((s: ResearchSource) => s.title === data.title)) {
            lastMsg.sources.push({
              title: data.title,
              content: data.snippet || '',
              sourceType: 'wikipedia',
              url: data.url,
            })
          }
        }
      }
    })

    window.electronAPI.onStreamDone(() => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.isStreaming = false
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

    window.electronAPI.onStreamInterrupt((data) => {
      if (data.interruptType === 'confirm') {
        pendingConfirm.value = {
          id: data.id,
          action: data.action,
          description: data.description,
          scriptId: data.scriptId,
        }
      } else if (data.interruptType === 'clarify') {
        pendingClarify.value = {
          id: data.id,
          question: data.question,
          options: data.options || [],
        }
      }
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
      if (lastMsg && lastMsg.role === 'assistant') messages.value.pop()
      const prevMsg = messages.value[messages.value.length - 1]
      if (prevMsg && prevMsg.role === 'user') messages.value.pop()
      sendMessage(lastUserMessage.value)
    }
  }

  function dismissError() {
    lastError.value = null
  }

  function respondToConfirm(confirmed: boolean) {
    if (pendingConfirm.value && window.electronAPI) {
      window.electronAPI.sendConfirmResponse({
        id: String(pendingConfirm.value.id),
        confirmed: !!confirmed,
      })
      pendingConfirm.value = null
    }
  }

  function respondToClarify(selected: string[], freeText?: string) {
    if (pendingClarify.value && window.electronAPI) {
      window.electronAPI.sendClarifyResponse({
        id: String(pendingClarify.value.id),
        selected: [...selected],
        freeText: freeText || undefined,
      })
      pendingClarify.value = null
    }
  }

  function toggleSearch(enabled: boolean) {
    searchEnabled.value = enabled
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
