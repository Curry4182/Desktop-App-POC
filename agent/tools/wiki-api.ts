// agent/tools/wiki-api.ts

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

// ─── Types ───

export interface WikiSearchResult {
  title: string
  snippet: string
  pageid: number
}

export interface WikiSummary {
  title: string
  content: string
  url: string
  pageid: string
  description?: string
}

export interface WikiSection {
  index: string
  title: string
}

export interface WikiSectionContent {
  article: string
  section: string
  content: string
  url: string
}

// ─── API Functions ───

export async function searchWikipedia(query: string): Promise<WikiSearchResult[]> {
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
      title: page.title,
      snippet: stripHtml(page.snippet),
      pageid: page.pageid,
      relevance: relevanceScore(query, stripHtml(page.snippet) + ' ' + page.title),
    }))
    .filter(r => r.relevance > 0.1)
    .slice(0, 3)
    .map(({ relevance: _, ...rest }) => rest)
}

export async function getSummary(title: string): Promise<WikiSummary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as {
      title: string
      extract: string
      content_urls?: { desktop?: { page?: string } }
      pageid?: number
      description?: string
    }
    return {
      title: data.title,
      content: truncateWords(data.extract, SUMMARY_WORD_LIMIT),
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      pageid: String(data.pageid || ''),
      description: data.description,
    }
  } catch {
    return null
  }
}

export async function getSections(title: string): Promise<WikiSection[]> {
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

export async function getSectionContent(title: string, section: string): Promise<WikiSectionContent | null> {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'parse')
  url.searchParams.set('page', title)
  url.searchParams.set('section', section)
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
      article: title,
      section,
      content: truncateWords(text, DETAIL_WORD_LIMIT),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    }
  } catch {
    return null
  }
}
