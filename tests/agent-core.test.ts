import { describe, expect, it } from 'vitest'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { MemorySaver } from '@langchain/langgraph'
import { createAgent, fakeModel } from 'langchain'
import { createAgentRuntime, type DesignAssistantGraphDependencies } from '../agent/graph.js'
import {
  createResearchWorkflow,
  type ResearchWorkflowDependencies,
} from '../agent/research/workflow.js'
import {
  performResearchSearch,
  type DataSource,
  WikipediaDataSource,
} from '../agent/research/wiki.js'
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

function stringifyMessages(messages: BaseMessage[]) {
  return messages.map((message) => String(message.content ?? '')).join('\n')
}

function createTestDeps(): DesignAssistantGraphDependencies {
  const assistantAgent = createAgent({
    model: fakeModel()
      .respond(new AIMessage('네, CAD 잘 압니다.'))
      .respond(new AIMessage('일반 응답입니다.')),
    tools: [],
  })

  const answerModel = fakeModel()
    .respond(new AIMessage('대표적인 CAD 소프트웨어인 AutoCAD를 개발한 회사는 Autodesk입니다.'))
    .respond(new AIMessage('Autodesk의 공동 창립자는 John Walker, Daniel Drake, 그리고 14명의 다른 프로그래머들입니다.'))

  const workflowDeps: ResearchWorkflowDependencies = {
    planner: RunnableLambda.from(async (messages: BaseMessage[]) => {
      const text = stringifyMessages(messages)

      if (text.includes('Known facts:\n- none') && text.includes('Autodesk의 창립자')) {
        return {
          action: 'search',
          researchQuestion: 'Autodesk founders',
          searchQuery: 'Autodesk founder',
          depth: 'normal' as const,
        }
      }

      if (text.includes('Known facts:\n- none') && text.includes('CAD 소프트웨어를 만든 회사')) {
        return {
          action: 'search',
          researchQuestion: 'Company behind AutoCAD',
          searchQuery: 'AutoCAD Autodesk',
          depth: 'normal' as const,
        }
      }

      return {
        action: 'answer' as const,
        researchQuestion: '',
        searchQuery: '',
        depth: 'normal' as const,
      }
    }),
    distiller: RunnableLambda.from(async (messages: BaseMessage[]) => {
      const text = stringifyMessages(messages)

      if (text.includes('developed and marketed by Autodesk')) {
        return {
          stepSummary: 'AutoCAD를 개발한 회사는 Autodesk다.',
          newFacts: [
            { label: 'AutoCAD developer company', value: 'Autodesk', sourceTitle: 'AutoCAD' },
          ],
          enoughToAnswer: true,
        }
      }

      if (text.includes('founded in April 1982 by John Walker')) {
        return {
          stepSummary: 'Autodesk는 John Walker, Daniel Drake, 그리고 14명의 다른 프로그래머가 공동 창립했다.',
          newFacts: [
            { label: 'Autodesk founders', value: 'John Walker, Daniel Drake, and 14 other programmers', sourceTitle: 'Autodesk' },
          ],
          enoughToAnswer: true,
        }
      }

      return {
        stepSummary: '유의미한 새 사실이 없다.',
        newFacts: [],
        enoughToAnswer: true,
      }
    }),
    reviewer: RunnableLambda.from(async () => ({
      isComplete: true,
      reason: '핵심 사실이 확보되었다.',
      missingAspect: '',
      researchQuestion: '',
      searchQuery: '',
      depth: 'normal' as const,
    })),
    answerModel,
    search: async ({ query }) => {
      const normalized = query.toLowerCase()

      if (normalized.includes('autodesk') && normalized.includes('founder')) {
        return {
          query,
          depth: 'normal' as const,
          findings: [
            'Title: Autodesk',
            'Summary: Autodesk was founded in April 1982 by John Walker, Daniel Drake, and 14 other programmers.',
            'URL: https://en.wikipedia.org/wiki/Autodesk',
          ].join('\n'),
          sources: [{
            title: 'Autodesk',
            content: 'Autodesk was founded in April 1982 by John Walker, Daniel Drake, and 14 other programmers.',
            sourceType: 'wikipedia' as const,
            url: 'https://en.wikipedia.org/wiki/Autodesk',
            documentId: 'Autodesk',
          }],
        }
      }

      if (normalized.includes('autocad') || normalized.includes('cad company')) {
        return {
          query,
          depth: 'normal' as const,
          findings: [
            'Title: AutoCAD',
            'Summary: AutoCAD is a commercial computer-aided design software application developed and marketed by Autodesk.',
            'URL: https://en.wikipedia.org/wiki/AutoCAD',
          ].join('\n'),
          sources: [{
            title: 'AutoCAD',
            content: 'AutoCAD is a commercial computer-aided design software application developed and marketed by Autodesk.',
            sourceType: 'wikipedia' as const,
            url: 'https://en.wikipedia.org/wiki/AutoCAD',
            documentId: 'AutoCAD',
          }],
        }
      }

      return {
        query,
        depth: 'normal' as const,
        findings: `Title: Unknown\nSummary: No useful facts for ${query}`,
        sources: [],
      }
    },
  }

  const researchWorkflow = createResearchWorkflow(workflowDeps)

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
      const text = stringifyMessages(messages)
      return { next: /회사|창립자/.test(text) ? 'research_init' : 'assistant' }
    }),
    assistantAgent,
    runResearch: async (input, config) => {
      const result = await researchWorkflow.invoke({
        messages: input.messages,
        searchEnabled: input.searchEnabled,
        originalUserQuestion: input.originalUserQuestion,
        researchClarifications: input.researchClarifications,
      }, config)

      return { answer: result.answer, streamsAnswerTokens: true }
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
    const mockSource: DataSource = {
      sourceType: 'other',
      async search() {
        return [{
          id: 'doc-42',
          title: 'Displayed Title',
          snippet: 'snippet',
          url: 'https://company.local/doc-42',
        }]
      },
      async getSummary(documentId) {
        calls.push(documentId)
        return {
          id: documentId,
          title: 'Displayed Title',
          content: 'Company content',
          url: 'https://company.local/doc-42',
          metadata: { team: 'platform' },
        }
      },
      async getSections(documentId) {
        calls.push(`sections:${documentId}`)
        return []
      },
      async getSectionContent() {
        return null
      },
    }

    const result = await performResearchSearch({
      query: 'internal keyword',
      dataSource: mockSource,
    })

    expect(calls).toEqual(['doc-42'])
    expect(result.sources[0]?.documentId).toBe('doc-42')
  })

  it('can reach wikipedia and load summaries', async () => {
    const dataSource = new WikipediaDataSource()
    const results = await dataSource.search('Computer-aided design')
    const summary = await dataSource.getSummary('Computer-aided design')

    expect(results.length).toBeGreaterThan(0)
    expect(summary?.content.length).toBeGreaterThan(0)
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
