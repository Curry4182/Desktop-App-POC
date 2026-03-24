import type { BaseMessage } from '@langchain/core/messages'

// Stub — will be fully rewritten in Task 10
export async function processMessage(
  userMessage: string,
  history: BaseMessage[] = [],
  threadId: string = 'default',
  searchEnabled: boolean = true,
) {
  return {
    response: '[v2 graph not yet wired]',
    agentName: 'chat' as const,
    diagnosticResults: null,
    messages: history,
  }
}
