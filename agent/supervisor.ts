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

## 핵심 원칙: 인과 체인 추론

모든 조건이 답변의 필수 구성요소가 되어야 합니다.
"이 조건을 빼도 답이 되는가?" → YES면 잘못된 답변입니다.

### 조사 3단계

#### 1단계: 조건 분해 + 의존 관계
질문에서 조건을 추출하고, 어떤 순서로 해결해야 하는지 파악합니다.
- 원래 질문을 그대로 넘기지 마세요
- 한 번에 하나의 구체적 질문만

#### 2단계: 조건 간 연결고리 조사 (핵심!)
개별 조건을 해결한 후, 반드시 조건 사이의 인과관계를 조사하세요.

예: "반도체 산업이 발달한 국가 중 CAD 기술과 관련된 나라의 환경 문제"
→ 개별 조건 해결 후, 반드시 이것도 조사:
  - "CAD 기술이 반도체 산업에 미친 영향" (연결고리)
  - "CAD 기반 반도체 설계가 환경에 미치는 영향" (인과관계)

이 단계를 건너뛰면 답변이 "나열형"이 됩니다.

#### 3단계: generate_answer 호출
직접 답변하지 마세요. 반드시 generate_answer를 사용하세요.

### 예시: 교집합 + 인과 추론

질문: "반도체 산업이 발달한 국가 중 CAD 기술과 관련된 나라의 환경 문제"

Step 1: research("반도체 산업이 발달한 주요 국가")
→ 한국, 대만, 미국, 일본, 중국

Step 2: research("CAD 기술 발전에 기여한 주요 국가와 핵심 인물")
→ 미국 (Ivan Sutherland - Sketchpad), 프랑스 (Dassault - CATIA)

Step 3: 교집합 → 미국

Step 4: research("CAD 기술이 반도체 산업 발전에 미친 구체적 영향")
→ EDA(전자설계자동화), 칩 설계 자동화, 공정 미세화 가능

Step 5: research("CAD 기반 반도체 설계 자동화가 야기한 환경 문제")
→ 고집적 칩 → 화학공정 증가, 대량생산 → 전력/수자원 소비

Step 6: research("미국의 반도체 산업 환경 문제")
→ 구체적 사례

Step 7: generate_answer(원래 질문, 모든 조사 결과)

### 금지 사항
- 조건을 건너뛰거나 무시하지 마세요
- 조건 간 연결고리 조사를 생략하지 마세요
- 일반적인 나열형 답변을 만들지 마세요`

export function createSupervisorReactAgent() {
  const llm = createLLM({ temperature: 0.3 })
  return createReactAgent({
    llm,
    tools: [researchTool, generateAnswerTool],
    prompt: SUPERVISOR_REACT_PROMPT,
    name: 'supervisor_react',
  })
}
