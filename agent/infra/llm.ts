import 'dotenv/config'
import { ChatAnthropic } from '@langchain/anthropic'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatOpenAI } from '@langchain/openai'

type LLMOptions = {
  temperature?: number
  maxTokens?: number
  model?: string
}

type LLMProvider = 'openai' | 'anthropic'

function resolveLLMProvider(): LLMProvider {
  return process.env.LLM_PROVIDER === 'anthropic' ? 'anthropic' : 'openai'
}

function resolveModelName(provider: LLMProvider, options: LLMOptions): string {
  if (provider === 'anthropic') {
    return options.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'
  }

  return options.model || process.env.OPENAI_MODEL || 'gpt-5-mini'
}

function resolveTemperature(options: LLMOptions): number {
  return options.temperature ?? 0.7
}

function resolveTokenLimit(options: LLMOptions): number {
  return options.maxTokens ?? 2048
}

export function createLLM(options: LLMOptions = {}): BaseChatModel {
  const provider = resolveLLMProvider()
  const model = resolveModelName(provider, options)
  const temperature = resolveTemperature(options)
  const tokenLimit = resolveTokenLimit(options)

  if (provider === 'anthropic') {
    return new ChatAnthropic({
      model,
      temperature,
      maxTokens: tokenLimit,
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  const useCompletionTokens = model.startsWith('gpt-5') || model.startsWith('o')
  return new ChatOpenAI({
    model,
    temperature,
    ...(useCompletionTokens
      ? { maxCompletionTokens: tokenLimit }
      : { maxTokens: tokenLimit }),
    apiKey: process.env.OPENAI_API_KEY,
  } as any)
}
