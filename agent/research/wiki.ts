import { tool, type ToolRuntime } from 'langchain'
import { z } from 'zod'
import type { ResearchSource } from '../shared/types/research.js'

export interface SearchResult {
  id: string
  title: string
  snippet: string
  url?: string
  metadata?: Record<string, unknown>
}

export interface DocumentSummary {
  id: string
  title: string
  content: string
  url?: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface DocumentSection {
  index: string
  title: string
}

export interface SectionContent {
  documentId: string
  title: string
  section: string
  content: string
}

export interface DataSource {
  readonly sourceType: string
  search(query: string): Promise<SearchResult[]>
  getSummary(documentId: string): Promise<DocumentSummary | null>
  getSections(documentId: string): Promise<DocumentSection[]>
  getSectionContent(documentId: string, sectionIndex: string): Promise<SectionContent | null>
}

const TOP_K = parseInt(process.env.WIKI_SEARCH_TOP_K || '5', 10)
const SUMMARY_WORD_LIMIT = 220
const DETAIL_WORD_LIMIT = 500
const EVIDENCE_HUNGRY_QUERY_PATTERN = /\b(founder|founded|creator|created|inventor|invented|pioneer|origin|history|person|people|who|birth|born|company|population|environment|impact|influence|influential)\b/i
const SUMMARY_RESULT_LIMIT = 3
const SECTION_DOC_LIMIT_NORMAL = 1
const SECTION_DOC_LIMIT_DEEP = 2
const SECTION_LIMIT_NORMAL = 3
const SECTION_LIMIT_DEEP = 4

function toWikipediaUrl(title: string) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

function truncateWords(text: string, limit: number): string {
  const words = text.split(/\s+/)
  if (words.length <= limit) return text
  return `${words.slice(0, limit).join(' ')}...`
}

function relevanceScore(query: string, text: string): number {
  const queryWords = query
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1)
  if (queryWords.length === 0) return 1

  const textWords = new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []))
  const textLower = text.toLowerCase()
  let matches = 0
  for (const word of queryWords) {
    const wordLower = word.toLowerCase()
    const isShortToken = wordLower.length <= 4
    const matched = isShortToken ? textWords.has(wordLower) : textLower.includes(wordLower)
    if (matched) matches += 1
  }
  return matches / queryWords.length
}

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
      .map((page) => ({
        id: page.title,
        title: page.title,
        snippet: stripHtml(page.snippet),
        url: toWikipediaUrl(page.title),
        relevance: relevanceScore(query, `${stripHtml(page.snippet)} ${page.title}`),
      }))
      .filter((result) => result.relevance > 0.1)
      .slice(0, 3)
      .map(({ relevance: _relevance, ...rest }) => rest)
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
        id: documentId,
        title: data.title,
        content: truncateWords(data.extract, SUMMARY_WORD_LIMIT),
        url: toWikipediaUrl(data.title),
        description: data.description,
      }
    } catch {
      return null
    }
  }

  async getSections(documentId: string): Promise<DocumentSection[]> {
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.searchParams.set('action', 'parse')
    url.searchParams.set('page', documentId)
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
        .filter((section) => section.level === '2' || section.level === '3')
        .map((section) => ({ index: section.index, title: section.line }))
    } catch {
      return []
    }
  }

  async getSectionContent(documentId: string, sectionIndex: string): Promise<SectionContent | null> {
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.searchParams.set('action', 'parse')
    url.searchParams.set('page', documentId)
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
      return {
        documentId,
        title: data.parse.title,
        section: sectionIndex,
        content: truncateWords(stripHtml(data.parse.text['*']).replace(/\s+/g, ' ').trim(), DETAIL_WORD_LIMIT),
      }
    } catch {
      return null
    }
  }
}

type ResearchWriter = ((chunk: unknown) => void) | null | undefined
type ResearchContext = { searchEnabled?: boolean }

export type ResearchSearchResult = {
  query: string
  depth: 'normal' | 'deep'
  findings: string
  sources: ResearchSource[]
}

function shouldEnrichWithSections(query: string, depth: 'normal' | 'deep') {
  if (depth === 'deep') return true
  return EVIDENCE_HUNGRY_QUERY_PATTERN.test(query)
}

export function getDefaultDataSource(): DataSource {
  return new WikipediaDataSource()
}

export async function performResearchSearch({
  query,
  depth = 'normal',
  searchEnabled = true,
  writer,
  dataSource = getDefaultDataSource(),
}: {
  query: string
  depth?: 'normal' | 'deep'
  searchEnabled?: boolean
  writer?: ResearchWriter
  dataSource?: DataSource
}): Promise<ResearchSearchResult> {
  if (!searchEnabled) {
    return {
      query,
      depth,
      findings: '검색 도구가 현재 비활성화되어 있습니다. 사용자가 검색을 켠 뒤 다시 시도해야 합니다.',
      sources: [],
    }
  }

  const sources: ResearchSource[] = []
  writer?.({ type: 'search_start', query })
  const results = await dataSource.search(query)

  if (results.length === 0) {
    writer?.({ type: 'search_result', titles: [], count: 0 })
    return {
      query,
      depth,
      findings: `No results found for "${query}".`,
      sources: [],
    }
  }

  writer?.({
    type: 'search_result',
    titles: results.map((result) => result.title),
    count: results.length,
  })

  const sections: string[] = []
  for (const result of results.slice(0, SUMMARY_RESULT_LIMIT)) {
    const summary = await dataSource.getSummary(result.id)
    if (!summary) continue

    const url = summary.url ?? result.url
    sources.push({
      title: summary.title,
      content: summary.content,
      sourceType: dataSource.sourceType as 'wikipedia' | 'other',
      documentId: summary.id,
      url,
      metadata: {
        ...(result.metadata ?? {}),
        ...(summary.metadata ?? {}),
        ...(summary.description ? { description: summary.description } : {}),
      },
    })

    writer?.({
      type: 'source_found',
      title: summary.title,
      url,
      snippet: summary.content.slice(0, 160),
    })

    sections.push(
      [
        `Title: ${summary.title}`,
        summary.description ? `Description: ${summary.description}` : null,
        `Summary: ${summary.content}`,
        `URL: ${url}`,
      ].filter(Boolean).join('\n'),
    )
  }

  if (shouldEnrichWithSections(query, depth) && results.length > 0) {
    const documentLimit = depth === 'deep' ? SECTION_DOC_LIMIT_DEEP : SECTION_DOC_LIMIT_NORMAL
    const sectionLimit = depth === 'deep' ? SECTION_LIMIT_DEEP : SECTION_LIMIT_NORMAL

    for (const result of results.slice(0, documentLimit)) {
      const sectionList = await dataSource.getSections(result.id)
      for (const section of sectionList.slice(0, sectionLimit)) {
        const content = await dataSource.getSectionContent(result.id, section.index)
        if (!content) continue
        sections.push(`Section: ${result.title} / ${section.title}\n${content.content}`)
      }
    }
  }

  const formattedSources = sources.length > 0
    ? sources.map((source) => `- ${source.title} (${source.url ?? 'no url'})`).join('\n')
    : '- none'

  return {
    query,
    depth,
    findings: [
      `Research query: ${query}`,
      '',
      'Findings:',
      ...sections.flatMap((section) => [section, '']),
      'Sources:',
      formattedSources,
    ].join('\n').trim(),
    sources,
  }
}

export const researchWorkerTool = tool(
  async (
    { query, depth = 'normal' }: { query: string; depth?: 'normal' | 'deep' },
    runtime: ToolRuntime<unknown, ResearchContext>,
  ) => {
    const result = await performResearchSearch({
      query,
      depth,
      searchEnabled: runtime.context?.searchEnabled !== false,
      writer: runtime.writer,
    })
    return result.findings
  },
  {
    name: 'research_worker',
    description: '정보를 검색하고 요약된 결과와 출처를 반환합니다. depth="deep"으로 상세 정보를 조회할 수 있습니다. 1~3단어의 구체적인 영어 키워드가 가장 효과적입니다.',
    schema: z.object({
      query: z.string().max(50).describe('English search query, 1-3 specific words.'),
      depth: z.enum(['normal', 'deep']).optional().describe('Search depth. Default: normal.'),
    }),
  },
)

const wikipedia = new WikipediaDataSource()

function emitStep(runtime: ToolRuntime<unknown, ResearchContext>, step: string) {
  runtime.writer?.({ type: 'research_step', step })
}

export const searchWikipediaTool = tool(
  async ({ query }: { query: string }, runtime: ToolRuntime<unknown, ResearchContext>) => {
    if (runtime.context?.searchEnabled === false) {
      return JSON.stringify({ error: 'Search is disabled.' })
    }

    emitStep(runtime, `에이전트 검색어: ${query}`)
    runtime.writer?.({ type: 'search_start', query })
    const results = await wikipedia.search(query)

    runtime.writer?.({
      type: 'search_result',
      count: results.length,
      titles: results.map((result) => result.title),
    })

    for (const result of results) {
      runtime.writer?.({
        type: 'source_found',
        title: result.title,
        url: result.url,
        snippet: result.snippet,
      })
    }

    return JSON.stringify(results, null, 2)
  },
  {
    name: 'search_wikipedia',
    description: 'Search Wikipedia with short English keyword queries. Use this first to find relevant page titles and document IDs.',
    schema: z.object({
      query: z.string().max(50).describe('English keyword search query, ideally 1-4 words.'),
    }),
  },
)

export const getWikipediaSummaryTool = tool(
  async ({ documentId }: { documentId: string }, runtime: ToolRuntime<unknown, ResearchContext>) => {
    const summary = await wikipedia.getSummary(documentId)
    if (!summary) {
      return JSON.stringify({ error: `No summary found for ${documentId}` })
    }

    runtime.writer?.({
      type: 'source_found',
      title: summary.title,
      url: summary.url,
      snippet: summary.content,
    })

    return JSON.stringify(summary, null, 2)
  },
  {
    name: 'get_wikipedia_summary',
    description: 'Fetch the summary of a specific Wikipedia document by document ID or title.',
    schema: z.object({
      documentId: z.string().describe('Wikipedia document ID or page title returned by search_wikipedia.'),
    }),
  },
)

export const getWikipediaSectionsTool = tool(
  async ({ documentId }: { documentId: string }) =>
    JSON.stringify(await wikipedia.getSections(documentId), null, 2),
  {
    name: 'get_wikipedia_sections',
    description: 'List sections of a Wikipedia document when summary is not enough.',
    schema: z.object({
      documentId: z.string().describe('Wikipedia document ID or page title.'),
    }),
  },
)

export const getWikipediaSectionContentTool = tool(
  async ({ documentId, sectionIndex }: { documentId: string; sectionIndex: string }) => {
    const content = await wikipedia.getSectionContent(documentId, sectionIndex)
    if (!content) {
      return JSON.stringify({ error: `No section content found for ${documentId}#${sectionIndex}` })
    }
    return JSON.stringify(content, null, 2)
  },
  {
    name: 'get_wikipedia_section_content',
    description: 'Fetch the content of a specific section from a Wikipedia document.',
    schema: z.object({
      documentId: z.string().describe('Wikipedia document ID or page title.'),
      sectionIndex: z.string().describe('Section index returned by get_wikipedia_sections.'),
    }),
  },
)
