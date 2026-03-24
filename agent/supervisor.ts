import { createLLM } from './llm-factory.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { researchTool } from './agents/research-agent.js'
import { generateAnswerTool } from './agents/answer-agent.js'
import { askUserTool } from './tools/ask-user.js'
import type { AgentName } from './types.js'

// ─── Classifier: 라우팅만 담당 (보충 질문 없음) ───

const CLASSIFY_PROMPT = `사용자 메시지와 대화 히스토리를 분석하여 처리 방식을 결정하세요.

응답 형식 (JSON만):
{"route": "research" | "pc_fix" | "chat"}

라우팅 규칙:
- "research": 새로운 지식 검색이 필요한 질문 (이전에 조사하지 않은 주제)
- "pc_fix": PC 문제 진단/해결
- "chat": 일반 대화, 인사, 감탄사, 후속 질문, 의미 없는 입력

## 중요: chat으로 라우팅해야 하는 경우
- 감탄사/장난: "메롱", "ㅋㅋ", "ㅎㅎ", "안녕" 등
- 후속 질문: "왜?", "어떻게?", "더 알려줘", "그래서?" 등 이전 대화에 대한 추가 질문
- 이전에 이미 조사한 주제에 대한 추가 질문 (재조사 불필요)
- 짧은 반응: "응", "그래", "알겠어" 등

## research로 라우팅해야 하는 경우
- 새로운 주제에 대한 질문 (이전 대화에서 다루지 않은 것)
- 구체적인 정보 조사가 필요한 질문

JSON만 반환하세요.`

const VALID_AGENTS: AgentName[] = ['research', 'pc_fix', 'chat']

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
    const rawContent = String(response.content)
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent)

    let route = VALID_AGENTS.includes(parsed.route) ? parsed.route : 'chat'
    if (route === 'research' && !searchEnabled) route = 'chat'
    return route
  } catch {
    return 'chat'
  }
}

// ─── Supervisor ReAct Agent ───
// 모든 보충 질문(ask_user), 자료조사(research), 답변 생성(generate_answer)을 담당

const SUPERVISOR_REACT_PROMPT = `당신은 CAD 설계 어시스턴트의 Supervisor입니다.
사용자의 질문을 분석하고, 필요 시 보충 질문을 하고, 자료를 조사하고, 답변을 생성합니다.

## 도구
1. ask_user: 사용자에게 보충 질문 (선택지 제시)
2. research: 자료 검색
3. generate_answer: 최종 답변 생성

## 작업 흐름 (반드시 순서대로)

### 0단계: 질문 분석 — ask_user 필요 여부 판단
사용자 질문을 받으면 먼저 아래를 확인하세요:
- 대상이 불명확한가? ("그 음식", "저거", "그것" → 무엇을 가리키는지 모름)
- 범위가 너무 넓은가? ("문제점이 뭐야" → 어떤 관점?)
- 여러 해석이 가능한가? ("Apple" → 과일? 회사?)
- 핵심 정보가 빠져있는가?

위 중 하나라도 해당하면 → ask_user로 보충 질문
해당 없으면 → 1단계로 바로 진행

### 1단계: 조건 분해 + 순차 조사
- 질문의 조건을 분해하고, 의존 순서대로 research 호출
- 이전 결과를 다음 질문에 반영
- 조사 중 여러 후보가 나오면 → ask_user로 사용자에게 선택 요청

### 2단계: 조건 간 인과관계 조사
- 개별 조건 해결 후, 조건 사이의 연결고리를 조사
- 이 단계를 건너뛰면 나열형 답변이 됩니다

### 3단계: generate_answer 호출
- 직접 답변하지 마세요. 반드시 generate_answer를 사용하세요
- generate_answer는 반드시 research를 1회 이상 호출한 후에만 사용 가능
- research 없이 generate_answer를 호출하면 안 됩니다

## ask_user 사용 예시

질문: "그 음식의 문제점이 뭘까?"
→ ask_user("어떤 음식에 대해 알고 싶으신가요?", ["배달 음식", "패스트푸드", "인스턴트 식품"])

질문: "CAD 기술과 관련된 나라의 수도를 알려줘"
→ research("CAD 기술 발전에 기여한 주요 국가") → 미국, 프랑스, 영국
→ ask_user("어느 나라의 수도를 알고 싶으신가요?", ["미국", "프랑스", "영국", "모두"])

질문: "환경 문제에 대해 알려줘"
→ ask_user("어떤 관점의 환경 문제가 궁금하신가요?", ["대기 오염", "수질 오염", "기후 변화", "특정 국가의 환경 문제"])

## 대화 맥락 활용
- 대화 히스토리에 이전 조사 결과가 있으면 재활용하세요
- 같은 주제를 다시 조사하지 마세요
- 이전 답변을 기반으로 후속 질문에 답변하세요

## ask_user 후 반드시 research
- ask_user로 사용자 선택을 받은 후, 그 결과를 반영하여 반드시 research 호출
- ask_user → generate_answer (금지! research를 건너뜀)
- ask_user → research → generate_answer (올바른 흐름)

예시:
ask_user("어떤 삼성?") → 사용자: "삼성전자"
→ research("삼성전자") ← 반드시 검색!
→ generate_answer(질문, 검색 결과)

## 금지 사항
- research 없이 generate_answer 호출 금지
- 불필요한 보충 질문 금지 (명확한 질문에는 바로 조사)
- 조건을 건너뛰거나 무시하지 마세요
- 일반적인 나열형 답변을 만들지 마세요
- 검색 결과에 없는 내용을 추측으로 보충하지 마세요
- 자체 지식으로 답변하지 마세요 — 반드시 research 도구로 찾은 자료만 사용`

export function createSupervisorReactAgent() {
  const llm = createLLM({ temperature: 0.3 })
  return createReactAgent({
    llm,
    tools: [askUserTool, researchTool, generateAnswerTool],
    prompt: SUPERVISOR_REACT_PROMPT,
    name: 'supervisor_react',
  })
}
