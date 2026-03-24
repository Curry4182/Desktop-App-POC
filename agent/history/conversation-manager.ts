import type { BaseMessage } from '@langchain/core/messages'
import { SystemMessage } from '@langchain/core/messages'
import { createLLM } from '../llm-factory.js'

const WINDOW_SIZE = parseInt(process.env.CONVERSATION_WINDOW_SIZE || '10', 10)

const SUMMARIZE_PROMPT = `다음 대화 내용을 간결하게 요약하세요. 핵심 주제, 해결된 문제, 중요한 결정사항만 포함하세요. 한국어로 작성하세요.`

export class ConversationManager {
  private allMessages: BaseMessage[] = []
  private summary: string | null = null
  private windowSize: number

  constructor(windowSize: number = WINDOW_SIZE) {
    this.windowSize = windowSize
  }

  addMessage(message: BaseMessage): void {
    this.allMessages.push(message)
  }

  setSummary(summary: string): void {
    this.summary = summary
  }

  getSummary(): string | null {
    return this.summary
  }

  getMessages(): BaseMessage[] {
    const result: BaseMessage[] = []

    if (this.summary) {
      result.push(new SystemMessage(`[이전 대화 요약] ${this.summary}`))
    }

    const recent = this.allMessages.slice(-this.windowSize)
    result.push(...recent)

    return result
  }

  async summarizeIfNeeded(): Promise<void> {
    if (this.allMessages.length <= this.windowSize) return

    const overflow = this.allMessages.slice(0, this.allMessages.length - this.windowSize)
    if (overflow.length === 0) return

    const llm = createLLM({ temperature: 0.3, maxTokens: 512 })
    const conversationText = overflow
      .map(m => `${m._getType()}: ${m.content}`)
      .join('\n')

    const response = await llm.invoke([
      new SystemMessage(SUMMARIZE_PROMPT),
      new SystemMessage(`대화 내용:\n${conversationText}`),
    ])

    const newSummary = String(response.content)
    this.summary = this.summary
      ? `${this.summary}\n${newSummary}`
      : newSummary

    // Keep only recent messages
    this.allMessages = this.allMessages.slice(-this.windowSize)
  }

  reset(): void {
    this.allMessages = []
    this.summary = null
  }

  getRecentCount(): number {
    return this.allMessages.length
  }
}
