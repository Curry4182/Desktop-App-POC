import type { ExperimentItem } from '@langfuse/client'
import type { TokenUsageByNode } from '../../../agent/infra/token-usage.js'

export type CadCatiaEvalInput = {
  id: string
  topic: 'cad' | 'catia'
  turns: string[]
  searchEnabled?: boolean
}

export type CadCatiaExpectedOutput = {
  rubric: string
  requiredMentions: string[]
  forbiddenMentions?: string[]
}

export type CadCatiaEvalMetadata = {
  scenario: string
  tags: string[]
}

export type CadCatiaEvalOutput = {
  finalAnswer: string
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>
  tokenUsage: TokenUsageByNode
}

export type CadCatiaEvalItem = ExperimentItem<
  CadCatiaEvalInput,
  CadCatiaExpectedOutput,
  CadCatiaEvalMetadata
>

export type RunCadCatiaExperimentOptions = {
  name?: string
  description?: string
  maxItems?: number
  maxConcurrency?: number
  researchMode?: 'workflow' | 'agentic'
  startIndex?: number
}
