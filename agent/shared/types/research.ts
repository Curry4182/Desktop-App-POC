export interface ResearchSource {
  title: string
  content: string
  sourceType: 'wikipedia' | 'other'
  url?: string
  documentId?: string
  author?: string
  lastUpdated?: string
  metadata?: Record<string, unknown>
}
