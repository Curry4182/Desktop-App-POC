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

## 보충 질문 (clarify) 판단 기준

아래 경우에 반드시 clarify=true로 설정하세요:

1. 지시 대상이 불명확: "그것", "그 음식", "저거" 등 대명사가 특정 대상을 가리키지만 맥락에서 파악 불가
2. 범위가 너무 넓음: "문제점이 뭐야" — 어떤 관점의 문제인지 불분명 (건강? 비용? 환경? 품질?)
3. 여러 해석 가능: 질문이 2가지 이상으로 해석될 수 있을 때
4. 핵심 정보 누락: 답변에 필요한 핵심 정보(대상, 조건, 맥락)가 빠져 있을 때

### 보충 질문 작성 규칙
- clarifyQuestion: 무엇이 불명확한지 구체적으로 질문
- clarifyOptions: 3~5개의 구체적 선택지 (label + value)
- 마지막 선택지는 항상 "직접 입력" 옵션

### 예시

입력: "배고파서 음식을 시킬려고 하는데 그 음식의 문제점이 뭘까?"
→ clarify=true
→ clarifyQuestion: "어떤 음식에 대해 알고 싶으신가요?"
→ clarifyOptions: [
    {"label": "배달 음식 전반", "value": "배달 음식"},
    {"label": "패스트푸드", "value": "패스트푸드"},
    {"label": "인스턴트 식품", "value": "인스턴트 식품"},
    {"label": "직접 입력", "value": ""}
  ]

입력: "저거 어떻게 해결해?"
→ clarify=true (대명사 "저거"가 무엇인지 불명확)

입력: "CAD의 창시자는 누구야?"
→ clarify=false (명확한 질문)

입력: "컴퓨터가 느려요"
→ clarify=false → route: "pc_fix" (PC 진단으로 해결 가능)

중요: 모호한 질문에는 반드시 clarify=true를 설정하세요.
대명사("그거", "저거", "그 음식")가 맥락 없이 사용되면 반드시 clarify=true입니다.
"문제점", "해결", "알려줘" 같은 범용 표현이 대상 없이 쓰이면 반드시 clarify=true입니다.

JSON만 반환하세요. markdown 코드블록 없이 순수 JSON만 반환하세요.`

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
  hasHistory: boolean = false,
): Promise<AgentName> {
  const llm = createLLM({ temperature: 0 })

  const response = await llm.invoke([
    new SystemMessage(CLASSIFY_PROMPT),
    new HumanMessage(`Classify: "${userMessage}"`),
  ])

  try {
    const rawContent = String(response.content)
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent) as ClassifyResult

    // Handle clarification (from LLM or forced)
    if (parsed.clarify && parsed.clarifyQuestion) {
      const userChoice = interrupt({
        type: 'clarify',
        question: parsed.clarifyQuestion,
        options: parsed.clarifyOptions || [],
      })
      return classifyRoute(`${userMessage} (보충: ${userChoice})`, searchEnabled)
    }

    // Fallback: programmatic ambiguity detection if LLM didn't flag it
    if (!parsed.clarify) {
      // Always detect ambiguous pronouns (even with history — "그 음식" needs clarification)
      const ambiguousPronouns = /(?:그것|그거|저거|저것|그\s?음식|그\s?문제|그\s?사람|이것|이거)/.test(userMessage)
      // Short vague queries without history
      const vaguePhrases = !hasHistory && /(?:어떻게|문제점|해결|알려줘|뭘까|뭐야)\s*[?？]?\s*$/.test(userMessage)
      const tooShort = !hasHistory && userMessage.replace(/[?？!！.\s]/g, '').length < 6

      if (ambiguousPronouns || (vaguePhrases && tooShort)) {
        interrupt({
          type: 'clarify' as const,
          question: ambiguousPronouns
            ? '어떤 대상에 대해 물어보시는 건가요?'
            : '조금 더 구체적으로 알려주시겠어요?',
          options: parsed.clarifyOptions || [
            { label: '직접 입력', value: '' },
          ],
        })
      }
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
