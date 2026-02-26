import { createLLM } from '../llm-factory.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import type { AgentStateType } from '../state.js'
import type { UIAction } from '../types.js'

/**
 * UI 액션 목록 - 이 함수들이 Vue 프론트에서 실제로 실행됨
 */
export const UI_ACTIONS = {
  OPEN_DIAGNOSTIC_PANEL: 'openDiagnosticPanel',
  CLOSE_DIAGNOSTIC_PANEL: 'closeDiagnosticPanel',
  START_DIAGNOSTIC: 'startDiagnostic',
  EXPORT_REPORT: 'exportReport',
  CLEAR_CHAT: 'clearChat',
  OPEN_SETTINGS: 'openSettings',
} as const

const UI_ACTION_SYSTEM_PROMPT = `당신은 CAD 설계 어시스턴트의 UI 제어 에이전트입니다.
사용자의 의도를 분석하여 실행할 액션이 담긴 JSON 객체를 반환하세요.

사용 가능한 액션:
- openDiagnosticPanel: 진단 결과 패널 열기
- closeDiagnosticPanel: 진단 패널 닫기
- startDiagnostic: PC 진단 스캔 시작
- exportReport: 진단/채팅 결과 내보내기
- clearChat: 채팅 기록 초기화
- openSettings: 설정 패널 열기

아래 형식의 유효한 JSON만 반환하세요:
{"action": "<액션명>", "params": {}, "message": "<사용자 언어로 된 확인 메시지>"}`

export async function uiActionNode(state: AgentStateType) {
  const llm = createLLM({ temperature: 0 })
  const lastMessage = state.messages[state.messages.length - 1]

  const response = await llm.invoke([
    new SystemMessage(UI_ACTION_SYSTEM_PROMPT),
    new HumanMessage(String(lastMessage.content)),
  ])

  let uiAction: UIAction | null = null
  let responseText = ''

  try {
    const parsed = JSON.parse(String(response.content)) as UIAction & { message?: string }
    uiAction = parsed
    responseText = parsed.message ?? `실행: ${parsed.action}`
  } catch {
    responseText = '요청하신 작업을 처리할 수 없습니다.'
  }

  return {
    messages: [...state.messages, { role: 'assistant', content: responseText }],
    response: responseText,
    uiAction,
  }
}
