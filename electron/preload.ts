import type { ElectronAPI } from '../shared/chat-protocol.js'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
