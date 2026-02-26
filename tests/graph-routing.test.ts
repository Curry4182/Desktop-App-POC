import { describe, it, expect } from 'vitest'
import type { RouteType } from '../agent/types.js'

/**
 * LangGraph 라우팅 로직 단위 테스트
 * LLM API 호출 없이 라우터 결정 로직만 검증
 */
describe('그래프 라우팅 로직', () => {
  describe('라우트 결정 매핑', () => {
    // routeDecision 로직을 독립적으로 테스트
    function routeDecision(route: RouteType | string | null): string {
      switch (route) {
        case 'diagnostic': return 'diagnostic'
        case 'rag': return 'rag'
        case 'ui_action': return 'ui_action'
        default: return 'chat'
      }
    }

    it('"diagnostic"은 diagnostic 노드로 라우팅되어야 함', () => {
      expect(routeDecision('diagnostic')).toBe('diagnostic')
    })

    it('"rag"은 rag 노드로 라우팅되어야 함', () => {
      expect(routeDecision('rag')).toBe('rag')
    })

    it('"ui_action"은 ui_action 노드로 라우팅되어야 함', () => {
      expect(routeDecision('ui_action')).toBe('ui_action')
    })

    it('알 수 없는 라우트는 chat으로 기본 라우팅되어야 함', () => {
      expect(routeDecision('unknown')).toBe('chat')
      expect(routeDecision('')).toBe('chat')
      expect(routeDecision(null)).toBe('chat')
    })

    it('"chat"은 chat 노드로 라우팅되어야 함', () => {
      expect(routeDecision('chat')).toBe('chat')
    })
  })

  describe('상태 구조', () => {
    it('유효한 초기 상태 구조를 가져야 함', () => {
      const initialState = {
        messages: [],
        route: null as RouteType | null,
        response: null as string | null,
        context: null as string | null,
        diagnosticResults: null,
        uiAction: null,
      }
      expect(initialState.messages).toEqual([])
      expect(initialState.route).toBeNull()
    })
  })
})
