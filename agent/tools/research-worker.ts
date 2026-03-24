import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { searchWikipedia, getSummary, getSections, getSectionContent } from './wiki-api.js'
import type { ResearchSource } from '../types.js'

export const researchWorkerTool = tool(
  async ({ query, depth }: { query: string; depth?: string }, config: LangGraphRunnableConfig) => {
    const sources: ResearchSource[] = []

    // Step 1: Search
    config.writer?.({ type: 'search_start', query })
    const results = await searchWikipedia(query)

    if (results.length === 0) {
      config.writer?.({ type: 'search_result', titles: [], count: 0 })
      return JSON.stringify({ summary: `No results found for "${query}".`, sources: [] })
    }

    config.writer?.({ type: 'search_result', titles: results.map(r => r.title), count: results.length })

    // Step 2: Get summaries for top results
    const summaries: string[] = []
    for (const result of results.slice(0, 2)) {
      const summary = await getSummary(result.title)
      if (summary) {
        summaries.push(`[${summary.title}]: ${summary.content}`)
        sources.push({
          title: summary.title,
          content: summary.content,
          sourceType: 'wikipedia',
          url: summary.url,
          documentId: summary.pageid,
          metadata: { description: summary.description },
        })
        config.writer?.({
          type: 'source_found',
          title: summary.title,
          url: summary.url,
          snippet: summary.content.slice(0, 100),
        })
      }
    }

    // Step 3: If depth is "deep", get section details for the first result
    if (depth === 'deep' && results.length > 0) {
      const mainTitle = results[0].title
      const sections = await getSections(mainTitle)
      for (const sec of sections.slice(0, 2)) {
        const content = await getSectionContent(mainTitle, sec.index)
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
    description: 'Search Wikipedia for a specific query and return summarized results with sources. Use depth="deep" for detailed section-level information. Each call is independent — use specific, focused queries (1-3 English words work best).',
    schema: z.object({
      query: z.string().max(50).describe('English search query, 1-3 specific words. Proper nouns and technical terms work best.'),
      depth: z.enum(['normal', 'deep']).optional().describe('Search depth. "normal" for summary, "deep" for section-level detail. Default: normal.'),
    }),
  }
)
