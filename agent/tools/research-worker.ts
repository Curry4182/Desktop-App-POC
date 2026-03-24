// agent/tools/research-worker.ts — DataSource 인터페이스 기반 검색 도구
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { DataSource } from './data-source.js'
import { WikipediaDataSource } from './wiki-api.js'
import type { ResearchSource } from '../types.js'

// ─── 데이터 소스 선택 (환경변수로 교체 가능) ───
function getDataSource(): DataSource {
  // 추후 사내 정보망 구현 시:
  // if (process.env.DATA_SOURCE === 'internal') return new InternalDataSource()
  return new WikipediaDataSource()
}

export const researchWorkerTool = tool(
  async ({ query, depth }: { query: string; depth?: string }, config: LangGraphRunnableConfig) => {
    const dataSource = getDataSource()
    const sources: ResearchSource[] = []

    // Step 1: Search
    config.writer?.({ type: 'search_start', query })
    const results = await dataSource.search(query)

    if (results.length === 0) {
      config.writer?.({ type: 'search_result', titles: [], count: 0 })
      return JSON.stringify({ summary: `No results found for "${query}".`, sources: [] })
    }

    config.writer?.({ type: 'search_result', titles: results.map(r => r.title), count: results.length })

    // Step 2: Get summaries for top results
    const summaries: string[] = []
    for (const result of results.slice(0, 2)) {
      // Wikipedia uses title as documentId for getSummary
      const summary = await dataSource.getSummary(result.title)
      if (summary) {
        summaries.push(`[${summary.title}]: ${summary.content}`)
        sources.push({
          title: summary.title,
          content: summary.content,
          sourceType: dataSource.sourceType as 'wikipedia' | 'other',
          documentId: summary.id,
          metadata: summary.description ? { description: summary.description } : undefined,
        })
        config.writer?.({
          type: 'source_found',
          title: summary.title,
          url: '',
          snippet: summary.content.slice(0, 100),
        })
      }
    }

    // Step 3: If depth is "deep", get section details for the first result
    if (depth === 'deep' && results.length > 0) {
      const mainTitle = results[0].title
      const sections = await dataSource.getSections(mainTitle)
      for (const sec of sections.slice(0, 2)) {
        const content = await dataSource.getSectionContent(mainTitle, sec.index)
        if (content) {
          summaries.push(`[${mainTitle} - ${sec.title}]: ${content.content}`)
        }
      }
    }

    return JSON.stringify({
      summary: summaries.join('\n\n'),
      sources,
    })
  },
  {
    name: 'research_worker',
    description: '정보를 검색하고 요약된 결과와 출처를 반환합니다. depth="deep"으로 상세 정보를 조회할 수 있습니다. 각 호출은 독립적입니다. 1~3단어의 구체적인 영어 키워드가 가장 효과적입니다.',
    schema: z.object({
      query: z.string().max(50).describe('English search query, 1-3 specific words.'),
      depth: z.enum(['normal', 'deep']).optional().describe('Search depth. Default: normal.'),
    }),
  }
)
