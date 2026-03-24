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
  let isResearchNode = false // research node doesn't stream — captures final response at end
  const tokenUsage: Record<string, { input: number; output: number }> = {}
  const collectedSources: Array<{
    title: string; content: string; sourceType: string;
    url?: string; documentId?: string; metadata?: Record<string, unknown>
  }> = []

  for await (const event of stream) {
    // Track which node is currently executing
    if (event.event === 'on_chain_start' && event.name) {
      const stepMap: Record<string, { summary: string; category: string }> = {
        classifier: { summary: '메시지 분석 중', category: 'system' },
        research: { summary: '자료조사 에이전트', category: 'system' },
        pc_fix: { summary: 'PC 진단 에이전트', category: 'system' },
        chat: { summary: '응답 생성 중', category: 'system' },
      }
      if (stepMap[event.name]) {
        activeNode = event.name
        if (event.name !== 'classifier') agentName = event.name as AgentName
        if (event.name === 'research') isResearchNode = true
        yield { type: 'step' as const, ...stepMap[event.name] }
      }
    }

    // Track token usage from all LLM calls
    if (event.event === 'on_chat_model_end') {
      try {
        const output = event.data?.output
        const usage = output?.usage_metadata || output?.response_metadata?.usage
        if (usage) {
          const node = activeNode || 'unknown'
          if (!tokenUsage[node]) tokenUsage[node] = { input: 0, output: 0 }
          tokenUsage[node].input += usage.input_tokens || usage.prompt_tokens || 0
          tokenUsage[node].output += usage.output_tokens || usage.completion_tokens || 0
        }
      } catch { /* ignore */ }
    }

    // Capture LLM tool_calls to show research questions and answer phase
    if (event.event === 'on_chat_model_end' && activeNode === 'research') {
      try {
        const output = event.data?.output
        const toolCalls = output?.tool_calls || output?.additional_kwargs?.tool_calls || []
        for (const tc of toolCalls) {
          if (tc.name === 'research' && tc.args?.question) {
            yield { type: 'step' as const, category: 'research', summary: tc.args.question }
          }
          if (tc.name === 'generate_answer') {
            yield { type: 'step' as const, category: 'answer', summary: '답변 생성 중' }
          }
        }
      } catch { /* ignore */ }
    }

    // Capture tool results — extract search keywords + found documents
    if (event.event === 'on_tool_end') {
      try {
        const output = event.data?.output
        const text = typeof output === 'string' ? output : output?.content || ''
        const parsed = JSON.parse(text)

        if (parsed.searchLog) {
          const { keywords, foundDocuments } = parsed.searchLog
          if (keywords && keywords.length > 0) {
            yield { type: 'step' as const, category: 'search', summary: `검색: ${keywords.map((k: string) => `"${k}"`).join(', ')}` }
          }
          if (foundDocuments && foundDocuments.length > 0) {
            const titles = foundDocuments.map((d: { title: string }) => d.title).join(', ')
            yield { type: 'step' as const, category: 'search', summary: `${foundDocuments.length}개 문서: ${titles}` }
            for (const doc of foundDocuments) {
              if (!collectedSources.some(s => s.title === doc.title)) {
                collectedSources.push(doc)
              }
            }
          }
        }

        if (parsed.sources && Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          for (const src of parsed.sources) {
            if (!collectedSources.some(s => s.documentId === src.documentId || s.title === src.title)) {
              collectedSources.push(src)
            }
          }
        }
      } catch { /* non-JSON tool output, ignore */ }
    }

    // Capture research node's final response when it completes
    if (event.event === 'on_chain_end' && event.name === 'research' && isResearchNode) {
      try {
        const output = event.data?.output
        const response = output?.response
        if (typeof response === 'string' && response) {
          finalResponse = response
          yield { type: 'token' as const, content: response }
        }
      } catch { /* ignore */ }
    }

    // Stream LLM tokens — only for chat/pc_fix (NOT research)
    if (!isResearchNode && event.event === 'on_chat_model_stream' && event.data?.chunk) {
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
    tokenUsage,
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
