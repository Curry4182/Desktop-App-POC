import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const TOP_K = parseInt(process.env.WIKI_SEARCH_TOP_K || '3', 10)

async function searchWikipedia(query: string, topK: number): Promise<string> {
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
    query: { search: Array<{ title: string; snippet: string }> }
  }

  const pages = searchData.query?.search
  if (!pages || pages.length === 0) {
    return `No Wikipedia results found for "${query}".`
  }

  // Step 2: Fetch summaries for each page
  const summaries = await Promise.all(
    pages.map(async (page) => {
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`
      try {
        const res = await fetch(summaryUrl)
        const data = await res.json() as { title: string; extract: string }
        return `## ${data.title}\n${data.extract}`
      } catch {
        return `## ${page.title}\n${page.snippet.replace(/<[^>]*>/g, '')}`
      }
    })
  )

  return summaries.join('\n\n---\n\n')
}

export const wikiSearchTool = tool(
  async ({ query }) => {
    return searchWikipedia(query, TOP_K)
  },
  {
    name: 'wiki_search',
    description: 'Search Wikipedia for information. Input should be a search query keyword. Returns summaries of top matching articles.',
    schema: z.object({
      query: z.string().describe('The search query to look up on Wikipedia'),
    }),
  }
)
