import { contextBridge, ipcRenderer } from 'electron'

/**
 * contextBridge로 renderer에 안전한 API 노출
 * Vue 컴포넌트에서 window.electronAPI.xxx() 형태로 사용
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 메시지 전송 → LangGraph Agent → 응답 반환
   * @param message - 사용자 입력
   * @param history - 이전 대화 기록 (선택)
   */
  sendMessage: (message: string, history: unknown[] = []) =>
    ipcRenderer.invoke('agent:message', { message, history }),

  /**
   * UI 액션 이벤트 수신 (main → renderer)
   * 에이전트가 UI 조작 명령을 보낼 때 트리거됨
   */
  onUIAction: (callback: (action: unknown) => void) => {
    ipcRenderer.on('ui:action', (_event, action) => callback(action))
  },

  /**
   * 스트리밍 응답 수신 (향후 확장용)
   */
  onStreamChunk: (callback: (chunk: unknown) => void) => {
    ipcRenderer.on('agent:stream', (_event, chunk) => callback(chunk))
  },

  /**
   * 리스너 정리 (컴포넌트 unmount 시 호출)
   */
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
