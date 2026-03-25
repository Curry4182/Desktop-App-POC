import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { BaseMessage } from '@langchain/core/messages'
import type { LLMResult } from '@langchain/core/outputs'

export type TokenUsageSummary = {
  input: number
  output: number
  total: number
}

export type TokenUsageByNode = Record<string, TokenUsageSummary>

type ProviderTokenUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

type UsageMetadata = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

function normalizeUsage(usage: ProviderTokenUsage | UsageMetadata | null | undefined): TokenUsageSummary | null {
  if (!usage) return null

  const providerUsage = usage as ProviderTokenUsage
  const metadataUsage = usage as UsageMetadata

  const input = providerUsage.promptTokens ?? metadataUsage.input_tokens ?? 0
  const output = providerUsage.completionTokens ?? metadataUsage.output_tokens ?? 0
  const total = providerUsage.totalTokens ?? metadataUsage.total_tokens ?? input + output

  if (input === 0 && output === 0 && total === 0) return null
  return { input, output, total }
}

function extractUsageFromMessage(message: BaseMessage | undefined): TokenUsageSummary | null {
  if (!message || typeof message !== 'object') return null
  const usage = (message as BaseMessage & { usage_metadata?: UsageMetadata }).usage_metadata
  return normalizeUsage(usage)
}

function extractUsage(output: LLMResult): TokenUsageSummary | null {
  const llmOutputUsage = normalizeUsage((output.llmOutput as { tokenUsage?: ProviderTokenUsage } | undefined)?.tokenUsage)
  if (llmOutputUsage) return llmOutputUsage

  for (const generationList of output.generations ?? []) {
    const firstGeneration = generationList?.[0] as { message?: BaseMessage } | undefined
    const messageUsage = extractUsageFromMessage(firstGeneration?.message)
    if (messageUsage) return messageUsage
  }

  return null
}

function mergeUsage(current: TokenUsageSummary | undefined, next: TokenUsageSummary): TokenUsageSummary {
  if (!current) return next
  return {
    input: current.input + next.input,
    output: current.output + next.output,
    total: current.total + next.total,
  }
}

export class TokenUsageCollector extends BaseCallbackHandler {
  name = 'token_usage_collector'

  private readonly runScopes = new Map<string, string>()
  private readonly usageByNode: TokenUsageByNode = {}

  private rememberScope(runId: string, metadata?: Record<string, unknown>) {
    const scope = typeof metadata?.token_usage_scope === 'string'
      ? metadata.token_usage_scope
      : 'unknown'
    this.runScopes.set(runId, scope)
  }

  handleChatModelStart(
    _llm: unknown,
    _messages: BaseMessage[][],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ) {
    this.rememberScope(runId, metadata)
  }

  handleLLMStart(
    _llm: unknown,
    _prompts: string[],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ) {
    this.rememberScope(runId, metadata)
  }

  handleLLMEnd(output: LLMResult, runId: string) {
    const scope = this.runScopes.get(runId) ?? 'unknown'
    this.runScopes.delete(runId)

    const usage = extractUsage(output)
    if (!usage) return

    this.usageByNode[scope] = mergeUsage(this.usageByNode[scope], usage)
  }

  handleLLMError(_err: unknown, runId: string) {
    this.runScopes.delete(runId)
  }

  snapshot(): TokenUsageByNode {
    return Object.fromEntries(
      Object.entries(this.usageByNode).filter(([, usage]) => usage.total > 0),
    )
  }
}
