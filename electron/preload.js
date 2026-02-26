// @ts-check
// Electron preload — 렌더러 프로세스에서 NODE_OPTIONS(tsx)가 적용되지 않으므로
// 순수 CommonJS JavaScript로 작성. preload.ts는 타입체크 전용.
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 메시지 전송 → LangGraph Agent → 응답 반환
   * @param {string} message
   * @param {unknown[]} history
   */
  sendMessage: (message, history = []) =>
    ipcRenderer.invoke('agent:message', { message, history }),

  /**
   * UI 액션 이벤트 수신 (main → renderer)
   * @param {(action: unknown) => void} callback
   */
  onUIAction: (callback) => {
    ipcRenderer.on('ui:action', (_event, action) => callback(action))
  },

  /**
   * 스트리밍 응답 수신 (향후 확장용)
   * @param {(chunk: unknown) => void} callback
   */
  onStreamChunk: (callback) => {
    ipcRenderer.on('agent:stream', (_event, chunk) => callback(chunk))
  },

  /**
   * 리스너 정리 (컴포넌트 unmount 시 호출)
   * @param {string} channel
   */
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
