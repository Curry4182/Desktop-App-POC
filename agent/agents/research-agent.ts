import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { createLLM } from '../llm-factory.js'
import { wikiSearchTool } from '../tools/wiki-search.js'
import { HumanMessage } from '@langchain/core/messages'

const MAX_ITERATIONS = parseInt(process.env.REACT_MAX_ITERATIONS || '5', 10)

const RESEARCH_SYSTEM_PROMPT = `당신은 자료조사 전문 에이전트입니다.
주어진 질문에 대해 검색 도구를 사용하여 자료를 수집하고 정리합니다.

규칙:
1. 질문에서 핵심 키워드를 추출하여 검색하세요.
2. 검색 결과가 부족하면 다른 키워드로 재검색하세요.
3. 수집한 자료를 아래 형식으로 정리하세요:

답변 형식:
- 질문에 대한 간결한 답변
- 각 정보의 출처를 [출처: 제목 - URL] 형식으로 명시
- 자체 API 소스의 경우 [출처: 제목 (문서ID: xxx)] 형식 사용
- 검색 결과를 기반으로만 답변하세요 (추측 금지)

항상 사용자와 같은 언어로 답변하세요.`

// Internal ReAct agent for research
function createInternalResearchAgent() {
  const llm = createLLM({ temperature: 0.3 })
  return createReactAgent({
    llm,
    tools: [wikiSearchTool],
    prompt: RESEARCH_SYSTEM_PROMPT,
    name: 'research_worker',
  })
}

// Research tool — Supervisor calls this as a tool
// Each call answers a specific research question
export const researchTool = tool(
  async ({ question }) => {
    const agent = createInternalResearchAgent()
    const result = await agent.invoke(
      { messages: [new HumanMessage(question)] },
      { recursionLimit: MAX_ITERATIONS * 2 },
    )
    const lastMsg = result.messages[result.messages.length - 1]
    return String(lastMsg.content)
  },
  {
    name: 'research',
    description: '자료조사 도구. 질문을 입력하면 Wikipedia 등에서 관련 자료를 검색하고, 출처를 포함한 답변을 반환합니다. 복잡한 주제는 여러 세부 질문으로 나누어 각각 호출하세요.',
    schema: z.object({
      question: z.string().describe('조사할 질문 (구체적일수록 좋음)'),
    }),
  }
)
