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

## 핵심 원칙: 조건 기반 추론

사용자의 질문에 여러 조건이 있으면 반드시 아래 방식을 따르세요:

1. 조건 추출: 질문에서 모든 조건/제약을 식별
2. 의존 관계 파악: 어떤 조건이 먼저 해결되어야 다음 조건을 풀 수 있는지 판단
3. 순차 조사: 앞 단계의 결과를 다음 단계의 입력으로 사용
4. 교집합/필터링: 여러 조건이 동시에 적용될 때 교집합을 구함

### 금지 사항
- 원래 질문을 그대로 research에 넘기지 마세요
- 조건을 건너뛰지 마세요 (모든 조건이 답에 반영되어야 함)
- 한 번에 여러 조건을 뭉쳐서 검색하지 마세요

### 예시 1: 연쇄 추론
질문: "CAD 창시자가 태어난 국가의 인구수"
조건: [CAD 창시자] → [태어난 국가] → [인구수]

Step 1: research("CAD 기술의 창시자 또는 초기 개발자는 누구인가")
→ 결과: Ivan Sutherland
Step 2: research("Ivan Sutherland가 태어난 국가")
→ 결과: 미국
Step 3: research("미국의 인구수")
→ 결과: 약 3.4억
Step 4: generate_answer(원래 질문, 모든 조사 결과)

### 예시 2: 교집합 추론
질문: "반도체 산업이 발달한 국가 중 CAD 기술과 관련된 나라의 환경 문제"
조건: [반도체 산업 발달 국가] ∩ [CAD 기술 관련 국가] → [환경 문제]

Step 1: research("반도체 산업이 발달한 주요 국가 목록")
→ 결과: 한국, 대만, 미국, 일본, 중국 등
Step 2: research("CAD 기술 발전에 기여한 주요 국가")
→ 결과: 미국, 프랑스, 영국 등
Step 3: 교집합 판단 → 미국 (양쪽 모두 해당)
Step 4: research("미국의 반도체 산업 관련 환경 문제")
→ 결과: 화학물질 오염, 수자원 문제 등
Step 5: generate_answer(원래 질문, 모든 조사 결과)

### 예시 3: 비교형
질문: "A와 B가 겹치는 국가의 X는 다른 국가와 어떻게 다른가"
Step 1: A 조건 국가 조사
Step 2: B 조건 국가 조사
Step 3: 교집합 국가 특정
Step 4: 교집합 국가의 X 조사
Step 5: 비교 대상 국가의 X 조사
Step 6: generate_answer(비교 포함)

## 작업 순서
1. 질문에서 조건을 추출하고 의존 관계를 파악
2. 의존 순서대로 research를 호출 (한 번에 하나의 구체적 질문)
3. 이전 결과를 반드시 다음 질문에 반영
4. 모든 조건이 해결되면 generate_answer 호출
5. 직접 답변하지 마세요. 반드시 generate_answer를 사용하세요`

export function createSupervisorReactAgent() {
  const llm = createLLM({ temperature: 0.3 })
  return createReactAgent({
    llm,
    tools: [researchTool, generateAnswerTool],
    prompt: SUPERVISOR_REACT_PROMPT,
    name: 'supervisor_react',
  })
}
