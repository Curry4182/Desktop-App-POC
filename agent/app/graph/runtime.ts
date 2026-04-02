/**
 * Design Assistant 메인 그래프의 런타임 모듈.
 *
 * LangGraph StateGraph를 구성·컴파일하고,
 * Electron 프론트엔드와 연결되는 스트리밍 인터페이스를 제공한다.
 *
 * 그래프 흐름:
 *   START → interpret → router → assistant | research_init → END
 */
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { Annotation, Command, END, MemorySaver, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { createLLM } from '../../infra/llm.js'
import { createTracer } from '../../infra/telemetry.js'
import { TokenUsageCollector } from '../../infra/token-usage.js'
import { createDefaultResearchRunner } from '../../research/workflow.js'
import { createDefaultAssistantAgent } from '../../support/assistant.js'
import { createCoreNodes } from './nodes.js'
import { interpretSchema, routeSchema } from './schema.js'
import type {
  CreateDefaultGraphDependenciesOptions,
  DesignAssistantGraphDependencies,
  GraphStreamInput,
  ResumeRequest,
  RuntimeOptions,
  StreamPayload,
  StreamRequest,
} from './types.js'

export type {
  CreateDefaultGraphDependenciesOptions,
  DesignAssistantGraphDependencies,
  GraphTurnState,
} from './types.js'

// ─── 그래프 상태 & 빌드 ───

/** 상태 채널의 기본 reducer — 항상 최신 값으로 덮어쓴다 */
const overwriteReducer = <T>(_prev: T, next: T) => next

/**
 * 메인 그래프의 상태(State) 정의.
 *
 * 채널 설명:
 * - messages             : 대화 히스토리 (LangGraph MessagesAnnotation 기본 reducer 사용)
 * - searchEnabled        : 검색 기능 활성화 여부 (프론트엔드 토글)
 * - originalUserQuestion : interpret 노드가 재작성한 독립 요청문
 * - globalClarifyCount   : 한 턴에서 clarification 횟수 (최대 3회로 제한)
 * - researchClarifications : 사용자가 선택한 명확화 결과 목록
 */
const GraphAnnotation = Annotation.Root({
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

/**
 * 기본 의존성 인스턴스를 생성한다.
 */
export function createDefaultGraphDependencies(
  options: CreateDefaultGraphDependenciesOptions = {},
): DesignAssistantGraphDependencies {
  return {
    interpretModel: createLLM({ temperature: 0 }).withStructuredOutput(interpretSchema),
    routerModel: createLLM({ temperature: 0 }).withStructuredOutput(routeSchema),
    assistantAgent: createDefaultAssistantAgent(),
    runResearch: createDefaultResearchRunner(),
    ...options,
  }
}

function buildAndCompileGraph(options: RuntimeOptions = {}) {
  const deps = options.deps ?? createDefaultGraphDependencies()
  const coreNodes = createCoreNodes(deps)

  const graph = new StateGraph(GraphAnnotation)
    .addNode('interpret', coreNodes.interpretNode, { ends: ['router'] })
    .addNode('router', coreNodes.routerNode, { ends: ['assistant', 'research_init'] })
    .addNode('assistant', coreNodes.assistantNode, { ends: [END] })
    .addNode('research_init', coreNodes.researchNode, { ends: [END] })
    .addEdge(START, 'interpret')

  return graph.compile({
    checkpointer: options.checkpointer ?? new MemorySaver(),
  })
}

// ─── 스트림 이벤트 변환 ───

/** LangGraph 스트림 청크를 프론트엔드 이벤트로 변환하여 yield한다 */
async function* parseStreamChunks(stream: AsyncIterable<[string, any]>) {
  for await (const [mode, data] of stream) {
    switch (mode) {
      case 'messages': {
        const [msgChunk, metadata] = data
        if (!AIMessage.isInstance(msgChunk) || !msgChunk.content) break
        const node = metadata?.langgraph_node || 'assistant'
        // interpret/router/research 내부 노드의 토큰은 프론트엔드에 보내지 않는다
        if (node === 'interpret' || node === 'router' || node.startsWith('research_')) break
        yield { type: 'token' as const, content: String(msgChunk.content), node }
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
}

// ─── 런타임 ───

/**
 * 프론트엔드와 연결되는 에이전트 런타임을 생성한다.
 *
 * 반환 객체:
 * - streamGraph  : 새 사용자 메시지로 그래프를 실행하고 스트리밍 이벤트를 yield
 * - resumeGraph  : clarification 응답 후 그래프를 재개
 *
 * 스트리밍 이벤트 종류:
 * - token     : AI 응답 토큰 (assistant/research 노드만)
 * - custom    : 커스텀 이벤트 (research_step, search_start 등)
 * - interrupt : clarification 요청 (프론트엔드에서 UI 표시)
 * - done      : 턴 완료 + 토큰 사용량 스냅샷
 */
export function createAgentRuntime(options: RuntimeOptions = {}) {
  const graph = buildAndCompileGraph(options)

  async function* run(input: GraphStreamInput | Command, payload: StreamPayload) {
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

    yield* parseStreamChunks(stream as AsyncIterable<[string, any]>)
    yield { type: 'done' as const, tokenUsage: tokenUsageCollector.snapshot() }
  }

  return {
    graph,
    async *streamGraph({ userMessage, threadId, searchEnabled = true, signal }: StreamRequest) {
      const input: GraphStreamInput = {
        messages: [new HumanMessage(userMessage)],
        searchEnabled,
        originalUserQuestion: userMessage,
        globalClarifyCount: 0,
        researchClarifications: [],
      }
      yield* run(input, { threadId, searchEnabled, signal })
    },
    async *resumeGraph({ resumeValue, threadId, searchEnabled = true, signal }: ResumeRequest) {
      yield* run(new Command({ resume: resumeValue }), { threadId, searchEnabled, signal })
    },
  }
}

// ─── 편의 함수: 싱글턴 런타임으로 바로 사용 ───

let defaultRuntime: ReturnType<typeof createAgentRuntime> | null = null

function getDefaultRuntime() {
  if (!defaultRuntime) defaultRuntime = createAgentRuntime()
  return defaultRuntime
}

export async function* streamGraph(request: StreamRequest) {
  yield* getDefaultRuntime().streamGraph(request)
}

export async function* resumeGraph(request: ResumeRequest) {
  yield* getDefaultRuntime().resumeGraph(request)
}
