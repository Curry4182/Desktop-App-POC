import { StateGraph, END } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { AgentAnnotation } from './state.js'
import { routerNode } from './nodes/router.js'
import { chatNode } from './nodes/chat.js'
import { ragNode } from './nodes/rag.js'
import { diagnosticNode } from './nodes/diagnostic.js'
import { uiActionNode } from './nodes/ui-action.js'
import type { RouteType, DiagnosticResult, UIAction } from './types.js'

/**
 * 라우터 결과에 따라 다음 노드 결정
 */
function routeDecision(state: { route: RouteType | null }): string {
  switch (state.route) {
    case 'diagnostic': return 'diagnostic'
    case 'rag': return 'rag'
    case 'ui_action': return 'ui_action'
    default: return 'chat'
  }
}

/**
 * 워크플로우 그래프 생성
 */
export function createAgentGraph() {
  // addNode는 N | K 타입의 새 StateGraph를 반환하므로 체인으로 연결해야
  // 이후 addEdge/setEntryPoint에서 노드 이름 타입이 올바르게 추론됨
  const graph = new StateGraph(AgentAnnotation)
    .addNode('router', routerNode)
    .addNode('chat', chatNode)
    .addNode('rag', ragNode)
    .addNode('diagnostic', diagnosticNode)
    .addNode('ui_action', uiActionNode)

  graph
    .setEntryPoint('router')
    .addConditionalEdges('router', routeDecision)
    .addEdge('chat', END)
    .addEdge('rag', END)
    .addEdge('diagnostic', END)
    .addEdge('ui_action', END)

  return graph.compile()
}

/**
 * 메시지 처리 진입점
 */
export async function processMessage(
  userMessage: string,
  history: BaseMessage[] = [],
) {
  const app = createAgentGraph()

  const result = await app.invoke({
    messages: [...history, new HumanMessage(userMessage)],
  })

  return {
    response: result.response as string,
    route: result.route as RouteType,
    uiAction: result.uiAction as UIAction | null,
    diagnosticResults: result.diagnosticResults as DiagnosticResult | null,
    messages: result.messages as BaseMessage[],
  }
}
