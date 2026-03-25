import type { AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { ResearchSearchResult } from '../research/wiki.js'

export type StructuredModel<T> = {
  invoke(input: BaseMessage[], config?: LangGraphRunnableConfig): Promise<T>
}

export type StreamingModel = {
  stream(
    input: BaseMessage[],
    config?: LangGraphRunnableConfig,
  ): Promise<AsyncIterable<AIMessageChunk>> | AsyncIterable<AIMessageChunk>
}

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

export type ResearchSearchFn = (args: {
  query: string
  depth?: 'normal' | 'deep'
  searchEnabled?: boolean
  writer?: LangGraphRunnableConfig['writer']
}) => Promise<ResearchSearchResult>

export type TracerFactory = () => Promise<unknown> | unknown
