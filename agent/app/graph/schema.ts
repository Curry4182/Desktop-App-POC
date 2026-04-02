import { z } from 'zod'

/**
 * 라우터 노드의 structured output 스키마.
 * LLM이 사용자 요청을 분석해 'assistant'(일반 대화/PC진단) 또는
 * 'research_init'(위키 기반 다단계 조사) 중 하나를 선택한다.
 */
export const routeSchema = z.object({
  next: z.enum(['assistant', 'research_init']),
})

/**
 * interpret 노드의 structured output 스키마.
 * LLM이 사용자의 마지막 발화를 독립적인 요청문으로 재작성하고,
 * 모호한 경우 clarification 옵션을 함께 반환한다.
 */
export const interpretSchema = z.object({
  /** 대화 맥락을 반영해 재작성된 독립 요청문 */
  rewrittenQuestion: z.string().describe('Standalone rewrite of the latest user request in the same language.'),
  /** 명확화가 필요한지 여부 */
  needsClarification: z.boolean(),
  /** UI에 표시할 명확화 질문 (불필요 시 빈 문자열) */
  question: z.string().describe('Clarification question to show in UI. Use empty string when no clarification is needed.'),
  /** 사용자에게 제시할 선택지 목록 (최대 5개) */
  options: z.array(z.string()).max(5).describe('Disambiguation options. Use [] when no clarification is needed.'),
})

export type RouteDecision = z.infer<typeof routeSchema>
export type InterpretDecision = z.infer<typeof interpretSchema>
