/**
 * 메인 그래프의 타입 정의.
 */
import type { HumanMessage, BaseMessage } from '@langchain/core/messages'
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'
import type {
  AssistantAgentLike,
  RunResearchFn,
  StructuredModel,
} from '../../infra/runtime-types.js'
import type { TokenUsageCollector } from '../../infra/token-usage.js'
import type { InterpretDecision, RouteDecision } from './schema.js'

/**
 * 그래프가 사용하는 외부 의존성 묶음.
 * 테스트 시 각 의존성을 모킹하여 주입할 수 있다.
 */
export type DesignAssistantGraphDependencies = {
  /** interpret 노드에서 사용하는 structured output LLM */
  interpretModel: StructuredModel<InterpretDecision>
  /** router 노드에서 사용하는 structured output LLM */
  routerModel: StructuredModel<RouteDecision>
  /** assistant 노드의 ReAct 에이전트 (PC 진단/일반 대화) */
  assistantAgent: AssistantAgentLike
  /** research 노드가 호출하는 조사 실행 함수 (agentic ReAct 에이전트) */
  runResearch: RunResearchFn
}

export type CreateDefaultGraphDependenciesOptions =
  Partial<DesignAssistantGraphDependencies>

/** 그래프 스트리밍 입력 */
export type GraphStreamInput = {
  messages: HumanMessage[]
  searchEnabled?: boolean
  originalUserQuestion?: string
  globalClarifyCount?: number
  researchClarifications?: string[]
}

export type StreamPayload = {
  threadId: string
  searchEnabled?: boolean
  signal?: AbortSignal
}

export type StreamRequest = StreamPayload & {
  userMessage: string
}

export type ResumeRequest = StreamPayload & {
  resumeValue: unknown
}

export type RuntimeOptions = {
  deps?: DesignAssistantGraphDependencies
  checkpointer?: BaseCheckpointSaver<number> | boolean
  recursionLimit?: number
  tokenUsageCollectorFactory?: () => TokenUsageCollector
}

/** nodes.ts에서 사용하는 턴 상태 타입 */
export type GraphTurnState = {
  messages: BaseMessage[]
  searchEnabled: boolean
  originalUserQuestion: string
  researchClarifications: string[]
  globalClarifyCount: number
}
