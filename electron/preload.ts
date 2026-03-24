export interface ElectronAPI {
  sendMessage: (message: string, searchEnabled: boolean) => void
  onStreamToken: (callback: (data: { content: string; node: string }) => void) => void
  onStreamCustom: (callback: (data: any) => void) => void
  onStreamDone: (callback: (data: Record<string, never>) => void) => void
  onStreamError: (callback: (data: { message: string }) => void) => void
  onStreamInterrupt: (callback: (data: any) => void) => void
  sendConfirmResponse: (response: { id: string; confirmed: boolean }) => void
  sendClarifyResponse: (response: { id: string; selected: string[]; freeText?: string }) => void
  resetConversation: () => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
