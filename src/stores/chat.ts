import { defineStore } from 'pinia'
import { ref } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  diagnosticResults?: unknown
}

interface AgentResult {
  response: string
  route: string
  uiAction: { action: string; params?: Record<string, unknown> } | null
  diagnosticResults: unknown
}

declare global {
  interface Window {
    electronAPI?: {
      sendMessage: (text: string) => Promise<AgentResult>
      onUIAction: (cb: (action: { action: string }) => void) => void
    }
  }
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([
    {
      role: 'assistant',
      content: '안녕하세요! Design Assistant입니다.\n\nCAD 설계 질문, PC 진단, UI 제어 등 무엇이든 물어보세요.\n\n예시:\n- "CATIA가 설치되어 있는지 확인해줘"\n- "Part Design에서 Pad 사용법 알려줘"\n- "진단 패널 열어줘"',
      timestamp: Date.now(),
    },
  ])
  const isLoading = ref(false)
  const lastRoute = ref<string | null>(null)
  const lastDiagnosticResult = ref<unknown>(null)
  const showDiagnosticPanel = ref(false)

  /**
   * 메시지 전송 → IPC → LangGraph Agent
   */
  async function sendMessage(text: string) {
    messages.value.push({
      role: 'user',
      content: text,
      timestamp: Date.now(),
    })

    isLoading.value = true

    try {
      let result: AgentResult

      if (window.electronAPI) {
        // Electron 환경: IPC 사용
        result = await window.electronAPI.sendMessage(text)
      } else {
        // 브라우저 환경(개발): mock
        result = await mockResponse(text)
      }

      lastRoute.value = result.route

      if (result.diagnosticResults) {
        lastDiagnosticResult.value = result.diagnosticResults
        showDiagnosticPanel.value = true
      }

      messages.value.push({
        role: 'assistant',
        content: result.response || '응답을 받지 못했습니다.',
        timestamp: Date.now(),
        diagnosticResults: result.diagnosticResults ?? null,
      })

      // UI 액션 처리
      if (result.uiAction) {
        executeUIAction(result.uiAction)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      messages.value.push({
        role: 'assistant',
        content: `오류가 발생했습니다: ${message}`,
        timestamp: Date.now(),
      })
    } finally {
      isLoading.value = false
    }
  }

  /**
   * UI 액션 실행 (IPC에서도 호출 가능)
   */
  function executeUIAction(action: { action: string; params?: Record<string, unknown> }) {
    if (!action?.action) return

    switch (action.action) {
      case 'openDiagnosticPanel':
        showDiagnosticPanel.value = true
        break
      case 'closeDiagnosticPanel':
        showDiagnosticPanel.value = false
        break
      case 'startDiagnostic':
        sendMessage('PC 진단을 실행해줘')
        break
      case 'clearChat':
        messages.value = []
        break
      case 'openSettings':
        // TODO: 설정 패널 (POC 생략)
        console.log('[UI] 설정 패널 열기 요청')
        break
      case 'exportReport':
        exportReport()
        break
    }
  }

  /**
   * 보고서 내보내기
   */
  function exportReport() {
    const report = messages.value
      .map((m) => `[${m.role.toUpperCase()}] ${m.content}`)
      .join('\n\n---\n\n')

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 개발용 Mock (Electron 없이 브라우저에서 테스트)
   */
  async function mockResponse(text: string): Promise<AgentResult> {
    await new Promise((r) => setTimeout(r, 800))
    return {
      response: `[Mock] 입력: "${text}"\n\nElectron 환경에서 실제 AI 응답이 표시됩니다.`,
      route: 'chat',
      uiAction: null,
      diagnosticResults: null,
    }
  }

  return {
    messages,
    isLoading,
    lastRoute,
    lastDiagnosticResult,
    showDiagnosticPanel,
    sendMessage,
    executeUIAction,
  }
})
