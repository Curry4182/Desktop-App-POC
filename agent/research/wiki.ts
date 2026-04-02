/**
 * Wikipedia API를 사용하는 DocumentSource 구현체.
 *
 * 3개의 Wikipedia API를 조합한다:
 * - search()          : action=query&list=search (검색)
 * - getSummary()      : /api/rest_v1/page/summary (요약)
 * - getFullContent()  : action=parse (HTML 파싱 → 텍스트 변환)
 *
 * 검색 결과는 relevance score로 필터링하고,
 * 요약/전문은 단어 수 제한으로 토큰 비용을 관리한다.
 */
import type {
  DocumentContent,
  DocumentSource,
  DocumentSummary,
  SearchHit,
} from './document-source.js'

const TOP_K = parseInt(process.env.WIKI_SEARCH_TOP_K || '5', 10)  // 검색 결과 최대 수
const SUMMARY_WORD_LIMIT = 220     // 요약 단어 수 제한
const FULL_CONTENT_WORD_LIMIT = 1400 // 전문 단어 수 제한

function toWikipediaPath(title: string) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateWords(text: string, limit: number): string {
  const words = text.split(/\s+/)
  if (words.length <= limit) return text
  return `${words.slice(0, limit).join(' ')}...`
}

/** Wikipedia API 기반 문서 소스 구현체 */
export class WikipediaDocumentSource implements DocumentSource {
  readonly sourceType = 'external' as const

  async search(query: string): Promise<SearchHit[]> {
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.searchParams.set('action', 'query')
    url.searchParams.set('list', 'search')
    url.searchParams.set('srsearch', query)
    url.searchParams.set('srlimit', String(TOP_K))
    url.searchParams.set('format', 'json')
    url.searchParams.set('origin', '*')

    const res = await fetch(url.toString())
    const data = await res.json() as {
      query?: { search?: Array<{ title: string; snippet: string }> }
    }

    const pages = data.query?.search
    if (!pages || pages.length === 0) return []

    // 검색어 단어 매칭 비율로 관련도를 평가하여 노이즈를 필터링한다
    const queryWords = query.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1)
    const hits: SearchHit[] = []

    for (const page of pages) {
      const snippet = stripHtml(page.snippet)
      const combined = `${snippet} ${page.title}`
      const textLower = combined.toLowerCase()
      const textWords = new Set((textLower.match(/[a-z0-9]+/g) ?? []))

      let matches = 0
      for (const word of queryWords) {
        const wl = word.toLowerCase()
        if (wl.length <= 4 ? textWords.has(wl) : textLower.includes(wl)) matches += 1
      }

      const relevance = queryWords.length === 0 ? 1 : matches / queryWords.length
      if (relevance <= 0.1) continue

      hits.push({
        documentId: page.title,
        title: page.title,
        snippet,
        path: toWikipediaPath(page.title),
      })
      if (hits.length >= 3) break
    }

    return hits
  }

  async getSummary(documentId: string): Promise<DocumentSummary | null> {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(documentId)}`

    try {
      const res = await fetch(url)
      if (!res.ok) return null

      const data = await res.json() as {
        title: string
        extract: string
        description?: string
      }

      return {
        documentId,
        title: data.title,
        summary: truncateWords(data.extract, SUMMARY_WORD_LIMIT),
        path: toWikipediaPath(data.title),
        metadata: data.description ? { description: data.description } : undefined,
      }
    } catch {
      return null
    }
  }

  async getFullContent(documentId: string): Promise<DocumentContent | null> {
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.searchParams.set('action', 'parse')
    url.searchParams.set('page', documentId)
    url.searchParams.set('prop', 'text')
    url.searchParams.set('format', 'json')
    url.searchParams.set('origin', '*')

    try {
      const res = await fetch(url.toString())
      if (!res.ok) return null

      const data = await res.json() as {
        parse?: { title: string; text?: { '*': string } }
      }
      const html = data.parse?.text?.['*']
      if (!html || !data.parse?.title) return null

      return {
        documentId,
        title: data.parse.title,
        fullContent: truncateWords(stripHtml(html), FULL_CONTENT_WORD_LIMIT),
        path: toWikipediaPath(data.parse.title),
      }
    } catch {
      return null
    }
  }
}

/** 기본 문서 소스(Wikipedia) 싱글턴을 반환한다 */
export function getDefaultDocumentSource(): DocumentSource {
  return new WikipediaDocumentSource()
}
