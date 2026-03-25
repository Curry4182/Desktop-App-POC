import type { ResearchSource } from '../agent/shared/types/research.js'

export type TokenUsage = {
  input: number
  output: number
  total: number
}

export type MessageStep = {
  summary: string
  category: string
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  steps?: MessageStep[]
  sources?: ResearchSource[]
  tokenUsage?: Record<string, TokenUsage>
  isStreaming?: boolean
}

export type ConfirmRequest = {
  id: string
  action: string
  description: string
  scriptId?: string
}

export type ClarifyOption = {
  label: string
  value: string
}

export type ClarifyRequest = {
  id: string
  question: string
  options: ClarifyOption[]
}

export type StreamTokenPayload = {
  content: string
  node: string
}

export type StreamDonePayload = {
  tokenUsage?: Record<string, TokenUsage>
}

export type StreamErrorPayload = {
  message: string
}

export type ConfirmInterruptPayload = {
  interruptType: 'confirm'
  id: string
  action: string
  description: string
  scriptId?: string
}

export type ClarifyInterruptPayload = {
  interruptType: 'clarify'
  id: string
  question: string
  options: ClarifyOption[]
}

export type StreamInterruptPayload =
  | ConfirmInterruptPayload
  | ClarifyInterruptPayload

export interface ElectronAPI {
  sendMessage: (message: string, searchEnabled: boolean) => void
  onStreamToken: (callback: (data: StreamTokenPayload) => void) => void
  onStreamCustom: (callback: (data: any) => void) => void
  onStreamDone: (callback: (data: StreamDonePayload) => void) => void
  onStreamError: (callback: (data: StreamErrorPayload) => void) => void
  onStreamInterrupt: (callback: (data: StreamInterruptPayload) => void) => void
  sendConfirmResponse: (response: { id: string; confirmed: boolean }) => void
  sendClarifyResponse: (response: { id: string; selected: string[]; freeText?: string }) => void
  resetConversation: () => void
  removeAllListeners: (channel: string) => void
}
