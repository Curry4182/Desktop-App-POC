/**
 * 문서 소스 인터페이스 정의.
 *
 * DocumentSource는 검색 → 요약 → 전문 조회의 3단계 접근을 추상화한다.
 * 현재 구현체는 WikipediaDocumentSource(wiki.ts)이며,
 * 향후 사내 문서(Markdown RAG 등)를 같은 인터페이스로 추가할 수 있다.
 */

/** 검색 결과 한 건 */
export type SearchHit = {
  documentId: string
  title: string
  snippet: string
  path?: string
  metadata?: Record<string, unknown>
}

/** 문서 요약 정보 */
export type DocumentSummary = {
  documentId: string
  title: string
  summary: string
  path?: string
  metadata?: Record<string, unknown>
}

/** 문서 전문 내용 */
export type DocumentContent = {
  documentId: string
  title: string
  fullContent: string
  path?: string
  metadata?: Record<string, unknown>
}

/**
 * 문서 소스 인터페이스.
 * search → getSummary → getFullContent 순서로 점진적으로 상세 정보를 조회한다.
 */
export interface DocumentSource {
  readonly sourceType: 'internal' | 'external' | 'other'
  search(query: string): Promise<SearchHit[]>
  getSummary(documentId: string): Promise<DocumentSummary | null>
  getFullContent(documentId: string): Promise<DocumentContent | null>
}
