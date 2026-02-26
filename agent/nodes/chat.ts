import { createLLM } from '../llm-factory.js'
import { SystemMessage } from '@langchain/core/messages'
import type { AgentStateType } from '../state.js'

const CHAT_SYSTEM_PROMPT = `당신은 CAD 설계 엔지니어를 위한 어시스턴트입니다.
설계 워크플로우, 소프트웨어 도구, 엔지니어링 프로세스에 관한 질문을 도와드립니다.
간결하고 전문적으로 답변하세요. 사용자와 같은 언어로 응답하세요.`

export async function chatNode(state: AgentStateType) {
  const llm = createLLM()
  const messages = [new SystemMessage(CHAT_SYSTEM_PROMPT), ...state.messages]

  const response = await llm.invoke(messages)

  return {
    messages: [...state.messages, response],
    response: response.content,
  }
}
