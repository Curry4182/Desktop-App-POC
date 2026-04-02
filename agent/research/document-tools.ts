/**
 * 자료조사용 LangChain 도구(tool) 정의.
 *
 * agentic 모드의 ReAct 에이전트가 직접 호출하는 3단계 도구:
 *   searchDocumentsTool → getDocumentSummaryTool → getDocumentContentTool
 */
import { tool, type ToolRuntime } from 'langchain'
import { z } from 'zod'
import { getDefaultDocumentSource } from './wiki.js'

type ResearchContext = { searchEnabled?: boolean }
type Runtime = ToolRuntime<unknown, ResearchContext>

/** 싱글턴 Wikipedia 문서 소스 */
const documentSource = getDefaultDocumentSource()

/** 프론트엔드에 조사 단계를 알리는 헬퍼 */
function emitStep(runtime: Runtime, step: string) {
  runtime.writer?.({ type: 'research_step', step })
}

/** 프론트엔드에 문서 발견 이벤트를 전송한다 */
function emitSourceFound(
  runtime: Runtime,
  doc: { title: string; documentId: string; path?: string; metadata?: Record<string, unknown> },
  snippet: string,
) {
  runtime.writer?.({
    type: 'source_found',
    title: doc.title,
    documentId: doc.documentId,
    sourceType: documentSource.sourceType,
    path: doc.path,
    snippet,
    metadata: doc.metadata,
  })
}

/** [agentic 도구 1/3] 키워드로 문서를 검색하고 결과 목록을 반환한다 */
export const searchDocumentsTool = tool(
  async ({ query }: { query: string }, runtime: Runtime) => {
    if (runtime.context?.searchEnabled === false) {
      return JSON.stringify({ error: 'Search is disabled.' })
    }

    emitStep(runtime, `에이전트 검색어: ${query}`)
    runtime.writer?.({ type: 'search_start', query })
    const results = await documentSource.search(query)

    runtime.writer?.({
      type: 'search_result',
      count: results.length,
      titles: results.map((r) => r.title),
    })

    for (const result of results) {
      emitSourceFound(runtime, result, result.snippet)
    }

    return JSON.stringify(results, null, 2)
  },
  {
    name: 'search_documents',
    description: 'Search documents with short English keyword queries. Use this first to find relevant document IDs.',
    schema: z.object({
      query: z.string().max(50).describe('English keyword search query, ideally 1-4 words.'),
    }),
  },
)

/** [agentic 도구 2/3] 문서 ID로 요약을 조회한다 */
export const getDocumentSummaryTool = tool(
  async ({ documentId }: { documentId: string }, runtime: Runtime) => {
    const summary = await documentSource.getSummary(documentId)
    if (!summary) return JSON.stringify({ error: `No summary found for ${documentId}` })

    emitSourceFound(runtime, summary, summary.summary)
    return JSON.stringify(summary, null, 2)
  },
  {
    name: 'get_document_summary',
    description: 'Fetch the summary of a specific document by document ID.',
    schema: z.object({
      documentId: z.string().describe('Document ID returned by search_documents.'),
    }),
  },
)

/** [agentic 도구 3/3] 문서 ID로 전문(full content)을 조회한다 */
export const getDocumentContentTool = tool(
  async ({ documentId }: { documentId: string }, runtime: Runtime) => {
    const content = await documentSource.getFullContent(documentId)
    if (!content) return JSON.stringify({ error: `No document content found for ${documentId}` })

    emitSourceFound(runtime, content, content.fullContent.slice(0, 160))
    return JSON.stringify(content, null, 2)
  },
  {
    name: 'get_document_content',
    description: 'Fetch the full content of a specific document.',
    schema: z.object({
      documentId: z.string().describe('Document ID or title returned by search_documents.'),
    }),
  },
)
