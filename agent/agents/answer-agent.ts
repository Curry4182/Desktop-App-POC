import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { createLLM } from '../llm-factory.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'

const ANSWER_SYSTEM_PROMPT = `당신은 수집된 자료를 바탕으로 최종 답변을 생성하는 에이전트입니다.

## 답변 작성 규칙
1. 제공된 자료만을 기반으로 답변하세요 (추측 금지)
2. 사용자와 같은 언어로 답변하세요
3. 간결하고 명확하게 답변하세요
4. 출처 텍스트는 포함하지 마세요 (별도 UI로 표시됩니다)

## 자기 검토 (답변 출력 전 확인)
- 사용자의 원래 질문에 모두 답했는가?
- 자료에 근거하지 않은 내용이 포함되어 있지 않은가?
- 중복되거나 불필요한 내용은 없는가?
- 논리적 흐름이 자연스러운가?

검토 후 문제가 없으면 최종 답변만 출력하세요.`

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
      collectedResearch: z.string().describe('research 도구로 수집한 모든 자료 내용'),
    }),
  }
)
