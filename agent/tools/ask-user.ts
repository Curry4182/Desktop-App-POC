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

    // Return with explicit instruction to research next
    return `사용자 선택: "${userResponse}" — 이 결과를 반영하여 반드시 research 도구로 검색한 후 generate_answer를 호출하세요. 자체 지식으로 답변하지 마세요.`
  },
  {
    name: 'ask_user',
    description: '사용자에게 보충 질문을 합니다. 이 도구의 결과를 받은 후 반드시 research를 호출해야 합니다.',
    schema: z.object({
      question: z.string().describe('사용자에게 물어볼 질문'),
      options: z.array(z.string()).describe('선택지 목록 (3~5개)'),
    }),
  }
)
