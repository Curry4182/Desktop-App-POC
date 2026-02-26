import { describe, it, expect } from 'vitest'
import {
  UI_FUNCTION_REGISTRY,
  isValidUIAction,
  getUIFunctionDescriptions,
} from '../agent/tools/ui-functions.js'

describe('UI 함수 레지스트리', () => {
  it('필수 UI 액션이 모두 등록되어 있어야 함', () => {
    const requiredActions = [
      'openDiagnosticPanel',
      'closeDiagnosticPanel',
      'startDiagnostic',
      'exportReport',
      'clearChat',
      'openSettings',
    ]
    for (const action of requiredActions) {
      expect(UI_FUNCTION_REGISTRY[action]).toBeDefined()
    }
  })

  it('알려진 액션의 유효성을 올바르게 검사해야 함', () => {
    expect(isValidUIAction('openDiagnosticPanel')).toBe(true)
    expect(isValidUIAction('clearChat')).toBe(true)
    expect(isValidUIAction('unknownAction')).toBe(false)
    expect(isValidUIAction('')).toBe(false)
  })

  it('LLM 프롬프트용 설명 문자열을 반환해야 함', () => {
    const descriptions = getUIFunctionDescriptions()
    expect(typeof descriptions).toBe('string')
    expect(descriptions).toContain('openDiagnosticPanel')
    expect(descriptions).toContain('clearChat')
    expect(descriptions.length).toBeGreaterThan(0)
  })
})
