/**
 * 토큰 사용량 추적 모듈.
 *
 * LangChain 콜백 핸들러로 동작하며, LLM 호출마다
 * metadata.token_usage_scope(노드명)별로 input/output 토큰을 누적한다.
 * 턴 완료 시 snapshot()으로 노드별 사용량을 조회할 수 있다.
 */
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { BaseMessage } from '@langchain/core/messages'
import type { LLMResult } from '@langchain/core/outputs'

export type TokenUsageSummary = {
  input: number
  output: number
  total: number
}

export type TokenUsageByNode = Record<string, TokenUsageSummary>

/** OpenAI/Anthropic 양쪽 형식의 토큰 사용량을 통합 추출한다 (duck typing) */
function normalizeUsage(usage: any): TokenUsageSummary | null {
  if (!usage) return null

  const input = usage.promptTokens ?? usage.input_tokens ?? 0
  const output = usage.completionTokens ?? usage.output_tokens ?? 0
  const total = usage.totalTokens ?? usage.total_tokens ?? input + output

  if (input === 0 && output === 0 && total === 0) return null
  return { input, output, total }
}

function extractUsage(output: LLMResult): TokenUsageSummary | null {
  const llmUsage = normalizeUsage((output.llmOutput as any)?.tokenUsage)
  if (llmUsage) return llmUsage

  const firstGen = output.generations?.[0]?.[0] as any
  return normalizeUsage(firstGen?.message?.usage_metadata)
}

function mergeUsage(current: TokenUsageSummary | undefined, next: TokenUsageSummary): TokenUsageSummary {
  if (!current) return next
  return {
    input: current.input + next.input,
    output: current.output + next.output,
    total: current.total + next.total,
  }
}

/**
 * LLM 호출의 토큰 사용량을 노드(scope)별로 수집하는 콜백 핸들러.
 * handleChatModelStart에서 scope를 기록하고,
 * handleLLMEnd에서 실제 사용량을 추출하여 누적한다.
 */
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
