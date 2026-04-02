/**
 * 에이전트 런타임 타입 정의.
 *
 * 그래프 노드와 의존성 간의 계약(contract)을 정의하여
 * 테스트 시 모킹과 의존성 주입을 용이하게 한다.
 */
import type { BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'

/** structured output을 반환하는 LLM 인터페이스 (interpret, router 등에서 사용) */
export type StructuredModel<T> = {
  invoke(input: BaseMessage[], config?: LangGraphRunnableConfig): Promise<T>
}

/** ReAct 에이전트 인터페이스 (assistant, research agentic 모드에서 사용) */
export type AssistantAgentLike = {
  invoke(
    input: { messages: BaseMessage[] },
    config?: LangGraphRunnableConfig & { context?: { searchEnabled?: boolean } },
  ): Promise<{ messages: BaseMessage[] }>
}

export type ResearchInput = {
  messages: BaseMessage[]
  turnMessages: BaseMessage[]
  originalUserQuestion: string
  searchEnabled: boolean
  researchClarifications: string[]
}

export type ResearchResult = {
  answer: string
  streamsAnswerTokens: boolean
}

export type RunResearchFn = (
  input: ResearchInput,
  config?: LangGraphRunnableConfig,
) => Promise<ResearchResult>
