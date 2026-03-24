import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { ResearchSource } from '../types.js'

const TOP_K = parseInt(process.env.WIKI_SEARCH_TOP_K || '5', 10)
const SUMMARY_WORD_LIMIT = 150

// ─── Relevance scoring ───

function relevanceScore(query: string, snippet: string): number {
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  if (queryWords.size === 0) return 1
  const snippetLower = snippet.toLowerCase()
  let matches = 0
  for (const word of queryWords) {
    if (snippetLower.includes(word)) matches++
  }
  return matches / queryWords.size
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

function truncateWords(text: string, limit: number): string {
  const words = text.split(/\s+/)
  if (words.length <= limit) return text
  return words.slice(0, limit).join(' ') + '...'
}

// ─── Tool 1: wiki_search — snippet only (lightweight) ───

export const wikiSearchTool = tool(
  async ({ query }) => {
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php')
    searchUrl.searchParams.set('action', 'query')
    searchUrl.searchParams.set('list', 'search')
    searchUrl.searchParams.set('srsearch', query)
    searchUrl.searchParams.set('srlimit', String(TOP_K))
    searchUrl.searchParams.set('format', 'json')
    searchUrl.searchParams.set('origin', '*')

    const searchRes = await fetch(searchUrl.toString())
    const searchData = await searchRes.json() as {
      query: { search: Array<{ title: string; snippet: string; pageid: number }> }
    }

    const pages = searchData.query?.search
    if (!pages || pages.length === 0) {
      return JSON.stringify({ query, results: [], summary: `No results for "${query}".` })
    }

    // Filter by relevance and return snippets only (no full article fetch)
    const results = pages
      .map(page => ({
        title: page.title,
        snippet: stripHtml(page.snippet),
        pageid: page.pageid,
        relevance: relevanceScore(query, stripHtml(page.snippet) + ' ' + page.title),
      }))
      .filter(r => r.relevance > 0.1)
      .slice(0, 3)

    return JSON.stringify({
      query,
      results: results.map(r => ({
        title: r.title,
        snippet: r.snippet,
        pageid: r.pageid,
      })),
      summary: `${results.length} results found. Use wiki_get_summary to read relevant articles.`,
    })
  },
  {
    name: 'wiki_search',
    description: 'Search Wikipedia. Returns short snippets for each result. Use 1-3 specific English words as query (e.g., "Computer-aided design", NOT long sentences). After reviewing snippets, use wiki_get_summary to read the full article for relevant ones.',
    schema: z.object({
      query: z.string().max(50).describe('English search query, 1-3 specific words. Proper nouns and technical terms work best.'),
    }),
  }
)

// ─── Tool 2: wiki_get_summary — single article fetch (truncated) ───

const DETAIL_WORD_LIMIT = 300

// ─── Tool 3: wiki_get_detail — section-level deep read ───

export const wikiGetDetailTool = tool(
  async ({ title, section }) => {
    try {
      if (!section) {
        // Return section list so LLM can pick which to read
        const url = new URL('https://en.wikipedia.org/w/api.php')
        url.searchParams.set('action', 'parse')
        url.searchParams.set('page', title)
        url.searchParams.set('prop', 'sections')
        url.searchParams.set('format', 'json')
        url.searchParams.set('origin', '*')

        const res = await fetch(url.toString())
        const data = await res.json() as {
          parse?: { sections: Array<{ index: string; line: string; level: string }> }
        }

        if (!data.parse?.sections) {
          return JSON.stringify({ error: `No sections found for "${title}"` })
        }

        const sections = data.parse.sections
          .filter(s => s.level === '2' || s.level === '3')
          .map(s => ({ index: s.index, title: s.line }))

        return JSON.stringify({
          article: title,
          sections,
          instruction: 'Call wiki_get_detail again with a section index to read that section.',
        })
      }

      // Fetch specific section content
      const url = new URL('https://en.wikipedia.org/w/api.php')
      url.searchParams.set('action', 'parse')
      url.searchParams.set('page', title)
      url.searchParams.set('section', section)
      url.searchParams.set('prop', 'text')
      url.searchParams.set('format', 'json')
      url.searchParams.set('origin', '*')

      const res = await fetch(url.toString())
      const data = await res.json() as {
        parse?: { title: string; text: { '*': string } }
      }

      if (!data.parse?.text) {
        return JSON.stringify({ error: `Failed to fetch section ${section} of "${title}"` })
      }

      const rawHtml = data.parse.text['*']
      const text = stripHtml(rawHtml).replace(/\s+/g, ' ').trim()
      const truncated = truncateWords(text, DETAIL_WORD_LIMIT)

      return JSON.stringify({
        article: title,
        section,
        content: truncated,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      })
    } catch {
      return JSON.stringify({ error: `Failed to fetch detail for "${title}"` })
    }
  },
  {
    name: 'wiki_get_detail',
    description: 'Read a specific section of a Wikipedia article for deeper information. Call without section to get section list first, then call again with section index to read content. Use when wiki_get_summary is not enough.',
    schema: z.object({
      title: z.string().describe('Wikipedia article title'),
      section: z.string().optional().describe('Section index number (e.g., "1", "3"). Omit to get section list.'),
    }),
  }
)

// ─── Tool 2: wiki_get_summary — single article fetch (truncated) ───

export const wikiGetSummaryTool = tool(
  async ({ title }) => {
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    try {
      const res = await fetch(summaryUrl)
      const data = await res.json() as {
        title: string
        extract: string
        content_urls?: { desktop?: { page?: string } }
        timestamp?: string
        description?: string
        pageid?: number
      }

      const source: ResearchSource = {
        title: data.title,
        content: truncateWords(data.extract, SUMMARY_WORD_LIMIT),
        sourceType: 'wikipedia',
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        documentId: String(data.pageid || ''),
        lastUpdated: data.timestamp,
        metadata: { description: data.description },
      }

      return JSON.stringify(source)
    } catch {
      return JSON.stringify({ error: `Failed to fetch summary for "${title}"` })
    }
  },
  {
    name: 'wiki_get_summary',
    description: 'Fetch the full summary of a specific Wikipedia article by title. Use this after wiki_search to read relevant articles in detail.',
    schema: z.object({
      title: z.string().describe('Exact Wikipedia article title from wiki_search results'),
    }),
  }
)
