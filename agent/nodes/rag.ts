import { createLLM } from '../llm-factory.js'
import { SystemMessage } from '@langchain/core/messages'
import type { AgentStateType } from '../state.js'
import { getVectorStore } from '../rag/vectorstore.js'

const RAG_SYSTEM_PROMPT = `당신은 CATIA, AutoCAD, SolidWorks 등 CAD 도구에 정통한 설계 전문 어시스턴트입니다.
제공된 컨텍스트를 활용하여 질문에 정확하게 답변하세요.
컨텍스트에 관련 정보가 없는 경우 명확하게 알려주세요.
사용자와 같은 언어로 응답하세요.

참고 문서:
{context}`

export async function ragNode(state: AgentStateType) {
  const llm = createLLM({ temperature: 0.3 })
  const lastMessage = state.messages[state.messages.length - 1]

  // 벡터 스토어에서 관련 문서 검색
  let context = ''
  try {
    const vectorStore = await getVectorStore()
    const docs = await vectorStore.similaritySearch(String(lastMessage.content), 3)
    context = docs.map((d) => d.pageContent).join('\n\n---\n\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[RAG] 벡터 스토어 검색 실패:', message)
    context = '관련 문서를 찾을 수 없습니다.'
  }

  const systemPrompt = RAG_SYSTEM_PROMPT.replace('{context}', context)
  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    ...state.messages,
  ])

  return {
    messages: [...state.messages, response],
    response: response.content,
    context,
  }
}
