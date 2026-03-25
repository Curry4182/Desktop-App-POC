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
  getWikipediaSectionContentTool,
  getWikipediaSectionsTool,
  getWikipediaSummaryTool,
  searchWikipediaTool,
} from './wiki.js'

export function createDefaultResearchAgent(): AssistantAgentLike {
  return createAgent({
    model: createLLM({ temperature: 0.1, maxTokens: 1800 }),
    tools: [
      searchWikipediaTool,
      getWikipediaSummaryTool,
      getWikipediaSectionsTool,
      getWikipediaSectionContentTool,
    ],
    middleware: [
      dynamicSystemPromptMiddleware<{ searchEnabled?: boolean }>((_state, runtime) => {
        const searchMode = runtime.context?.searchEnabled === false
          ? '검색이 꺼져 있습니다. 이 경우 도구를 쓰지 말고 검색이 필요하다고 설명하세요.'
          : '검색이 켜져 있습니다. 필요한 경우 위키 도구를 여러 번 호출해도 됩니다.'

        return `당신은 위키 기반 자료조사 전용 에이전트입니다.

역할:
- 일반 대화는 하지 말고, 자료조사와 최종 답변 작성만 담당합니다.
- 필요한 경우 여러 도구를 순차적으로 호출해 정보를 모은 뒤 답변합니다.
- 충분한 근거가 모이면 검색을 멈추고 답변합니다.

규칙:
- 검색어는 문장 대신 영어 키워드 위주로 작성하세요.
- search_wikipedia -> get_wikipedia_summary -> 필요시 sections/section_content 순서로 탐색하세요.
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
