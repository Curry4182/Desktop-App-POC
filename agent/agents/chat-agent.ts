import { createLLM } from '../llm-factory.js'
import { SystemMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'

const CHAT_SYSTEM_PROMPT = `당신은 CAD 설계 엔지니어를 위한 어시스턴트입니다.
설계 워크플로우, 소프트웨어 도구, 엔지니어링 프로세스에 관한 질문을 도와드립니다.

규칙:
- 간결하고 전문적으로 답변하세요
- 사용자와 같은 언어로 응답하세요
- 의미 없는 입력(감탄사, 장난, "메롱", "ㅋㅋ", "ㅎㅎ" 등)에는 짧게 1문장으로 응답
- 이전 대화 맥락이 있으면 활용하여 후속 질문에 답변하세요
- "왜?", "어떻게?", "더 알려줘" 같은 후속 질문은 이전 대화 내용을 기반으로 답변`

export async function runChatAgent(messages: BaseMessage[]): Promise<string> {
  const llm = createLLM()
  const response = await llm.invoke([
    new SystemMessage(CHAT_SYSTEM_PROMPT),
    ...messages,
  ])
  return String(response.content)
}
