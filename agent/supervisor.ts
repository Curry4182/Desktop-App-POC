import { createLLM } from './llm-factory.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import type { AgentName } from './types.js'

const SUPERVISOR_SYSTEM_PROMPT = `당신은 CAD 설계 어시스턴트의 Supervisor입니다.
사용자 메시지를 분석하여 적절한 에이전트를 선택하세요.

응답 형식 (JSON):
{
  "agents": ["agent1"],
  "clarify": false,
  "clarifyQuestion": "",
  "clarifyOptions": []
}

에이전트 목록:
- "search": 지식 검색이 필요한 질문 (일반 지식, 기술 정보, 개념 설명 등)
- "pc_fix": PC 문제 진단/해결 (시스템 정보, 소프트웨어 설치, 네트워크, 디스크, 성능 문제)
- "chat": 일반 대화, 인사, 간단한 질문 (검색/진단이 필요 없는 경우)

규칙:
- 질문이 모호하면 clarify=true로 설정하고 구체적 선택지를 제시
- JSON만 반환하세요`

const VALID_AGENTS: AgentName[] = ['search', 'pc_fix', 'chat']

interface SupervisorDecision {
  agents: AgentName[]
  clarify: boolean
  clarifyQuestion?: string
  clarifyOptions?: Array<{ label: string; value: string }>
}

export async function classifyAgent(
  userMessage: string,
  searchEnabled: boolean,
): Promise<SupervisorDecision> {
  const llm = createLLM({ temperature: 0 })

  const response = await llm.invoke([
    new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
    new HumanMessage(`Classify: "${userMessage}"`),
  ])

  try {
    const parsed = JSON.parse(String(response.content)) as SupervisorDecision

    // Handle clarification — interrupt for user input
    if (parsed.clarify && parsed.clarifyQuestion) {
      const userChoice = interrupt({
        type: 'clarify',
        question: parsed.clarifyQuestion,
        options: parsed.clarifyOptions || [],
      })
      // After resume, re-classify with enriched context
      return classifyAgent(`${userMessage} (보충: ${userChoice})`, searchEnabled)
    }

    // Validate and filter agents
    let agents = parsed.agents.filter(a => VALID_AGENTS.includes(a))
    if (agents.length === 0) agents = ['chat']
    if (!searchEnabled) agents = agents.filter(a => a !== 'search')
    if (agents.length === 0) agents = ['chat']

    return { agents, clarify: false }
  } catch {
    return { agents: ['chat'], clarify: false }
  }
}
