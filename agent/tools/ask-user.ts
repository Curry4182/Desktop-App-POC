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

    return `사용자 선택: "${userResponse}" — 이 결과를 반영하여 research_worker로 검색을 수행하세요. 자체 지식으로 답변하지 마세요.`
  },
  {
    name: 'ask_user',
    description: '사용자에게 보충 질문을 합니다. 결과를 받은 후 반드시 research_worker로 검색하세요.',
    schema: z.object({
      question: z.string().describe('사용자에게 물어볼 질문'),
      options: z.array(z.string()).describe('선택지 목록 (3~5개)'),
    }),
  }
)
