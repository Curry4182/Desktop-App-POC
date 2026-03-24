import { createLLM } from './llm-factory.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { researchTool } from './agents/research-agent.js'
import { generateAnswerTool } from './agents/answer-agent.js'
import type { AgentName } from './types.js'

const MAX_ITERATIONS = parseInt(process.env.REACT_MAX_ITERATIONS || '5', 10)

// ─── Classification (quick LLM call to decide route) ───

const CLASSIFY_PROMPT = `사용자 메시지를 분석하여 처리 방식을 결정하세요.

응답 형식 (JSON만):
{
  "route": "research" | "pc_fix" | "chat",
  "clarify": false,
  "clarifyQuestion": "",
  "clarifyOptions": []
}

라우팅 규칙:
- "research": 지식 검색, 자료조사, 정보 탐색이 필요한 질문
- "pc_fix": PC 문제 진단/해결 (시스템, 소프트웨어, 네트워크, 디스크)
- "chat": 일반 대화, 인사, 간단한 질문

모호한 질문은 clarify=true로 설정하고 선택지를 제시하세요.
JSON만 반환하세요.`

const VALID_AGENTS: AgentName[] = ['research', 'pc_fix', 'chat']

interface ClassifyResult {
  route: AgentName
  clarify: boolean
  clarifyQuestion?: string
  clarifyOptions?: Array<{ label: string; value: string }>
}

export async function classifyRoute(
  userMessage: string,
  searchEnabled: boolean,
): Promise<AgentName> {
  const llm = createLLM({ temperature: 0 })

  const response = await llm.invoke([
    new SystemMessage(CLASSIFY_PROMPT),
    new HumanMessage(`Classify: "${userMessage}"`),
  ])

  try {
    const parsed = JSON.parse(String(response.content)) as ClassifyResult

    // Handle clarification
    if (parsed.clarify && parsed.clarifyQuestion) {
      const userChoice = interrupt({
        type: 'clarify',
        question: parsed.clarifyQuestion,
        options: parsed.clarifyOptions || [],
      })
      return classifyRoute(`${userMessage} (보충: ${userChoice})`, searchEnabled)
    }

    let route = VALID_AGENTS.includes(parsed.route) ? parsed.route : 'chat'
    if (route === 'research' && !searchEnabled) route = 'chat'
    return route
  } catch {
    return 'chat'
  }
}

// ─── Supervisor ReAct Agent (for research route) ───
// Supervisor generates multiple research questions and calls research tool for each

const SUPERVISOR_REACT_PROMPT = `당신은 CAD 설계 어시스턴트의 Supervisor입니다.
사용자의 질문에 답하기 위해 자료조사를 수행하고 답변을 생성합니다.

## 도구
1. research: 질문에 대한 자료를 검색합니다
2. generate_answer: 수집된 자료로 최종 답변을 생성합니다

## 작업 방식 (반드시 순서대로)

### 1단계: 질문 분해
복잡한 질문은 논리적 순서로 분해하세요.
예시: "CAD 창시자가 태어난 국가의 인구수"
→ 먼저: "CAD의 창시자는 누구인가" (research 호출)
→ 결과에서 창시자 이름 확인 후: "그 사람이 태어난 국가는?" (research 호출)
→ 국가 확인 후: "그 국가의 인구수" (research 호출)

### 2단계: 단계별 조사
- 이전 조사 결과를 바탕으로 다음 질문을 구체화하세요
- 한 번에 하나의 구체적인 질문만 research에 전달하세요
- 원래 질문을 그대로 넘기지 마세요. 분해된 세부 질문을 넘기세요

### 3단계: 답변 생성
- 모든 조사가 끝나면 generate_answer를 호출하세요
- 직접 답변하지 마세요. 반드시 generate_answer를 사용하세요`

export function createSupervisorReactAgent() {
  const llm = createLLM({ temperature: 0.3 })
  return createReactAgent({
    llm,
    tools: [researchTool, generateAnswerTool],
    prompt: SUPERVISOR_REACT_PROMPT,
    name: 'supervisor_react',
  })
}
