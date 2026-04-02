/**
 * 자료조사 실행 모듈.
 *
 * agentic 모드의 ReAct 에이전트가 자율적으로
 * search_documents → get_document_summary → get_document_content
 * 순서로 도구를 호출하며 정보를 수집한다.
 */
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type {
  ResearchInput,
  ResearchResult,
  RunResearchFn,
} from '../infra/runtime-types.js'
import { createDefaultResearchAgent } from './agent.js'

/**
 * research 노드가 사용할 RunResearchFn을 생성한다.
 * ReAct 에이전트가 도구를 자율적으로 호출하여 조사를 수행하고,
 * 완료 후 전체 답변을 반환한다 (streamsAnswerTokens: false).
 */
export function createDefaultResearchRunner(): RunResearchFn {
  const agent = createDefaultResearchAgent()

  return async function runAgenticResearch(
    input: ResearchInput,
    config?: LangGraphRunnableConfig,
  ): Promise<ResearchResult> {
    const result = await agent.invoke(
      { messages: input.turnMessages },
      {
        ...config,
        context: { searchEnabled: input.searchEnabled },
        metadata: {
          ...(config?.metadata ?? {}),
          token_usage_scope: 'research_agentic',
        },
      },
    )

    const lastMessage = result.messages[result.messages.length - 1]
    return {
      answer: String(lastMessage?.content ?? '').trim(),
      streamsAnswerTokens: false,
    }
  }
}
