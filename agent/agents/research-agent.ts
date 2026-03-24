import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { createLLM } from '../llm-factory.js'
import { wikiSearchTool, wikiGetSummaryTool } from '../tools/wiki-search.js'
import { HumanMessage } from '@langchain/core/messages'

const MAX_ITERATIONS = parseInt(process.env.REACT_MAX_ITERATIONS || '5', 10)

const RESEARCH_SYSTEM_PROMPT = `당신은 자료조사 전문 에이전트입니다.
검색 도구를 사용하여 자료를 수집하고 정리합니다.

## 도구
1. wiki_search: Wikipedia에서 snippet 검색 (가볍게, 결과 미리보기)
2. wiki_get_summary: 특정 문서의 상세 요약 가져오기 (선택한 문서만)

## 검색 키워드 전략 (매우 중요!)

Wikipedia 검색은 1~3단어의 정확한 영어 키워드가 가장 효과적입니다.

### 규칙:
1. 핵심 개념어 1~3단어로 첫 검색
   - "CAD 기술 발전에 기여한 국가" → "Computer-aided design"
   - "3D 프린팅의 역사" → "3D printing"
   - "반도체 산업" → "Semiconductor industry"

2. 절대 긴 문장을 검색어로 사용하지 마세요
   - BAD: "CAD technology development major contributing countries"
   - GOOD: "Computer-aided design"

3. 첫 검색 snippet에서 고유명사를 발견하면 후속 검색
   - "Computer-aided design" → snippet에서 "Sketchpad", "Ivan Sutherland" 발견
   - → "Sketchpad" 또는 "Ivan Sutherland" 로 추가 검색

4. 재검색 시 동의어/관련어를 시도
   - "CAD" → "AutoCAD", "CATIA", "SolidWorks"

## 검색 흐름
1. wiki_search로 snippet 검색 (가볍게)
2. snippet을 읽고 관련 있는 문서 판단
3. wiki_get_summary로 관련 문서만 상세 조회 (선택적)
4. 정보가 부족하면 다른 키워드로 wiki_search 재시도 (최대 3회)

## 재검색 판단 기준
- 결과 0건 → 키워드를 더 일반적으로 변경
- snippet이 질문과 무관 → 완전히 다른 키워드로 재검색
- 부분적 정보만 → 부족한 부분만 추가 검색
- 3회 검색 후에도 부족 → 수집된 자료만으로 답변

## 답변 형식
- 질문에 대한 간결한 답변
- 출처를 [출처: 제목 - URL] 형식으로 명시
- 검색 결과 기반으로만 답변 (추측 금지)
- 사용자와 같은 언어로 답변`

function createInternalResearchAgent() {
  const llm = createLLM({ temperature: 0.3 })
  return createReactAgent({
    llm,
    tools: [wikiSearchTool, wikiGetSummaryTool],
    prompt: RESEARCH_SYSTEM_PROMPT,
    name: 'research_worker',
  })
}

// Extract search keywords and found documents from agent message history
function extractSearchLog(messages: Array<{ _getType: () => string; content: unknown; name?: string }>): {
  keywords: string[]
  foundDocuments: Array<{ title: string; content: string; sourceType: string; url?: string; documentId?: string; metadata?: Record<string, unknown> }>
} {
  const keywords: string[] = []
  const foundDocuments: Array<{ title: string; content: string; sourceType: string; url?: string; documentId?: string; metadata?: Record<string, unknown> }> = []

  for (const msg of messages) {
    if (msg._getType() === 'ai') {
      const aiMsg = msg as any
      const toolCalls = aiMsg.tool_calls || aiMsg.additional_kwargs?.tool_calls || []
      for (const tc of toolCalls) {
        if (tc.name === 'wiki_search' && tc.args?.query) {
          keywords.push(tc.args.query)
        }
      }
    }

    // Capture wiki_get_summary results (full articles)
    if (msg._getType() === 'tool' && msg.name === 'wiki_get_summary') {
      try {
        const parsed = JSON.parse(String(msg.content))
        if (parsed.title && !parsed.error) {
          if (!foundDocuments.some(d => d.title === parsed.title)) {
            foundDocuments.push({
              title: parsed.title,
              content: parsed.content || '',
              sourceType: parsed.sourceType || 'wikipedia',
              url: parsed.url,
              documentId: parsed.documentId,
              metadata: parsed.metadata,
            })
          }
        }
      } catch { /* ignore */ }
    }

    // Also capture wiki_search snippets as lightweight sources
    if (msg._getType() === 'tool' && msg.name === 'wiki_search') {
      try {
        const parsed = JSON.parse(String(msg.content))
        if (parsed.results && Array.isArray(parsed.results)) {
          for (const r of parsed.results) {
            if (!foundDocuments.some(d => d.title === r.title)) {
              foundDocuments.push({
                title: r.title,
                content: r.snippet || '',
                sourceType: 'wikipedia',
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
                documentId: String(r.pageid || ''),
              })
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  return { keywords, foundDocuments }
}

// Research tool — returns answer + structured search log
export const researchTool = tool(
  async ({ question }) => {
    const agent = createInternalResearchAgent()
    const result = await agent.invoke(
      { messages: [new HumanMessage(question)] },
      { recursionLimit: MAX_ITERATIONS * 2 },
    )

    const lastMsg = result.messages[result.messages.length - 1]
    const answer = String(lastMsg.content)
    const searchLog = extractSearchLog(result.messages as any)

    return JSON.stringify({
      answer,
      searchLog,
    })
  },
  {
    name: 'research',
    description: '자료조사 도구. 질문을 입력하면 Wikipedia 등에서 관련 자료를 검색하고, 출처를 포함한 답변을 반환합니다.',
    schema: z.object({
      question: z.string().describe('조사할 질문 (구체적일수록 좋음)'),
    }),
  }
)
