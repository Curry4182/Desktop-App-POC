import { StateGraph, END, MemorySaver, Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { SupervisorAnnotation } from './state.js'
import { classifyAgent } from './supervisor.js'
import { runChatAgent } from './agents/chat-agent.js'
import { createSearchAgent } from './agents/search-agent.js'
import { createPCFixAgent } from './agents/pc-fix-agent.js'
import type { AgentName } from './types.js'

// ─── Nodes ───

async function supervisorNode(state: typeof SupervisorAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1]
  const decision = await classifyAgent(
    String(lastMessage.content),
    state.searchEnabled,
  )
  return { agentName: decision.agents[0] }
}

async function chatNode(state: typeof SupervisorAnnotation.State) {
  const response = await runChatAgent(state.messages)
  return { response }
}

async function searchNode(state: typeof SupervisorAnnotation.State) {
  const agent = createSearchAgent()
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
    case 'search': return 'search'
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
    .addNode('supervisor', supervisorNode)
    .addNode('chat', chatNode)
    .addNode('search', searchNode)
    .addNode('pc_fix', pcFixNode)

  graph
    .setEntryPoint('supervisor')
    .addConditionalEdges('supervisor', routeToAgent)
    .addEdge('chat', END)
    .addEdge('search', END)
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

  for await (const event of stream) {
    if (event.event === 'on_chat_model_stream' && event.data?.chunk) {
      const content = event.data.chunk.content
      if (typeof content === 'string' && content) {
        finalResponse += content
        yield { type: 'token' as const, content }
      }
    }

    if (event.event === 'on_chain_start' && event.name) {
      const stepMap: Record<string, string> = {
        supervisor: '메시지를 분석하고 있습니다...',
        search: '검색 에이전트가 처리 중...',
        pc_fix: 'PC 진단 에이전트가 처리 중...',
        chat: '응답을 생성하고 있습니다...',
      }
      if (stepMap[event.name]) {
        if (event.name !== 'supervisor') agentName = event.name as AgentName
        yield { type: 'step' as const, step: 'action' as const, summary: stepMap[event.name] }
      }
    }
  }

  yield {
    type: 'done' as const,
    response: finalResponse,
    agentName,
    diagnosticResults: null,
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
