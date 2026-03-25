import { HumanMessage, type BaseMessage } from '@langchain/core/messages'
import { Annotation, Command, END, MemorySaver, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'
import { createLLM } from '../../infra/llm.js'
import type {
  AssistantAgentLike,
  RunResearchFn,
  StructuredModel,
} from '../../infra/runtime-types.js'
import { createTracer } from '../../infra/telemetry.js'
import { TokenUsageCollector } from '../../infra/token-usage.js'
import { createDefaultResearchRunner } from '../../research/workflow.js'
import { createDefaultAssistantAgent } from '../../support/assistant.js'
import { createCoreNodes } from './nodes.js'
import {
  interpretSchema,
  routeSchema,
  type InterpretDecision,
  type RouteDecision,
} from './schema.js'

const overwriteReducer = <T>(_prev: T, next: T) => next

export type DesignAssistantGraphDependencies = {
  interpretModel: StructuredModel<InterpretDecision>
  routerModel: StructuredModel<RouteDecision>
  assistantAgent: AssistantAgentLike
  runResearch: RunResearchFn
}

export type CreateDefaultGraphDependenciesOptions =
  Partial<DesignAssistantGraphDependencies> & {
    researchMode?: 'workflow' | 'agentic'
  }

export function createDefaultGraphDependencies(
  options: CreateDefaultGraphDependenciesOptions = {},
): DesignAssistantGraphDependencies {
  const {
    researchMode = process.env.RESEARCH_MODE === 'agentic' ? 'agentic' : 'workflow',
    ...overrides
  } = options

  return {
    interpretModel: createLLM({ temperature: 0 }).withStructuredOutput(interpretSchema),
    routerModel: createLLM({ temperature: 0 }).withStructuredOutput(routeSchema),
    assistantAgent: createDefaultAssistantAgent(),
    runResearch: createDefaultResearchRunner({ mode: researchMode }),
    ...overrides,
  }
}

export const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  searchEnabled: Annotation<boolean>({
    reducer: overwriteReducer<boolean>,
    default: () => true,
  }),
  originalUserQuestion: Annotation<string>({
    reducer: overwriteReducer<string>,
    default: () => '',
  }),
  globalClarifyCount: Annotation<number>({
    reducer: overwriteReducer<number>,
    default: () => 0,
  }),
  researchClarifications: Annotation<string[]>({
    reducer: overwriteReducer<string[]>,
    default: () => [],
  }),
})

export type GraphStreamInput = {
  messages: HumanMessage[]
  searchEnabled?: boolean
  originalUserQuestion?: string
  globalClarifyCount?: number
  researchClarifications?: string[]
}

type StreamPayload = {
  threadId: string
  searchEnabled?: boolean
  signal?: AbortSignal
}

type StreamRequest = StreamPayload & {
  userMessage: string
}

type ResumeRequest = StreamPayload & {
  resumeValue: unknown
}

type RuntimeOptions = {
  deps?: DesignAssistantGraphDependencies
  checkpointer?: BaseCheckpointSaver<number> | boolean
  recursionLimit?: number
  tokenUsageCollectorFactory?: () => TokenUsageCollector
}

export function createInitialGraphInput(userMessage: string, searchEnabled = true): GraphStreamInput {
  return {
    messages: [new HumanMessage(userMessage)],
    searchEnabled,
    originalUserQuestion: userMessage,
    globalClarifyCount: 0,
    researchClarifications: [],
  }
}

export function buildGraph(
  deps: DesignAssistantGraphDependencies = createDefaultGraphDependencies(),
) {
  const coreNodes = createCoreNodes(deps)

  return new StateGraph(GraphAnnotation)
    .addNode('interpret', coreNodes.interpretNode, { ends: ['router'] })
    .addNode('router', coreNodes.routerNode, { ends: ['assistant', 'research_init'] })
    .addNode('assistant', coreNodes.assistantNode, { ends: [END] })
    .addNode('research_init', coreNodes.researchNode, { ends: [END] })
    .addEdge(START, 'interpret')
}

export function compileGraph(options: RuntimeOptions = {}) {
  const deps = options.deps ?? createDefaultGraphDependencies()
  const graph = buildGraph(deps)
  return graph.compile({
    checkpointer: options.checkpointer ?? new MemorySaver(),
  })
}

export function createAgentRuntime(options: RuntimeOptions = {}) {
  const deps = options.deps ?? createDefaultGraphDependencies()
  const graph = compileGraph({
    deps,
    checkpointer: options.checkpointer,
  })

  async function* runGraphStream(input: GraphStreamInput | Command, payload: StreamPayload) {
    const tracer = await createTracer()
    const tokenUsageCollector = (options.tokenUsageCollectorFactory ?? (() => new TokenUsageCollector()))()
    const callbacks = tracer ? [tracer, tokenUsageCollector] : [tokenUsageCollector]

    const stream = await graph.stream(input as never, {
      configurable: { thread_id: payload.threadId },
      callbacks,
      signal: payload.signal,
      recursionLimit: options.recursionLimit ?? 80,
      streamMode: ['messages', 'custom', 'updates'] as const,
    })

    for await (const chunk of stream) {
      const [mode, data] = chunk as [string, any]

      switch (mode) {
        case 'messages': {
          const [msgChunk, metadata] = data
          if (msgChunk._getType() === 'ai' && msgChunk.content) {
            const node = metadata?.langgraph_node || 'assistant'
            if (node === 'interpret' || node === 'router' || node.startsWith('research_')) break
            yield {
              type: 'token' as const,
              content: String(msgChunk.content),
              node,
            }
          }
          break
        }
        case 'custom':
          yield { type: 'custom' as const, data }
          break
        case 'updates':
          if (data && '__interrupt__' in data) {
            for (const intr of data.__interrupt__) {
              yield { type: 'interrupt' as const, data: intr.value }
            }
            return
          }
          break
      }
    }

    yield {
      type: 'done' as const,
      tokenUsage: tokenUsageCollector.snapshot(),
    }
  }

  return {
    graph,
    async *streamGraph({ userMessage, threadId, searchEnabled = true, signal }: StreamRequest) {
      yield* runGraphStream(
        createInitialGraphInput(userMessage, searchEnabled),
        { threadId, searchEnabled, signal },
      )
    },
    async *resumeGraph({ resumeValue, threadId, searchEnabled = true, signal }: ResumeRequest) {
      yield* runGraphStream(
        new Command({ resume: resumeValue }),
        { threadId, searchEnabled, signal },
      )
    },
  }
}

let defaultRuntime: ReturnType<typeof createAgentRuntime> | null = null

function getDefaultRuntime() {
  if (!defaultRuntime) {
    defaultRuntime = createAgentRuntime()
  }
  return defaultRuntime
}

export async function* streamGraph(request: StreamRequest) {
  yield* getDefaultRuntime().streamGraph(request)
}

export async function* resumeGraph(request: ResumeRequest) {
  yield* getDefaultRuntime().resumeGraph(request)
}

export type DesignAssistantState = typeof GraphAnnotation.State
export type GraphTurnState = {
  messages: BaseMessage[]
  searchEnabled: boolean
  originalUserQuestion: string
  researchClarifications: string[]
  globalClarifyCount?: number
}
