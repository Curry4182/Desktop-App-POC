import { createLLM } from '../llm-factory.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import type { AgentStateType } from '../state.js'
import { runDiagnostics } from '../tools/pc-diagnostic.js'
import type { DiagnosticResult } from '../types.js'

const DIAGNOSTIC_SYSTEM_PROMPT = `당신은 범용 PC 진단 전문가입니다.
진단 결과를 분석하여 아래 항목을 제공하세요.
1. 시스템 사양 요약 (OS, CPU, 메모리, GPU, 디스크)
2. 사용자 질문과 관련된 설치 소프트웨어 식별
3. 디스크/메모리/네트워크 문제 감지
4. 구체적인 조치 방안 제시
구체적이고 실행 가능한 내용으로 답변하세요. 사용자와 같은 언어로 응답하세요.

진단 결과:
{results}`

export async function diagnosticNode(state: AgentStateType) {
  const llm = createLLM({ temperature: 0.2 })
  const lastMessage = state.messages[state.messages.length - 1]

  // PC 진단 실행
  let diagnosticResults: DiagnosticResult | { error: string; partial: boolean }
  try {
    diagnosticResults = await runDiagnostics(String(lastMessage.content))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    diagnosticResults = { error: message, partial: true }
  }

  const resultsJson = JSON.stringify(diagnosticResults, null, 2)
  const systemPrompt = DIAGNOSTIC_SYSTEM_PROMPT.replace('{results}', resultsJson)

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(String(lastMessage.content)),
  ])

  return {
    messages: [...state.messages, response],
    response: response.content,
    diagnosticResults,
  }
}
