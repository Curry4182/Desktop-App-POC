import { Command } from '@langchain/langgraph'
import { SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { createLLM } from './llm-factory.js'
import type { AgentRoute } from './types.js'

const WINDOW_SIZE = parseInt(process.env.CONVERSATION_WINDOW_SIZE || '10', 10)

const ROUTE_SCHEMA = z.object({
  next: z.enum(['research', 'pc_fix', 'chat', '__end__']).describe('The next agent to route to'),
})

const SUPERVISOR_PROMPT = `사용자 메시지를 분석하여 적절한 에이전트로 라우팅하세요.

라우팅 규칙:
- "research": 새로운 지식 검색이 필요한 질문 (이전에 조사하지 않은 주제), 사용자가 명시적으로 검색 요청
- "pc_fix": PC 문제 진단/해결
- "chat": 일반 대화, 인사, 감탄사, 후속 질문, 이전 대화에 대한 추가 질문, 짧은 반응
- "__end__": 에이전트가 이미 충분한 답변을 생성한 경우 (대화 종료)

## chat으로 라우팅:
- 감탄사/장난: "메롱", "ㅋㅋ", "ㅎㅎ", "안녕"
- 후속 질문: "왜?", "어떻게?", "더 알려줘", "그래서?"
- 이전에 이미 조사한 주제에 대한 추가 질문
- 짧은 반응: "응", "그래", "알겠어"
- 출처 질문: "어떤 자료를 봤어?", "출처 알려줘"

## research로 라우팅:
- 새로운 주제에 대한 질문
- 구체적인 정보 조사가 필요한 질문
- 사용자가 명시적으로 검색/조사를 요청

## __end__로 라우팅:
- 마지막 메시지가 AI의 답변이고, 사용자의 새 메시지가 아닌 경우
- 에이전트가 답변을 완료한 직후`

const llm = createLLM({ temperature: 0 })
const routerLLM = llm.withStructuredOutput(ROUTE_SCHEMA)

export async function supervisorNode(state: {
  messages: any[]
  searchEnabled: boolean
  conversationSummary: string
}) {
  // Check if conversation needs summarization
  if (state.messages.length > WINDOW_SIZE * 2) {
    const oldMessages = state.messages.slice(0, -WINDOW_SIZE)
    const summaryLLM = createLLM({ temperature: 0 })
    const summaryResponse = await summaryLLM.invoke([
      new SystemMessage('이전 대화 내용을 간결하게 요약하세요. 핵심 정보와 맥락만 포함. 2~3문장으로.'),
      ...(state.conversationSummary
        ? [new SystemMessage(`기존 요약: ${state.conversationSummary}`)]
        : []),
      ...oldMessages,
    ])

    const route = await routerLLM.invoke([
      new SystemMessage(SUPERVISOR_PROMPT),
      ...state.messages.slice(-WINDOW_SIZE),
    ])

    let next: AgentRoute = route.next
    if (next === 'research' && !state.searchEnabled) next = 'chat'

    return new Command({
      goto: next,
      update: {
        conversationSummary: String(summaryResponse.content),
        messages: state.messages.slice(-WINDOW_SIZE),
      },
    })
  }

  // Normal routing
  const route = await routerLLM.invoke([
    new SystemMessage(SUPERVISOR_PROMPT),
    ...(state.conversationSummary
      ? [new SystemMessage(`[이전 대화 요약]\n${state.conversationSummary}`)]
      : []),
    ...state.messages.slice(-WINDOW_SIZE),
  ])

  let next: AgentRoute = route.next
  if (next === 'research' && !state.searchEnabled) next = 'chat'

  return new Command({ goto: next })
}
