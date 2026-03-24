import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { ResearchSource } from '../types.js'

const TOP_K = parseInt(process.env.WIKI_SEARCH_TOP_K || '3', 10)

async function searchWikipedia(query: string, topK: number): Promise<ResearchSource[]> {
  // Step 1: Search for page titles
  const searchUrl = new URL('https://en.wikipedia.org/w/api.php')
  searchUrl.searchParams.set('action', 'query')
  searchUrl.searchParams.set('list', 'search')
  searchUrl.searchParams.set('srsearch', query)
  searchUrl.searchParams.set('srlimit', String(topK))
  searchUrl.searchParams.set('format', 'json')
  searchUrl.searchParams.set('origin', '*')

  const searchRes = await fetch(searchUrl.toString())
  const searchData = await searchRes.json() as {
    query: { search: Array<{ title: string; snippet: string; pageid: number }> }
  }

  const pages = searchData.query?.search
  if (!pages || pages.length === 0) {
    return []
  }

  // Step 2: Fetch summaries with metadata for each page
  const sources: ResearchSource[] = await Promise.all(
    pages.map(async (page): Promise<ResearchSource> => {
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`
      try {
        const res = await fetch(summaryUrl)
        const data = await res.json() as {
          title: string
          extract: string
          content_urls?: { desktop?: { page?: string } }
          timestamp?: string
          description?: string
        }
        return {
          title: data.title,
          content: data.extract,
          sourceType: 'wikipedia',
          url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
          documentId: String(page.pageid),
          lastUpdated: data.timestamp,
          metadata: {
            description: data.description,
            pageid: page.pageid,
          },
        }
      } catch {
        return {
          title: page.title,
          content: page.snippet.replace(/<[^>]*>/g, ''),
          sourceType: 'wikipedia',
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
          documentId: String(page.pageid),
        }
      }
    })
  )

  return sources
}

// Tool that returns structured JSON for Research Agent consumption
export const wikiSearchTool = tool(
  async ({ query }) => {
    const sources = await searchWikipedia(query, TOP_K)
    if (sources.length === 0) {
      return JSON.stringify({ query, sources: [], summary: `No results found for "${query}".` })
    }
    return JSON.stringify({
      query,
      sources,
      summary: `Found ${sources.length} sources for "${query}".`,
    })
  },
  {
    name: 'wiki_search',
    description: 'Search Wikipedia for information. Returns structured results with title, content, source URL, and metadata for each article found.',
    schema: z.object({
      query: z.string().describe('The search query to look up on Wikipedia'),
    }),
  }
)
