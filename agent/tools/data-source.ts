// agent/tools/data-source.ts
// 데이터 소스 인터페이스 — Wikipedia, 사내 정보망 등 교체 가능

export interface SearchResult {
  id: string
  title: string
  snippet: string
}

export interface DocumentSummary {
  id: string
  title: string
  content: string
  description?: string
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

/**
 * DataSource interface — 모든 검색 소스가 구현해야 하는 인터페이스
 */
export interface DataSource {
  /** 소스 식별자 (예: 'wikipedia', 'internal') */
  readonly sourceType: string

  /** 키워드로 문서 검색 */
  search(query: string): Promise<SearchResult[]>

  /** 특정 문서의 요약 조회 */
  getSummary(documentId: string): Promise<DocumentSummary | null>

  /** 특정 문서의 섹션 목록 조회 */
  getSections(documentId: string): Promise<DocumentSection[]>

  /** 특정 문서의 특정 섹션 내용 조회 */
  getSectionContent(documentId: string, sectionIndex: string): Promise<SectionContent | null>
}
