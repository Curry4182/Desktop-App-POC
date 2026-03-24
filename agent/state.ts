import { Annotation } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'
import type { AgentName, DiagnosticResult } from './types.js'

export const SupervisorAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  agentName: Annotation<AgentName | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  response: Annotation<string | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  diagnosticResults: Annotation<DiagnosticResult | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  searchEnabled: Annotation<boolean>({
    reducer: (_x, y) => y,
    default: () => true,
  }),
  summary: Annotation<string | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
})

export type SupervisorStateType = typeof SupervisorAnnotation.State
