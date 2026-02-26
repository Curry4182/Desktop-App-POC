import { describe, it, expect, beforeAll } from 'vitest'
import { runDiagnostics } from '../agent/tools/pc-diagnostic.js'
import { listMarkdownFiles } from '../agent/rag/loader.js'
import { isValidUIAction, UI_FUNCTION_REGISTRY } from '../agent/tools/ui-functions.js'
import type { DiagnosticResult } from '../agent/types.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 통합 테스트: 실제 LLM API 호출 없이 전체 파이프라인 검증
 */
describe('통합 테스트: 전체 파이프라인 (LLM 없음)', () => {
  let diagnosticResult: DiagnosticResult

  beforeAll(async () => {
    diagnosticResult = await runDiagnostics('통합 테스트')
  }, 20000)

  it('진단 파이프라인이 완료되어야 함', () => {
    expect(diagnosticResult).toBeDefined()
    expect(diagnosticResult.timestamp).toBeDefined()
    expect(new Date(diagnosticResult.timestamp)).toBeInstanceOf(Date)
  })

  it('진단 결과에 유효한 시스템 정보가 포함되어야 함', () => {
    const sys = diagnosticResult.system
    expect(sys.os.platform).toBeDefined()
    expect(sys.cpu.cores).toBeGreaterThan(0)
    expect(parseFloat(sys.memory.totalGB)).toBeGreaterThan(0)
    expect(Array.isArray(sys.gpu)).toBe(true)
    expect(Array.isArray(sys.disks)).toBe(true)
    expect(Array.isArray(diagnosticResult.installedPrograms)).toBe(true)
  })

  it('지식 베이스 문서가 존재해야 함', () => {
    const knowledgePath = path.resolve(__dirname, '../resources/knowledge-base')
    const files = listMarkdownFiles(knowledgePath)
    expect(files.length).toBeGreaterThanOrEqual(3)
  })

  it('모든 필수 UI 액션이 등록되어 있어야 함', () => {
    const actions = Object.keys(UI_FUNCTION_REGISTRY)
    expect(actions.length).toBeGreaterThanOrEqual(5)
    expect(isValidUIAction('startDiagnostic')).toBe(true)
    expect(isValidUIAction('exportReport')).toBe(true)
  })

  it('프로젝트 필수 파일이 모두 존재해야 함', () => {
    const projectRoot = path.resolve(__dirname, '..')

    const requiredFiles = [
      'agent/graph.ts',
      'agent/llm-factory.ts',
      'agent/nodes/router.ts',
      'agent/nodes/chat.ts',
      'agent/nodes/rag.ts',
      'agent/nodes/diagnostic.ts',
      'agent/nodes/ui-action.ts',
      'agent/rag/vectorstore.ts',
      'agent/rag/loader.ts',
      'agent/tools/pc-diagnostic.ts',
      'agent/tools/ui-functions.ts',
      'electron/main.ts',
      'electron/preload.ts',
      'src/App.vue',
      'src/stores/chat.ts',
    ]

    for (const file of requiredFiles) {
      const fullPath = path.join(projectRoot, file)
      expect(fs.existsSync(fullPath), `누락된 파일: ${file}`).toBe(true)
    }
  })
})
