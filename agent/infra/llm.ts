/**
 * LLM 프로바이더 팩토리.
 *
 * 환경변수(LLM_PROVIDER)에 따라 OpenAI 또는 Anthropic 모델을 생성한다.
 * 기본값은 OpenAI(gpt-5-mini). Anthropic 사용 시 LLM_PROVIDER=anthropic 설정.
 *
 * 환경변수:
 * - LLM_PROVIDER    : 'openai' | 'anthropic'
 * - OPENAI_MODEL    : OpenAI 모델명 (기본: gpt-5-mini)
 * - ANTHROPIC_MODEL : Anthropic 모델명 (기본: claude-sonnet-4-5-20250929)
 * - OPENAI_API_KEY  / ANTHROPIC_API_KEY
 */
import 'dotenv/config'
import { ChatAnthropic } from '@langchain/anthropic'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatOpenAI } from '@langchain/openai'

type LLMOptions = {
  temperature?: number
  maxTokens?: number
  model?: string
}

/** 설정에 따라 적절한 LLM 인스턴스를 생성한다 */
export function createLLM(options: LLMOptions = {}): BaseChatModel {
  const provider = process.env.LLM_PROVIDER === 'anthropic' ? 'anthropic' : 'openai'
  const temperature = options.temperature ?? 0.7
  const maxTokens = options.maxTokens ?? 2048

  if (provider === 'anthropic') {
    const model = options.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'
    return new ChatAnthropic({
      model,
      temperature,
      maxTokens,
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  const model = options.model || process.env.OPENAI_MODEL || 'gpt-5-mini'
  const useCompletionTokens = model.startsWith('gpt-5') || model.startsWith('o')
  return new ChatOpenAI({
    model,
    temperature,
    ...(useCompletionTokens
      ? { maxCompletionTokens: maxTokens }
      : { maxTokens }),
    apiKey: process.env.OPENAI_API_KEY,
  } as any)
}
