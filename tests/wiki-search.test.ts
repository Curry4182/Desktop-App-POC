import { describe, it, expect } from 'vitest'
import { wikiSearchTool } from '../agent/tools/wiki-search.js'

describe('wikiSearchTool', () => {
  it('should be a valid LangChain tool with correct metadata', () => {
    expect(wikiSearchTool.name).toBe('wiki_search')
    expect(wikiSearchTool.description).toBeDefined()
  })

  it('should return search results for a valid query', async () => {
    const result = await wikiSearchTool.invoke({ query: 'Python programming language' })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  }, 15000)
})
