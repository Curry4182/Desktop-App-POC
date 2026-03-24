import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { createLLM } from '../llm-factory.js'
import { wikiSearchTool } from '../tools/wiki-search.js'

const MAX_ITERATIONS = parseInt(process.env.REACT_MAX_ITERATIONS || '5', 10)

const SEARCH_SYSTEM_PROMPT = `당신은 검색 전문 에이전트입니다.
사용자 질문에 답하기 위해 Wikipedia 검색 도구를 사용하세요.

규칙:
1. 사용자 질문에서 핵심 키워드를 추출하여 검색하세요.
2. 검색 결과가 부족하면 다른 키워드로 재검색하세요.
3. 충분한 정보를 확보하면 사용자의 언어로 답변을 생성하세요.
4. 검색 결과를 기반으로 정확하고 유용한 답변을 제공하세요.`

export function createSearchAgent() {
  const llm = createLLM({ temperature: 0.3 })

  // Note: recursionLimit is not a createReactAgent param; apply at invocation time:
  //   agent.invoke(input, { recursionLimit: MAX_ITERATIONS * 2 })
  return createReactAgent({
    llm,
    tools: [wikiSearchTool],
    prompt: SEARCH_SYSTEM_PROMPT,
    name: 'search_agent',
  })
}
