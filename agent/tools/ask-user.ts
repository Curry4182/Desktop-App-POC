import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { interrupt } from '@langchain/langgraph'

export const askUserTool = tool(
  async ({ question, options }) => {
    const parsedOptions = options.map((opt: string) => ({ label: opt, value: opt }))
    parsedOptions.push({ label: '직접 입력', value: '' })

    const userResponse = interrupt({
      type: 'clarify',
      question,
      options: parsedOptions,
    })

    return String(userResponse)
  },
  {
    name: 'ask_user',
    description: '사용자에게 보충 질문을 합니다. 조사 중 정보가 부족하거나 선택이 필요할 때 사용하세요. 예: 여러 후보 국가 중 선택, 모호한 조건 구체화.',
    schema: z.object({
      question: z.string().describe('사용자에게 물어볼 질문'),
      options: z.array(z.string()).describe('선택지 목록 (3~5개)'),
    }),
  }
)
