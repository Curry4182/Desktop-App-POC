import { describe, expect, it } from 'vitest'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { MemorySaver } from '@langchain/langgraph'
import { createAgent, fakeModel } from 'langchain'
import { createAgentRuntime, type DesignAssistantGraphDependencies } from '../agent/graph.js'
import type { DocumentSource } from '../agent/research/document-source.js'
import { WikipediaDocumentSource } from '../agent/research/wiki.js'
import {
  listAvailableScripts,
  listScriptsTool,
  scriptRunnerTool,
} from '../agent/support/scripts.js'
import { getSystemInfo } from '../agent/support/diagnostics.js'

const interpretReplies = new Map<string, string>([
  ['cad알아?', 'cad알아?'],
  ['그거 만든 회사가 뭐야?', 'CAD를 대표적으로 보여주는 CAD 소프트웨어를 만든 회사가 뭐야?'],
  ['그 회사의 창립자는?', 'AutoCAD를 만든 회사 Autodesk의 창립자는 누구야?'],
])

function createTestDeps(): DesignAssistantGraphDependencies {
  const assistantAgent = createAgent({
    model: fakeModel()
      .respond(new AIMessage('네, CAD 잘 압니다.'))
      .respond(new AIMessage('일반 응답입니다.')),
    tools: [],
  })

  return {
    interpretModel: RunnableLambda.from(async (messages: BaseMessage[]) => {
      const latest = String(messages.at(-1)?.content ?? '')
      return {
        rewrittenQuestion: interpretReplies.get(latest) ?? latest,
        needsClarification: false,
        question: '',
        options: [],
      }
    }),
    routerModel: RunnableLambda.from(async (messages: BaseMessage[]) => {
      const text = messages.map((m) => String(m.content ?? '')).join('\n')
      return { next: /회사|창립자/.test(text) ? 'research_init' : 'assistant' }
    }),
    assistantAgent,
    runResearch: async (input) => {
      const question = input.originalUserQuestion.toLowerCase()

      if (question.includes('창립자') || question.includes('founder')) {
        return {
          answer: 'Autodesk의 공동 창립자는 John Walker, Daniel Drake, 그리고 14명의 다른 프로그래머들입니다.',
          streamsAnswerTokens: false,
        }
      }

      return {
        answer: '대표적인 CAD 소프트웨어인 AutoCAD를 개발한 회사는 Autodesk입니다.',
        streamsAnswerTokens: false,
      }
    },
  }
}

async function collectAssistantReply(
  runtime: ReturnType<typeof createAgentRuntime>,
  threadId: string,
  userMessage: string,
) {
  let content = ''

  for await (const chunk of runtime.streamGraph({ userMessage, threadId, searchEnabled: true })) {
    if (chunk.type === 'token') content += chunk.content
    if (chunk.type === 'custom' && chunk.data?.type === 'answer_token') {
      content += String(chunk.data.content ?? '')
    }
  }

  return content
}

describe('agent core', () => {
  it('keeps follow-up company and founder questions grounded in prior context', async () => {
    const runtime = createAgentRuntime({
      deps: createTestDeps(),
      checkpointer: new MemorySaver(),
      recursionLimit: 40,
    })
    const threadId = `thread-${Date.now()}-cad-followup`

    await collectAssistantReply(runtime, threadId, 'cad알아?')
    const company = await collectAssistantReply(runtime, threadId, '그거 만든 회사가 뭐야?')
    const founder = await collectAssistantReply(runtime, threadId, '그 회사의 창립자는?')

    expect(company).toContain('Autodesk')
    expect(company).not.toContain('rewrittenQuestion')
    expect(founder).toContain('John Walker')
    expect(founder).toContain('Daniel Drake')
  })

  it('uses datasource document ids instead of display titles', async () => {
    const calls: string[] = []
    const mockSource: DocumentSource = {
      sourceType: 'other',
      async search() {
        return [{
          documentId: 'doc-42',
          title: 'Displayed Title',
          snippet: 'snippet',
          path: 'https://company.local/doc-42',
        }]
      },
      async getSummary(documentId) {
        calls.push(documentId)
        return {
          documentId,
          title: 'Displayed Title',
          summary: 'Company content',
          path: 'https://company.local/doc-42',
          metadata: { team: 'platform' },
        }
      },
      async getFullContent() {
        return null
      },
    }

    const results = await mockSource.search('internal keyword')
    expect(results.length).toBe(1)

    const summary = await mockSource.getSummary(results[0].documentId)
    expect(calls).toEqual(['doc-42'])
    expect(summary?.documentId).toBe('doc-42')
  })

  it('can reach wikipedia and load document summaries', async () => {
    const dataSource = new WikipediaDocumentSource()
    const results = await dataSource.search('Computer-aided design')
    const summary = await dataSource.getSummary('Computer-aided design')
    const content = await dataSource.getFullContent('Computer-aided design')

    expect(results.length).toBeGreaterThan(0)
    expect(summary?.summary.length).toBeGreaterThan(0)
    expect(content?.fullContent.length).toBeGreaterThan(0)
  }, 15000)

  it('exposes script tools and blocks unknown scripts', async () => {
    expect(scriptRunnerTool.name).toBe('run_script')
    expect(listScriptsTool.name).toBe('list_scripts')
    expect(Array.isArray(listAvailableScripts())).toBe(true)

    const result = await scriptRunnerTool.invoke({ scriptId: 'malicious-script' })
    expect(result).toContain('not found in registry')
  })

  it('collects basic system diagnostics', async () => {
    const info = await getSystemInfo()
    expect(info.os.platform).toBeDefined()
    expect(info.cpu.cores).toBeGreaterThan(0)
    expect(parseFloat(info.memory.totalGB)).toBeGreaterThan(0)
  }, 15000)
})
