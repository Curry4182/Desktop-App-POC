import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  ChatMessage as Message,
  ClarifyRequest,
  ConfirmRequest,
  MessageStep,
  StreamInterruptPayload,
  StreamTokenPayload,
} from '../../shared/chat-protocol.js'

function toStep(data: any): MessageStep | null {
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

function createWelcomeMessage(): Message {
  return {
    role: 'assistant',
    content: '안녕하세요! Design Assistant입니다.\n\nCAD 설계 질문, PC 진단, 정보 검색 등 무엇이든 물어보세요.',
    timestamp: Date.now(),
  }
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([createWelcomeMessage()])
  const isLoading = ref(false)
  const searchEnabled = ref(true)
  const lastError = ref<{ message: string } | null>(null)
  const lastUserMessage = ref<string | null>(null)

  const pendingConfirm = ref<ConfirmRequest | null>(null)
  const pendingClarify = ref<ClarifyRequest | null>(null)

  let listenersSetup = false
  let lastActiveNode = ''

  function setupListeners() {
    if (listenersSetup || !window.electronAPI) return
    listenersSetup = true

    window.electronAPI.removeAllListeners('stream:token')
    window.electronAPI.removeAllListeners('stream:custom')
    window.electronAPI.removeAllListeners('stream:done')
    window.electronAPI.removeAllListeners('stream:error')
    window.electronAPI.removeAllListeners('stream:interrupt')
    window.electronAPI.resetConversation()

    window.electronAPI.onStreamToken((data: StreamTokenPayload) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (!lastMsg || !lastMsg.isStreaming) return

      if (data.node && data.node !== lastActiveNode) {
        lastActiveNode = data.node
        if (!lastMsg.steps) lastMsg.steps = []
        const nodeNames: Record<string, string> = {
          assistant: '응답 생성 중',
          model: '응답 생성 중',
          research: '자료조사 중',
          tools: '도구 실행 중',
        }
        lastMsg.steps.push({
          summary: nodeNames[data.node] || data.node,
          category: 'system',
        })
      }

      lastMsg.content += data.content
    })

    window.electronAPI.onStreamCustom((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (!lastMsg || !lastMsg.isStreaming) return

      if (data.type === 'answer_token') {
        if (data.node && data.node !== lastActiveNode) {
          lastActiveNode = data.node
          if (!lastMsg.steps) lastMsg.steps = []
          const nodeNames: Record<string, string> = {
            assistant: '응답 생성 중',
            model: '응답 생성 중',
            research: '자료조사 중',
            tools: '도구 실행 중',
          }
          lastMsg.steps.push({
            summary: nodeNames[data.node] || data.node,
            category: 'system',
          })
        }
        lastMsg.content += data.content
        return
      }

      if (!lastMsg.steps) lastMsg.steps = []
      const step = toStep(data)
      if (step) lastMsg.steps.push(step)

      if (data.type === 'source_found' && data.title && data.url) {
        if (!lastMsg.sources) lastMsg.sources = []
        if (!lastMsg.sources.some((source: { title: string }) => source.title === data.title)) {
          lastMsg.sources.push({
            title: data.title,
            content: data.snippet || '',
            sourceType: 'wikipedia',
            url: data.url,
          })
        }
      }
    })

    window.electronAPI.onStreamDone((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg?.isStreaming) {
        lastMsg.isStreaming = false
      }
      if (lastMsg && data?.tokenUsage && Object.keys(data.tokenUsage).length > 0) {
        lastMsg.tokenUsage = data.tokenUsage
      }
      lastActiveNode = ''
      isLoading.value = false
      lastError.value = null
    })

    window.electronAPI.onStreamError((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg?.isStreaming) {
        lastMsg.content = `오류가 발생했습니다: ${data.message}`
        lastMsg.isStreaming = false
      }
      lastActiveNode = ''
      isLoading.value = false
      lastError.value = data
    })

    window.electronAPI.onStreamInterrupt((data: StreamInterruptPayload) => {
      isLoading.value = false

      if (data.interruptType === 'confirm') {
        pendingConfirm.value = {
          id: data.id,
          action: data.action,
          description: data.description,
          scriptId: data.scriptId,
        }
        return
      }

      if (data.interruptType === 'clarify') {
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

    lastActiveNode = ''
    lastUserMessage.value = text
    lastError.value = null
    pendingConfirm.value = null
    pendingClarify.value = null

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
      return
    }

    setTimeout(() => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg?.isStreaming) {
        lastMsg.content = `[Mock] "${text}" — Electron 환경에서 실제 AI 응답이 표시됩니다.`
        lastMsg.isStreaming = false
      }
      isLoading.value = false
    }, 800)
  }

  function retryLastMessage() {
    if (!lastUserMessage.value) return

    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg?.role === 'assistant') messages.value.pop()

    const prevMsg = messages.value[messages.value.length - 1]
    if (prevMsg?.role === 'user') messages.value.pop()

    sendMessage(lastUserMessage.value)
  }

  function dismissError() {
    lastError.value = null
  }

  function respondToConfirm(confirmed: boolean) {
    if (!pendingConfirm.value || !window.electronAPI) return

    isLoading.value = true
    window.electronAPI.sendConfirmResponse({
      id: String(pendingConfirm.value.id),
      confirmed: !!confirmed,
    })
    pendingConfirm.value = null
  }

  function respondToClarify(selected: string[], freeText?: string) {
    if (!pendingClarify.value || !window.electronAPI) return

    isLoading.value = true
    window.electronAPI.sendClarifyResponse({
      id: String(pendingClarify.value.id),
      selected: [...selected],
      freeText: freeText || undefined,
    })
    pendingClarify.value = null
  }

  function toggleSearch(enabled: boolean) {
    searchEnabled.value = enabled
  }

  function clearChat() {
    messages.value = [createWelcomeMessage()]
    isLoading.value = false
    lastError.value = null
    lastUserMessage.value = null
    pendingConfirm.value = null
    pendingClarify.value = null
    lastActiveNode = ''
    window.electronAPI?.resetConversation()
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
