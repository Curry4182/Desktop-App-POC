/**
 * 위키 기반 자료조사 에이전트 (agentic 모드).
 *
 * workflow 모드와 달리 ReAct 에이전트가 자율적으로
 * search_documents → get_document_summary → get_document_content
 * 순서로 도구를 호출하며 정보를 수집한다.
 *
 * 미들웨어로 모델 호출 횟수(8회), 도구 호출 횟수(12회)를 제한하고,
 * 메시지가 14개를 넘으면 자동 요약하여 컨텍스트를 관리한다.
 */
import {
  createAgent,
  dynamicSystemPromptMiddleware,
  modelCallLimitMiddleware,
  summarizationMiddleware,
  toolCallLimitMiddleware,
} from 'langchain'
import { createLLM } from '../infra/llm.js'
import type { AssistantAgentLike } from '../infra/runtime-types.js'
import {
  getDocumentContentTool,
  getDocumentSummaryTool,
  searchDocumentsTool,
} from './document-tools.js'

/** agentic 모드용 자료조사 ReAct 에이전트를 생성한다 */
export function createDefaultResearchAgent(): AssistantAgentLike {
  return createAgent({
    model: createLLM({ temperature: 0.1, maxTokens: 1800 }),
    tools: [
      searchDocumentsTool,
      getDocumentSummaryTool,
      getDocumentContentTool,
    ],
    middleware: [
      dynamicSystemPromptMiddleware<{ searchEnabled?: boolean }>((_state, runtime) => {
        const searchMode = runtime.context?.searchEnabled === false
          ? '검색이 꺼져 있습니다. 이 경우 도구를 쓰지 말고 검색이 필요하다고 설명하세요.'
          : '검색이 켜져 있습니다. 필요한 경우 문서 도구를 여러 번 호출해도 됩니다.'

        return `당신은 문서 기반 자료조사 전용 에이전트입니다.

역할:
- 일반 대화는 하지 말고, 자료조사와 최종 답변 작성만 담당합니다.
- 필요한 경우 여러 도구를 순차적으로 호출해 정보를 모은 뒤 답변합니다.
- 충분한 근거가 모이면 검색을 멈추고 답변합니다.

규칙:
- 검색어는 문장 대신 영어 키워드 위주로 작성하세요.
- search_documents -> get_document_summary -> 필요시 get_document_content 순서로 탐색하세요.
- 질문과 직접 관련 없는 후보나 주변 정보를 계속 넓히지 마세요.
- facts가 부족하면 모른다고 말할 수 있습니다.
- 최종 답변은 사용자와 같은 언어로 작성하세요.

${searchMode}`
      }),
      summarizationMiddleware({
        model: createLLM({ temperature: 0, maxTokens: 700 }),
        trigger: { messages: 14 },
        keep: { messages: 8 },
        summaryPrefix: '이전 조사 요약',
      }),
      modelCallLimitMiddleware({
        runLimit: 8,
        exitBehavior: 'end',
      }),
      toolCallLimitMiddleware({
        runLimit: 12,
        exitBehavior: 'continue',
      }),
    ],
  })
}
