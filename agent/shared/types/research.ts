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
