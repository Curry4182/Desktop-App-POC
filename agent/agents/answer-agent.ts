import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { createLLM } from '../llm-factory.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'

const ANSWER_SYSTEM_PROMPT = `당신은 수집된 자료를 바탕으로 최종 답변을 생성하는 에이전트입니다.

## 답변 구조: 인과 체인

답변은 반드시 조건들이 연결된 인과 체인으로 작성하세요.

나쁜 예 (나열형):
"미국의 환경 문제는 1) 화학물질 2) 전력 3) 오염..."

좋은 예 (인과 체인형):
"CAD 기술(Ivan Sutherland, 미국)은 반도체 설계 자동화(EDA)를 가능하게 했다.
→ 이로 인해 칩의 고집적화와 대량생산이 실현되었고,
→ 공정 미세화에 따른 화학물질 사용 증가,
→ 대량생산에 따른 전력·수자원 소비 증가 등의 환경 문제가 발생했다."

## 자기 검증

답변 출력 전 반드시 확인:
1. 질문의 모든 조건이 답변에서 필수적으로 사용되었는가?
2. 어떤 조건을 제거해도 답이 성립하면 → 그 조건이 제대로 활용되지 않은 것 → 다시 작성
3. 조건 간 인과관계가 명확히 드러나는가?

## 규칙
- 제공된 자료만 기반 (추측 금지)
- 사용자와 같은 언어로 답변
- 출처 텍스트는 포함하지 마세요 (별도 UI로 표시됨)
- 인과관계가 자료에 없으면 "자료에서 직접적 인과관계는 확인되지 않았으나" 명시`

export const generateAnswerTool = tool(
  async ({ question, collectedResearch }) => {
    const llm = createLLM({ temperature: 0.5 })

    const response = await llm.invoke([
      new SystemMessage(ANSWER_SYSTEM_PROMPT),
      new HumanMessage(
        `## 사용자 질문\n${question}\n\n## 수집된 자료\n${collectedResearch}`
      ),
    ])

    return String(response.content)
  },
  {
    name: 'generate_answer',
    description: '수집된 자료를 바탕으로 사용자 질문에 대한 최종 답변을 생성합니다. 모든 조사가 끝난 후 마지막에 호출하세요.',
    schema: z.object({
      question: z.string().describe('사용자의 원래 질문'),
      collectedResearch: z.string().describe('research 도구로 수집한 모든 자료 내용 (조건 간 연결고리 포함)'),
    }),
  }
)
