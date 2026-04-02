/**
 * 자료조사 결과에서 프론트엔드로 전달되는 소스 타입.
 */
export interface ResearchSource {
  title: string
  content: string
  sourceType: 'internal' | 'external' | 'other'
  path?: string
  documentId?: string
  author?: string
  lastUpdated?: string
  metadata?: Record<string, unknown>
}
