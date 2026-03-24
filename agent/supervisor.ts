import { createLLM } from './llm-factory.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { researchTool } from './agents/research-agent.js'
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
사용자의 질문에 답하기 위해 research 도구를 사용하여 자료를 수집하세요.

작업 방식:
1. 사용자 질문을 분석하여 조사가 필요한 세부 질문들을 파악하세요.
2. 각 세부 질문마다 research 도구를 호출하여 자료를 수집하세요.
3. 수집된 자료를 종합하여 사용자에게 최종 답변을 생성하세요.

답변 규칙:
- 수집된 자료의 출처를 반드시 포함하세요
- 자료에 기반한 정확한 답변을 제공하세요
- 사용자와 같은 언어로 응답하세요
- 추측하지 말고 자료에 있는 내용만 답변하세요`

export function createSupervisorReactAgent() {
  const llm = createLLM({ temperature: 0.3 })
  return createReactAgent({
    llm,
    tools: [researchTool],
    prompt: SUPERVISOR_REACT_PROMPT,
    name: 'supervisor_react',
  })
}
