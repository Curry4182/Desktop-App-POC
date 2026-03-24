import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { Command } from '@langchain/langgraph'
import { SystemMessage } from '@langchain/core/messages'
import { createLLM } from '../llm-factory.js'
import { researchWorkerTool } from '../tools/research-worker.js'
import { askUserTool } from '../tools/ask-user.js'

const WINDOW_SIZE = parseInt(process.env.CONVERSATION_WINDOW_SIZE || '10', 10)

const RESEARCH_PLANNER_PROMPT = `당신은 자료조사 전문 에이전트입니다.
사용자의 질문을 분석하고, 순차적으로 조사하여, 최종 답변을 생성합니다.

## 도구
1. research_worker: Wikipedia에서 특정 주제를 검색합니다. 1~3단어 영어 키워드가 가장 효과적입니다.
2. ask_user: 사용자에게 보충 질문을 합니다 (모호한 질문일 때만).

## 작업 흐름

### 1단계: 질문 분석
- 질문의 조건을 분해합니다.
- 예: "CAD를 만든 사람이 살았던 나라의 경제" → (1) CAD 핵심 인물 → (2) 그 나라 → (3) 경제
- research_worker를 먼저 시도합니다. ask_user는 검색으로 해결 불가능한 모호성에만 사용합니다.

### 2단계: 순차 조사
- 각 조건을 research_worker로 하나씩 조사합니다.
- 이전 결과를 다음 검색에 반영합니다.
- 예: research_worker("Computer-aided design") → "Ivan Sutherland, 미국" → research_worker("United States economy")

### 3단계: 답변 생성
- 조사 결과만을 기반으로 답변합니다.
- 각 정보에 출처를 명시합니다.
- 검색에서 못 찾은 정보는 "검색 결과에서 해당 정보를 찾지 못했습니다"로 명시합니다.
- 자체 지식으로 보충하지 마세요.

## 검색 키워드 전략
- 핵심 개념어 1~3단어 (영어)
- BAD: "CAD technology development major contributing countries"
- GOOD: "Computer-aided design"
- 첫 검색에서 고유명사 발견 시 후속 검색

## ask_user 사용 조건
- 대명사가 맥락 없이 사용: "그거 뭐야?"
- research_worker 결과에서 후보가 여러 개이고 사용자 선택이 필요할 때
- ask_user 후 반드시 research_worker로 검색!

## 금지 사항
- Wikipedia에서 찾지 못한 정보를 자체 지식으로 보충하지 마세요
- "일반적으로 ~로 알려져 있습니다" ← LLM 자체 지식, 금지
- 사용자와 같은 언어로 답변하세요`

const researchAgent = createReactAgent({
  llm: createLLM({ temperature: 0.3 }),
  tools: [researchWorkerTool, askUserTool],
  prompt: (state: { messages: any[]; conversationSummary?: string }) => [
    new SystemMessage(RESEARCH_PLANNER_PROMPT),
    ...(state.conversationSummary
      ? [new SystemMessage(`[이전 대화 요약]\n${state.conversationSummary}`)]
      : []),
    ...state.messages.slice(-WINDOW_SIZE),
  ],
  name: 'research_agent',
})

export async function researchNode(state: { messages: any[]; conversationSummary?: string }) {
  const result = await researchAgent.invoke(state, { recursionLimit: 25 })
  const lastMsg = result.messages[result.messages.length - 1]
  return new Command({
    goto: '__end__',
    update: { messages: [lastMsg] },
  })
}
