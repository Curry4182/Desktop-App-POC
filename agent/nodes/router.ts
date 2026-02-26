import { createLLM } from '../llm-factory.js'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { AgentStateType } from '../state.js'
import type { RouteType } from '../types.js'

const ROUTER_SYSTEM_PROMPT = `당신은 CAD 설계 어시스턴트 애플리케이션의 라우팅 에이전트입니다.
사용자의 메시지를 분석하여 정확히 아래 카테고리 중 하나로 분류하세요.

- "diagnostic": PC 상태, 소프트웨어 설치 여부, 파일 경로, 네트워크, 디스크 용량, 시스템 문제 확인 요청
- "rag": CAD 설계, CATIA 사용법, 3D 모델링, 엔지니어링 사양, 설계 방법론에 관한 질문
- "ui_action": 패널 열기/닫기, 진단 시작, 보고서 내보내기 등 UI 조작 요청
- "chat": 일반 대화, 인사, 위 카테고리에 해당하지 않는 질문

카테고리 이름만 답하세요. 다른 내용은 포함하지 마세요.`

const VALID_ROUTES: RouteType[] = ['diagnostic', 'rag', 'ui_action', 'chat']

export async function routerNode(state: AgentStateType) {
  const llm = createLLM({ temperature: 0 })
  const lastMessage = state.messages[state.messages.length - 1]

  const response = await llm.invoke([
    new SystemMessage(ROUTER_SYSTEM_PROMPT),
    new HumanMessage(`Classify this message: "${lastMessage.content}"`),
  ])

  const route = String(response.content).trim().toLowerCase()
  const finalRoute: RouteType = VALID_ROUTES.includes(route as RouteType)
    ? (route as RouteType)
    : 'chat'

  return { route: finalRoute }
}
