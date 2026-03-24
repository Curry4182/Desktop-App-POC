import { StateGraph, END, MemorySaver, Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { SupervisorAnnotation } from './state.js'
import { classifyRoute, createSupervisorReactAgent } from './supervisor.js'
import { runChatAgent } from './agents/chat-agent.js'
import { createPCFixAgent } from './agents/pc-fix-agent.js'
import type { AgentName } from './types.js'

// ─── Nodes ───

async function classifierNode(state: typeof SupervisorAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1]
  const agentName = await classifyRoute(
    String(lastMessage.content),
    state.searchEnabled,
  )
  return { agentName }
}

async function chatNode(state: typeof SupervisorAnnotation.State) {
  const response = await runChatAgent(state.messages)
  return { response }
}

async function researchNode(state: typeof SupervisorAnnotation.State) {
  // Supervisor ReAct agent: generates multiple research questions,
  // calls research tool for each, then synthesizes final answer
  const agent = createSupervisorReactAgent()
  const result = await agent.invoke({ messages: state.messages })
  const lastMsg = result.messages[result.messages.length - 1]
  return { response: String(lastMsg.content) }
}

async function pcFixNode(state: typeof SupervisorAnnotation.State) {
  const agent = createPCFixAgent()
  const result = await agent.invoke({ messages: state.messages })
  const lastMsg = result.messages[result.messages.length - 1]
  return { response: String(lastMsg.content) }
}

// ─── Routing ───

function routeToAgent(state: typeof SupervisorAnnotation.State): string {
  switch (state.agentName) {
    case 'research': return 'research'
    case 'pc_fix': return 'pc_fix'
    default: return 'chat'
  }
}

// ─── Graph (compiled once, reused) ───

const checkpointer = new MemorySaver()

type CompiledGraphType = ReturnType<typeof buildGraph>
let compiledGraph: CompiledGraphType | null = null

function buildGraph() {
  const graph = new StateGraph(SupervisorAnnotation)
    .addNode('classifier', classifierNode)
    .addNode('chat', chatNode)
    .addNode('research', researchNode)
    .addNode('pc_fix', pcFixNode)

  graph
    .setEntryPoint('classifier')
    .addConditionalEdges('classifier', routeToAgent)
    .addEdge('chat', END)
    .addEdge('research', END)
    .addEdge('pc_fix', END)

  return graph.compile({ checkpointer })
}

function getGraph() {
  if (!compiledGraph) compiledGraph = buildGraph()
  return compiledGraph
}

// ─── Streaming entry point ───

export async function* streamMessage(
  userMessage: string,
  history: BaseMessage[] = [],
  threadId: string = 'default',
  searchEnabled: boolean = true,
) {
  const app = getGraph()

  const stream = app.streamEvents(
    {
      messages: [...history, new HumanMessage(userMessage)],
      searchEnabled,
    },
    {
      configurable: { thread_id: threadId },
      version: 'v2',
    },
  )

  let finalResponse = ''
  let agentName: AgentName = 'chat'
  let activeNode = ''
  const collectedSources: Array<{
    title: string; content: string; sourceType: string;
    url?: string; documentId?: string; metadata?: Record<string, unknown>
  }> = []

  for await (const event of stream) {
    // Track which node is currently executing
    if (event.event === 'on_chain_start' && event.name) {
      const stepMap: Record<string, string> = {
        classifier: '메시지를 분석하고 있습니다...',
        research: '자료조사 에이전트가 처리 중...',
        pc_fix: 'PC 진단 에이전트가 처리 중...',
        chat: '응답을 생성하고 있습니다...',
      }
      if (stepMap[event.name]) {
        activeNode = event.name
        if (event.name !== 'classifier') agentName = event.name as AgentName
        yield { type: 'step' as const, step: 'action' as const, summary: stepMap[event.name] }
      }
    }

    // Capture LLM tool_calls to show research questions being asked
    if (event.event === 'on_chat_model_end' && activeNode === 'research') {
      try {
        const output = event.data?.output
        const toolCalls = output?.tool_calls || output?.additional_kwargs?.tool_calls || []
        for (const tc of toolCalls) {
          if (tc.name === 'research' && tc.args?.question) {
            yield { type: 'step' as const, step: 'action' as const, summary: `📝 조사 질문: "${tc.args.question}"` }
          }
        }
      } catch { /* ignore */ }
    }

    // Capture research tool results — extract search keywords + found documents
    if (event.event === 'on_tool_end') {
      try {
        const output = event.data?.output
        const text = typeof output === 'string' ? output : output?.content || ''
        const parsed = JSON.parse(text)

        // Research tool returns { answer, searchLog: { keywords, foundDocuments } }
        if (parsed.searchLog) {
          const { keywords, foundDocuments } = parsed.searchLog
          if (keywords && keywords.length > 0) {
            yield { type: 'step' as const, step: 'observation' as const, summary: `🔍 검색 키워드: ${keywords.map((k: string) => `"${k}"`).join(', ')}` }
          }
          if (foundDocuments && foundDocuments.length > 0) {
            const titles = foundDocuments.map((d: { title: string }) => d.title).join(', ')
            yield { type: 'step' as const, step: 'observation' as const, summary: `📄 ${foundDocuments.length}개 문서 발견: ${titles}` }
            // Collect full sources for badges + modal
            for (const doc of foundDocuments) {
              if (!collectedSources.some(s => s.title === doc.title)) {
                collectedSources.push(doc)
              }
            }
          }
        }

        // Also handle direct wiki_search results (if event propagates)
        if (parsed.sources && Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          for (const src of parsed.sources) {
            if (!collectedSources.some(s => s.documentId === src.documentId || s.title === src.title)) {
              collectedSources.push(src)
            }
          }
        }
      } catch { /* non-JSON tool output, ignore */ }
    }

    // Only stream LLM tokens from non-classifier nodes
    if (event.event === 'on_chat_model_stream' && event.data?.chunk) {
      const tags: string[] = event.tags || []
      const isClassifierLLM = tags.some(t => t.includes('classifier')) || activeNode === 'classifier'

      if (!isClassifierLLM) {
        const content = event.data.chunk.content
        if (typeof content === 'string' && content) {
          finalResponse += content
          yield { type: 'token' as const, content }
        }
      }
    }
  }

  yield {
    type: 'done' as const,
    response: finalResponse,
    agentName,
    diagnosticResults: null,
    sources: collectedSources,
  }
}

// ─── Resume after interrupt (HITL) ───

export async function* resumeGraph(
  threadId: string,
  resumeValue: unknown,
) {
  const app = getGraph()

  const stream = app.streamEvents(
    new Command({ resume: resumeValue }),
    {
      configurable: { thread_id: threadId },
      version: 'v2',
    },
  )

  let finalResponse = ''

  for await (const event of stream) {
    if (event.event === 'on_chat_model_stream' && event.data?.chunk) {
      const content = event.data.chunk.content
      if (typeof content === 'string' && content) {
        finalResponse += content
        yield { type: 'token' as const, content }
      }
    }
  }

  yield {
    type: 'done' as const,
    response: finalResponse,
    agentName: 'pc_fix' as AgentName,
    diagnosticResults: null,
  }
}

// ─── Non-streaming fallback (for testing) ───

export async function processMessage(
  userMessage: string,
  history: BaseMessage[] = [],
  threadId: string = 'default',
  searchEnabled: boolean = true,
) {
  let response = ''
  let agentName: AgentName = 'chat'

  for await (const event of streamMessage(userMessage, history, threadId, searchEnabled)) {
    if (event.type === 'token') response += event.content
    if (event.type === 'done') {
      response = event.response
      agentName = event.agentName
    }
  }

  return { response, agentName, diagnosticResults: null, messages: history }
}
