// agent/tools/wiki-api.ts — Wikipedia DataSource 구현
import type { DataSource, SearchResult, DocumentSummary, DocumentSection, SectionContent } from './data-source.js'

const TOP_K = parseInt(process.env.WIKI_SEARCH_TOP_K || '5', 10)
const SUMMARY_WORD_LIMIT = 150
const DETAIL_WORD_LIMIT = 300

// ─── Helpers ───

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

function truncateWords(text: string, limit: number): string {
  const words = text.split(/\s+/)
  if (words.length <= limit) return text
  return words.slice(0, limit).join(' ') + '...'
}

function relevanceScore(query: string, text: string): number {
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  if (queryWords.size === 0) return 1
  const textLower = text.toLowerCase()
  let matches = 0
  for (const word of queryWords) {
    if (textLower.includes(word)) matches++
  }
  return matches / queryWords.size
}

// ─── WikipediaDataSource ───

export class WikipediaDataSource implements DataSource {
  readonly sourceType = 'wikipedia'

  async search(query: string): Promise<SearchResult[]> {
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.searchParams.set('action', 'query')
    url.searchParams.set('list', 'search')
    url.searchParams.set('srsearch', query)
    url.searchParams.set('srlimit', String(TOP_K))
    url.searchParams.set('format', 'json')
    url.searchParams.set('origin', '*')

    const res = await fetch(url.toString())
    const data = await res.json() as {
      query: { search: Array<{ title: string; snippet: string; pageid: number }> }
    }

    const pages = data.query?.search
    if (!pages || pages.length === 0) return []

    return pages
      .map(page => ({
        id: String(page.pageid),
        title: page.title,
        snippet: stripHtml(page.snippet),
        relevance: relevanceScore(query, stripHtml(page.snippet) + ' ' + page.title),
      }))
      .filter(r => r.relevance > 0.1)
      .slice(0, 3)
      .map(({ relevance: _, ...rest }) => rest)
  }

  async getSummary(documentId: string): Promise<DocumentSummary | null> {
    // Wikipedia uses title as identifier for REST API
    const title = documentId
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const data = await res.json() as {
        title: string
        extract: string
        pageid?: number
        description?: string
      }
      return {
        id: String(data.pageid || documentId),
        title: data.title,
        content: truncateWords(data.extract, SUMMARY_WORD_LIMIT),
        description: data.description,
      }
    } catch {
      return null
    }
  }

  async getSections(documentId: string): Promise<DocumentSection[]> {
    const title = documentId
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.searchParams.set('action', 'parse')
    url.searchParams.set('page', title)
    url.searchParams.set('prop', 'sections')
    url.searchParams.set('format', 'json')
    url.searchParams.set('origin', '*')

    try {
      const res = await fetch(url.toString())
      const data = await res.json() as {
        parse?: { sections: Array<{ index: string; line: string; level: string }> }
      }
      if (!data.parse?.sections) return []
      return data.parse.sections
        .filter(s => s.level === '2' || s.level === '3')
        .map(s => ({ index: s.index, title: s.line }))
    } catch {
      return []
    }
  }

  async getSectionContent(documentId: string, sectionIndex: string): Promise<SectionContent | null> {
    const title = documentId
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.searchParams.set('action', 'parse')
    url.searchParams.set('page', title)
    url.searchParams.set('section', sectionIndex)
    url.searchParams.set('prop', 'text')
    url.searchParams.set('format', 'json')
    url.searchParams.set('origin', '*')

    try {
      const res = await fetch(url.toString())
      const data = await res.json() as {
        parse?: { title: string; text: { '*': string } }
      }
      if (!data.parse?.text) return null
      const rawHtml = data.parse.text['*']
      const text = stripHtml(rawHtml).replace(/\s+/g, ' ').trim()
      return {
        documentId: title,
        title: data.parse.title,
        section: sectionIndex,
        content: truncateWords(text, DETAIL_WORD_LIMIT),
      }
    } catch {
      return null
    }
  }
}
