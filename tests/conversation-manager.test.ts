import { describe, it, expect } from 'vitest'
import { ConversationManager } from '../agent/history/conversation-manager.js'
import { HumanMessage, AIMessage } from '@langchain/core/messages'

describe('ConversationManager', () => {
  it('should keep recent messages within window size', () => {
    const manager = new ConversationManager(4)
    manager.addMessage(new HumanMessage('Hello'))
    manager.addMessage(new AIMessage('Hi'))
    manager.addMessage(new HumanMessage('How are you?'))
    manager.addMessage(new AIMessage('Good!'))

    const messages = manager.getMessages()
    expect(messages.length).toBe(4)
  })

  it('should return summary as first system message when set', () => {
    const manager = new ConversationManager(2)
    manager.addMessage(new HumanMessage('msg1'))
    manager.addMessage(new AIMessage('reply1'))
    manager.addMessage(new HumanMessage('msg2'))
    manager.addMessage(new AIMessage('reply2'))

    manager.setSummary('Previously discussed: msg1 and reply1')
    const messages = manager.getMessages()

    // Should have summary (system) + last 2 messages within window
    expect(messages.length).toBe(3)
    expect(messages[0].content).toContain('이전 대화 요약')
  })

  it('should clear all messages on reset', () => {
    const manager = new ConversationManager(10)
    manager.addMessage(new HumanMessage('test'))
    manager.reset()
    expect(manager.getMessages().length).toBe(0)
    expect(manager.getSummary()).toBeNull()
  })
})
