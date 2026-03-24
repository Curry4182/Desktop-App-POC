import { Annotation, MessagesAnnotation, StateGraph, MemorySaver, START, Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { randomUUID } from 'crypto'
import { supervisorNode } from './supervisor.js'
import { researchNode } from './agents/research-agent.js'
import { chatNode } from './agents/chat-agent.js'
import { pcFixNode } from './agents/pc-fix-agent.js'
import { createTracer } from './observability.js'
import 'dotenv/config'

// ─── State Schema ───

export const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  searchEnabled: Annotation<boolean>({
    reducer: (_prev: boolean, next: boolean) => next,
    default: () => true,
  }),
  conversationSummary: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
})

// ─── Build Graph ───

const checkpointer = new MemorySaver()

function buildGraph() {
  const graph = new StateGraph(GraphAnnotation)
    .addNode('supervisor', supervisorNode, {
      ends: ['research', 'pc_fix', 'chat', '__end__'],
    })
    .addNode('research', researchNode, {
      ends: ['supervisor'],
    })
    .addNode('pc_fix', pcFixNode, {
      ends: ['supervisor'],
    })
    .addNode('chat', chatNode, {
      ends: ['supervisor'],
    })
    .addEdge(START, 'supervisor')

  return graph.compile({ checkpointer })
}

let compiledGraph: ReturnType<typeof buildGraph> | null = null

function getGraph() {
  if (!compiledGraph) compiledGraph = buildGraph()
  return compiledGraph
}

// ─── Session Management ───

let currentThreadId = `session-${randomUUID()}`

export function getThreadId() {
  return currentThreadId
}

export function resetSession() {
  currentThreadId = `session-${randomUUID()}`
}

// ─── Streaming Entry Point ───

export async function* streamGraph(
  userMessage: string,
  searchEnabled: boolean = true,
) {
  const graph = getGraph()
  const tracer = await createTracer()
  const callbacks = tracer ? [tracer] : []

  const config = {
    configurable: { thread_id: currentThreadId },
    callbacks,
  }

  const input = {
    messages: [new HumanMessage(userMessage)],
    searchEnabled,
  }

  const stream = await graph.stream(input, {
    ...config,
    streamMode: ['messages', 'custom', 'updates'] as const,
  })

  for await (const chunk of stream) {
    const [mode, data] = chunk as [string, any]

    switch (mode) {
      case 'messages': {
        const [msgChunk, metadata] = data
        if (msgChunk._getType() === 'ai' && msgChunk.content) {
          if (metadata?.langgraph_node !== 'supervisor') {
            yield {
              type: 'token' as const,
              content: String(msgChunk.content),
              node: metadata?.langgraph_node || 'unknown',
            }
          }
        }
        break
      }
      case 'custom': {
        yield { type: 'custom' as const, data }
        break
      }
      case 'updates': {
        if (data && '__interrupt__' in data) {
          for (const intr of data.__interrupt__) {
            yield { type: 'interrupt' as const, data: intr.value }
          }
          return
        }
        break
      }
    }
  }

  yield { type: 'done' as const }
}

// ─── Resume After Interrupt ───

export async function* resumeGraph(resumeValue: unknown) {
  const graph = getGraph()

  const config = {
    configurable: { thread_id: currentThreadId },
  }

  const stream = await graph.stream(new Command({ resume: resumeValue }), {
    ...config,
    streamMode: ['messages', 'custom', 'updates'] as const,
  })

  for await (const chunk of stream) {
    const [mode, data] = chunk as [string, any]

    switch (mode) {
      case 'messages': {
        const [msgChunk, metadata] = data
        if (msgChunk._getType() === 'ai' && msgChunk.content) {
          if (metadata?.langgraph_node !== 'supervisor') {
            yield {
              type: 'token' as const,
              content: String(msgChunk.content),
              node: metadata?.langgraph_node || 'unknown',
            }
          }
        }
        break
      }
      case 'custom': {
        yield { type: 'custom' as const, data }
        break
      }
      case 'updates': {
        if (data && '__interrupt__' in data) {
          for (const intr of data.__interrupt__) {
            yield { type: 'interrupt' as const, data: intr.value }
          }
          return
        }
        break
      }
    }
  }

  yield { type: 'done' as const }
}
