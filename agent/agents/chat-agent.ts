import { Command } from '@langchain/langgraph'
import { SystemMessage } from '@langchain/core/messages'
import { createLLM } from '../llm-factory.js'

const WINDOW_SIZE = parseInt(process.env.CONVERSATION_WINDOW_SIZE || '10', 10)

const CHAT_PROMPT = `당신은 CAD 설계 엔지니어를 위한 어시스턴트입니다.
설계 워크플로우, 소프트웨어 도구, 엔지니어링 프로세스에 관한 질문을 도와드립니다.

## 시스템 기능
이 시스템에는 Wikipedia 검색 기능이 있습니다.
검색이 필요한 질문은 검색 에이전트가 처리합니다.
이전 대화에서 자료조사를 통해 답변한 내용은 Wikipedia 검색 결과를 기반으로 합니다.

## 규칙
- 간결하고 전문적으로 답변하세요
- 사용자와 같은 언어로 응답하세요
- 의미 없는 입력(감탄사, 장난)에는 짧게 1문장으로 응답
- 이전 대화 맥락이 있으면 활용하여 후속 질문에 답변하세요
- "실시간 검색을 못합니다" 같은 답변 금지 — 이 시스템은 검색 가능합니다`

const llm = createLLM()

export async function chatNode(state: { messages: any[]; conversationSummary?: string }) {
  const messagesForLLM = [
    new SystemMessage(CHAT_PROMPT),
    ...(state.conversationSummary
      ? [new SystemMessage(`[이전 대화 요약]\n${state.conversationSummary}`)]
      : []),
    ...state.messages.slice(-WINDOW_SIZE),
  ]

  const response = await llm.invoke(messagesForLLM)

  return new Command({
    goto: 'supervisor',
    update: { messages: [response] },
  })
}
