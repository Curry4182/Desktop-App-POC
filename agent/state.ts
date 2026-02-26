import { Annotation } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'
import type { RouteType, DiagnosticResult, UIAction } from './types.js'

/**
 * LangGraph StateGraph 상태 정의 (Annotation.Root 방식)
 * 모든 노드에서 공유하는 상태 타입
 */
export const AgentAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  route: Annotation<RouteType | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  response: Annotation<string | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  context: Annotation<string | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  diagnosticResults: Annotation<DiagnosticResult | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  uiAction: Annotation<UIAction | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
})

export type AgentStateType = typeof AgentAnnotation.State
