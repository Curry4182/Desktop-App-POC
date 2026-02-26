import { describe, it, expect } from 'vitest'
import { listMarkdownFiles } from '../agent/rag/loader.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('RAG 문서 로더', () => {
  it('지식 베이스의 Markdown 파일 목록을 반환해야 함', () => {
    const knowledgePath = path.resolve(__dirname, '../resources/knowledge-base')
    const files = listMarkdownFiles(knowledgePath)

    expect(files.length).toBeGreaterThanOrEqual(3)
    for (const f of files) {
      expect(f.endsWith('.md')).toBe(true)
    }
  })

  it('존재하지 않는 디렉토리에 대해 빈 배열을 반환해야 함', () => {
    const files = listMarkdownFiles('/nonexistent/path')
    expect(files).toEqual([])
  })
})
