export interface ElectronAPI {
  sendMessage: (message: string, searchEnabled?: boolean) => void
  onStreamToken: (callback: (data: { content: string }) => void) => void
  onStreamStep: (callback: (data: { category?: string; summary: string }) => void) => void
  onStreamDone: (callback: (data: {
    response: string
    agentName: string
    diagnosticResults: unknown
    sources: Array<{
      title: string; content: string; sourceType: string;
      url?: string; documentId?: string; metadata?: Record<string, unknown>
    }>
    tokenUsage: Record<string, { input: number; output: number }>
  }) => void) => void
  onStreamError: (callback: (data: { message: string; errorType: string }) => void) => void
  onConfirmRequest: (callback: (data: {
    id: string; action: string; description: string; scriptId?: string
  }) => void) => void
  sendConfirmResponse: (response: { id: string; confirmed: boolean }) => void
  onClarifyRequest: (callback: (data: {
    id: string; question: string; options: Array<{ label: string; value: string }>
  }) => void) => void
  sendClarifyResponse: (response: {
    id: string; selected: string[]; freeText?: string
  }) => void
  toggleSearch: (enabled: boolean) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
