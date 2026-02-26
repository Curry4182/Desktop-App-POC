/**
 * UI 함수 레지스트리
 * 채팅 명령으로 트리거 가능한 Vue 프론트엔드 함수 목록
 * IPC를 통해 renderer 프로세스로 전달됨
 */

interface UIFunctionParam {
  name: string
  type: string
  options?: string[]
  default?: string
}

interface UIFunctionInfo {
  description: string
  params: UIFunctionParam[]
}

export const UI_FUNCTION_REGISTRY: Record<string, UIFunctionInfo> = {
  openDiagnosticPanel: {
    description: '진단 결과 패널 열기',
    params: [],
  },
  closeDiagnosticPanel: {
    description: '진단 결과 패널 닫기',
    params: [],
  },
  startDiagnostic: {
    description: 'PC 진단 시작',
    params: [],
  },
  exportReport: {
    description: '진단/채팅 결과 내보내기',
    params: [{ name: 'format', type: 'string', options: ['json', 'txt'], default: 'txt' }],
  },
  clearChat: {
    description: '채팅 기록 초기화',
    params: [],
  },
  openSettings: {
    description: '설정 패널 열기',
    params: [],
  },
}

/**
 * 특정 UI 함수가 등록되어 있는지 확인
 */
export function isValidUIAction(actionName: string): boolean {
  return actionName in UI_FUNCTION_REGISTRY
}

/**
 * 등록된 UI 함수 목록 반환 (LLM 프롬프트용)
 */
export function getUIFunctionDescriptions(): string {
  return Object.entries(UI_FUNCTION_REGISTRY)
    .map(([name, info]) => `- ${name}: ${info.description}`)
    .join('\n')
}
