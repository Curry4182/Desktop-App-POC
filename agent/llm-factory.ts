import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { LLMOptions } from './types.js'
import 'dotenv/config'

/**
 * LLM Factory - LangChain 추상화로 여러 공급자 지원
 * LLM_PROVIDER 환경변수로 전환: openai | anthropic
 */
export function createLLM(options: LLMOptions = {}): BaseChatModel {
  const provider = process.env.LLM_PROVIDER || 'openai'

  switch (provider) {
    case 'anthropic':
      return new ChatAnthropic({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
        apiKey: process.env.ANTHROPIC_API_KEY,
      })

    case 'openai':
    default: {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
      const tokenLimit = options.maxTokens ?? 2048
      // gpt-5+ models use maxCompletionTokens instead of maxTokens
      const useCompletionTokens = model.startsWith('gpt-5') || model.startsWith('o')
      return new ChatOpenAI({
        model,
        temperature: options.temperature ?? 0.7,
        ...(useCompletionTokens
          ? { maxCompletionTokens: tokenLimit }
          : { maxTokens: tokenLimit }),
        apiKey: process.env.OPENAI_API_KEY,
      } as any)
    }
  }
}
