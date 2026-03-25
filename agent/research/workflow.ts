import { AIMessageChunk, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { entrypoint, getConfig, getWriter, task } from '@langchain/langgraph'
import { createLLM } from '../infra/llm.js'
import type {
  ResearchInput,
  ResearchResult,
  ResearchSearchFn,
  RunResearchFn,
  StreamingModel,
  StructuredModel,
} from '../infra/runtime-types.js'
import { createDefaultResearchAgent } from './agent.js'
import {
  distillSchema,
  MAX_RESEARCH_STEPS,
  nextStepSchema,
  reviewSchema,
  type ResearchDistillDecision,
  type ResearchPlannerDecision,
  type ResearchReviewDecision,
} from './schema.js'
import { performResearchSearch } from './wiki.js'

export type ResearchFact = {
  label: string
  value: string
  sourceTitle?: string
}

export type ResearchStepTrace = {
  question: string
  query: string
  summary: string
  newFactCount?: number
}

type ResearchPlanningState = {
  originalUserQuestion: string
  researchClarifications: string[]
  researchFacts: ResearchFact[]
  researchSteps: ResearchStepTrace[]
  researchIteration: number
  currentResearchQuestion: string
  currentSearchQuery: string
  currentSearchDepth: 'normal' | 'deep'
  latestResearchFindings: string
  latestResearchSources: unknown[]
}

export type ResearchWorkflowDependencies = {
  planner: StructuredModel<ResearchPlannerDecision>
  distiller: StructuredModel<ResearchDistillDecision>
  reviewer: StructuredModel<ResearchReviewDecision>
  answerModel: StreamingModel
  search: ResearchSearchFn
}

export type ResearchWorkflowInput = {
  messages: BaseMessage[]
  originalUserQuestion: string
  searchEnabled: boolean
  researchClarifications: string[]
}

export type ResearchWorkflowResult = {
  answer: string
  facts: ResearchFact[]
  steps: ResearchStepTrace[]
}

type ResearchLoopState = {
  facts: ResearchFact[]
  steps: ResearchStepTrace[]
  iteration: number
}

type SearchPlan = {
  researchQuestion: string
  query: string
  depth: 'normal' | 'deep'
}

type SearchOutput = Awaited<ReturnType<ResearchWorkflowDependencies['search']>>

export function createDefaultResearchWorkflowDependencies(): ResearchWorkflowDependencies {
  return {
    planner: createLLM({ temperature: 0 }).withStructuredOutput(nextStepSchema),
    distiller: createLLM({ temperature: 0 }).withStructuredOutput(distillSchema),
    reviewer: createLLM({ temperature: 0 }).withStructuredOutput(reviewSchema),
    answerModel: createLLM({ temperature: 0.2, maxTokens: 1400 }),
    search: performResearchSearch,
  }
}

function formatFacts(facts: ResearchFact[]) {
  if (facts.length === 0) return '- none'
  return facts.map((fact) => {
    const sourcePart = fact.sourceTitle ? ` [source: ${fact.sourceTitle}]` : ''
    return `- ${fact.label}: ${fact.value}${sourcePart}`
  }).join('\n')
}

function formatSteps(steps: ResearchStepTrace[]) {
  if (steps.length === 0) return '- none'
  return steps.map((step, index) => (
    `${index + 1}. question=${step.question}\nquery=${step.query}\nnewFacts=${step.newFactCount ?? 0}\nsummary=${step.summary}`
  )).join('\n\n')
}

function formatClarifications(clarifications: string[]) {
  if (clarifications.length === 0) return '- none'
  return clarifications.map((value, index) => `${index + 1}. ${value}`).join('\n')
}

function formatRecentConversation(messages: BaseMessage[], limit = 8) {
  const recent = messages.slice(-limit)
  if (recent.length === 0) return '- none'

  return recent.map((message) => {
    const role = message._getType()
    const label = role === 'human' ? 'user' : role === 'ai' ? 'assistant' : role
    const content = String(message.content ?? '').replace(/\s+/g, ' ').trim()
    return `${label}: ${content}`
  }).join('\n')
}

function mergeFacts(existing: ResearchFact[], nextFacts: ResearchFact[]) {
  const merged = [...existing]
  for (const nextFact of nextFacts) {
    const duplicate = merged.find((fact) => fact.label === nextFact.label && fact.value === nextFact.value)
    if (!duplicate) merged.push(nextFact)
  }
  return merged
}

function normalizeForCompare(value: string) {
  return value.trim().toLowerCase()
}

function stripParenthetical(value: string) {
  return value.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
}

function buildAcronymMap(values: string[]) {
  const entries = new Map<string, string>()

  for (const rawValue of values) {
    const base = stripParenthetical(rawValue)
    const words = base
      .split(/[\s-]+/)
      .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
      .filter(Boolean)

    if (words.length < 2 || words.length > 6) continue
    if (!words.every((word) => /[A-Za-z]/.test(word))) continue

    const acronym = words.map((word) => word[0]?.toUpperCase() ?? '').join('')
    if (acronym.length < 2 || acronym.length > 8) continue
    entries.set(acronym, base)
  }

  return entries
}

function normalizeSearchQuery(query: string, state: ResearchPlanningState) {
  let normalized = query.trim()
  if (!normalized) return normalized

  const acronymMap = buildAcronymMap([
    state.originalUserQuestion,
    ...state.researchClarifications,
  ])

  for (const [acronym, expansion] of acronymMap.entries()) {
    const pattern = new RegExp(`\\b${acronym}\\b`, 'g')
    if (!pattern.test(normalized)) continue
    if (normalized.toLowerCase().includes(expansion.toLowerCase())) continue
    normalized = normalized.replace(pattern, `"${expansion}"`)
  }

  return normalized.trim()
}

function toKeywordSearchQuery(query: string) {
  const cleaned = query
    .replace(/[?.,!]/g, ' ')
    .replace(/\b(who|what|when|where|why|how|which|is|are|was|were|does|did|the|a|an|user|want|information|about)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''

  return cleaned
    .split(' ')
    .filter((token) => token.length > 1)
    .slice(0, 4)
    .join(' ')
}

function countFailedAttempts(steps: ResearchStepTrace[], query: string) {
  const target = normalizeForCompare(query)
  return steps.filter((step) =>
    normalizeForCompare(step.query) === target && (step.newFactCount ?? 0) === 0).length
}

function diversifyQuery(question: string, query: string) {
  const normalizedQuery = query.trim()
  const asksForPeople = /(인물|사람|누가|창시|개척|inventor|invented|pioneer|founder|creator|person|people|who)/i.test(question)
  const queryLower = normalizedQuery.toLowerCase()

  if (asksForPeople && !queryLower.includes('history')) return `${normalizedQuery} history`
  if (asksForPeople && !queryLower.includes('inventor')) return `${normalizedQuery} inventor`
  if (!queryLower.includes('history')) return `${normalizedQuery} history`
  return normalizedQuery
}

function withUsageScope(config: ReturnType<typeof getConfig>, scope: string) {
  return {
    callbacks: config?.callbacks,
    tags: config?.tags,
    metadata: {
      ...(config?.metadata ?? {}),
      token_usage_scope: scope,
    },
  }
}

function writeResearchStep(step: string) {
  getWriter(getConfig())?.({
    type: 'research_step',
    step,
  })
}

export function createResearchWorkflow(deps: ResearchWorkflowDependencies) {
  const planResearchStep = task('research_plan', async (
    input: ResearchWorkflowInput,
    loopState: ResearchLoopState,
  ): Promise<SearchPlan | null> => {
    if (loopState.iteration >= MAX_RESEARCH_STEPS) {
      return null
    }

    const decision = await deps.planner.invoke([
      new SystemMessage(`당신은 위키 기반 자료조사 워크플로우의 플래너입니다.

목표:
- 사용자 질문을 답하기 위해 필요한 최소한의 사실만 찾습니다.
- 이미 확인한 facts와 completed steps를 다시 읽는 비용을 줄이기 위해, 다음에 필요한 가장 작은 질문 1개만 정합니다.
- 검색어는 구글처럼 영어 키워드 위주 1~4단어로 작성합니다.
- 충분한 facts가 모였으면 action="answer"를 반환합니다.
- 아직 정보가 부족하면 action="search"를 반환합니다.

중요:
- 이 노드는 자료조사만 담당합니다. 사용자에게 되묻지 마세요.
- 최근 대화 문맥을 보고 "그거", "그 회사", "그 사람", "영향을 많이 끼친 사람" 같은 생략 표현의 대상을 스스로 복원하세요.
- 질문과 직접 관련 없는 후보/주변 정보를 계속 넓히지 마세요.
- 다음 단계는 이전 facts와 clarifications를 바탕으로 좁혀진 질문이어야 합니다.
- completed steps에서 같은 query가 \`newFacts=0\`으로 반복되었다면, 같은 query를 다시 쓰지 마세요.
- acronym이 모호성 해소로 풀렸다면 검색어에는 acronym 대신 풀어쓴 표현을 우선 사용하세요.
- 인물/창시자 질문인데 이름이 안 나오면 \`history\`, \`origin\`, 대표 시스템/프로젝트 같은 다른 각도로 바꾸세요.
- searchQuery는 이름/용어/프로젝트명 중심의 keyword phrase여야 하며, 문장형 질문을 쓰지 마세요.
- "Which person does the user want..." 같은 메타 질문을 searchQuery로 만들지 마세요.
- action="answer"일 때는 searchQuery=""로 두세요.`),
      new HumanMessage([
        `Recent conversation:\n${formatRecentConversation(input.messages)}`,
        '',
        `Original question:\n${input.originalUserQuestion}`,
        '',
        `Known facts:\n${formatFacts(loopState.facts)}`,
        '',
        `User clarifications:\n${formatClarifications(input.researchClarifications)}`,
        '',
        `Completed steps:\n${formatSteps(loopState.steps)}`,
      ].join('\n')),
    ], withUsageScope(getConfig(), 'research_plan'))

    if (decision.action === 'answer') return null

    const normalizedQuery = normalizeSearchQuery(decision.searchQuery, {
      originalUserQuestion: input.originalUserQuestion,
      researchClarifications: input.researchClarifications,
      researchFacts: loopState.facts,
      researchSteps: loopState.steps,
      researchIteration: loopState.iteration,
      currentResearchQuestion: '',
      currentSearchQuery: '',
      currentSearchDepth: 'normal',
      latestResearchFindings: '',
      latestResearchSources: [],
    })
    const keywordQuery = toKeywordSearchQuery(normalizedQuery) || toKeywordSearchQuery(decision.researchQuestion)
    const queryBase = keywordQuery || normalizedQuery
    const failedAttempts = countFailedAttempts(loopState.steps, queryBase)
    const nextQuery = failedAttempts >= 2 ? diversifyQuery(decision.researchQuestion, queryBase) : queryBase

    if (failedAttempts >= 2 && nextQuery !== queryBase) {
      writeResearchStep(`재탐색: 같은 검색어 실패가 반복되어 "${nextQuery}"로 전환합니다.`)
    }

    return {
      researchQuestion: decision.researchQuestion,
      query: nextQuery,
      depth: decision.depth,
    }
  })

  const searchResearch = task('research_search', async (
    input: ResearchWorkflowInput,
    plan: SearchPlan,
  ): Promise<SearchOutput> => {
    writeResearchStep(`질문: ${plan.researchQuestion}`)
    writeResearchStep(`검색어: ${plan.query}`)

    return deps.search({
      query: plan.query,
      depth: plan.depth,
      searchEnabled: input.searchEnabled,
      writer: getWriter(getConfig()),
    })
  })

  const distillResearch = task('research_distill', async (
    input: ResearchWorkflowInput,
    loopState: ResearchLoopState,
    plan: SearchPlan,
    searchResult: SearchOutput,
  ) => {
    const distilled = await deps.distiller.invoke([
      new SystemMessage(`당신은 위키 검색 결과를 정제하는 분석기입니다.

규칙:
- 현재 sub-question과 원래 사용자 질문에 직접 필요한 사실만 남기세요.
- 관련 없는 후보 인물, 주변 정보, 반복 설명은 버리세요.
- sourceTitle은 가능하면 검색 결과의 문서 제목 중 하나를 사용하세요.
- enoughToAnswer는 "이 단계 하나로 충분"이 아니라, 현재까지 누적 facts와 clarifications가 원질문 답변에 충분한지 기준으로 판단하세요.`),
      new HumanMessage([
        `Recent conversation:\n${formatRecentConversation(input.messages)}`,
        '',
        `Original question:\n${input.originalUserQuestion}`,
        '',
        `Current sub-question:\n${plan.researchQuestion}`,
        '',
        `User clarifications:\n${formatClarifications(input.researchClarifications)}`,
        '',
        `Known facts so far:\n${formatFacts(loopState.facts)}`,
        '',
        `Search findings:\n${searchResult.findings}`,
      ].join('\n')),
    ], withUsageScope(getConfig(), 'research_distill'))

    const normalizedFacts = distilled.newFacts.map((fact) => ({
      ...fact,
      sourceTitle: fact.sourceTitle.trim() || searchResult.sources[0]?.title,
    }))

    const nextSteps = [
      ...loopState.steps,
      {
        question: plan.researchQuestion,
        query: plan.query,
        summary: distilled.stepSummary,
        newFactCount: normalizedFacts.length,
      },
    ]
    const nextFacts = mergeFacts(loopState.facts, normalizedFacts)

    writeResearchStep(`정리: ${distilled.stepSummary}`)

    return {
      enoughToAnswer: distilled.enoughToAnswer,
      nextState: {
        facts: nextFacts,
        steps: nextSteps,
        iteration: loopState.iteration + 1,
      },
    }
  })

  const reviewResearch = task('research_review', async (
    input: ResearchWorkflowInput,
    loopState: ResearchLoopState,
  ): Promise<SearchPlan | null> => {
    const review = await deps.reviewer.invoke([
      new SystemMessage(`당신은 자료조사 completeness reviewer입니다.

목표:
- 현재 facts/steps만으로 원질문에 충분히 답했는지 평가합니다.
- 특히 "역사", "발전 과정", "고대부터 현대까지", "전체 흐름", "시대별 정리" 같은 질문은 중요한 구간이 빠지지 않았는지 coverage를 엄격하게 봅니다.
- 덜 중요한 세부사항보다, 빠진 큰 단계/시대/축이 있는지를 먼저 확인하세요.

규칙:
- 충분하면 isComplete=true, missingAspect="", researchQuestion="", searchQuery="".
- 부족하면 가장 중요한 누락 1개만 고르고, 그 누락을 메우는 다음 질문/검색어를 제안하세요.
- searchQuery는 영어 1~3단어 위주로 짧게 작성하세요.
- completed steps에서 같은 query가 \`newFacts=0\`으로 반복되었다면, 그 query를 다시 제안하지 마세요.`),
      new HumanMessage([
        `Recent conversation:\n${formatRecentConversation(input.messages)}`,
        '',
        `Original question:\n${input.originalUserQuestion}`,
        '',
        `User clarifications:\n${formatClarifications(input.researchClarifications)}`,
        '',
        `Facts:\n${formatFacts(loopState.facts)}`,
        '',
        `Completed research steps:\n${formatSteps(loopState.steps)}`,
      ].join('\n')),
    ], withUsageScope(getConfig(), 'research_review'))

    writeResearchStep(`검토: ${review.reason}`)

    if (review.isComplete || loopState.iteration >= MAX_RESEARCH_STEPS) return null

    const query = review.searchQuery.trim()
    if (!query) return null

    writeResearchStep(`보완 필요: ${review.missingAspect}`)

    return {
      researchQuestion: review.researchQuestion.trim() || review.missingAspect,
      query,
      depth: review.depth,
    }
  })

  const answerResearch = task('research_answer', async (
    input: ResearchWorkflowInput,
    loopState: ResearchLoopState,
  ): Promise<string> => {
    const answerMessages = [
      new SystemMessage(`당신은 자료조사 결과를 정리해 최종 답변을 쓰는 에이전트입니다.

규칙:
- facts에 있는 내용만 사용하세요.
- 사실 문장에는 가능하면 [출처: 문서제목] 형식으로 출처를 붙이세요.
- clarifications가 있으면 그 의미를 기준으로 답변하세요.
- facts만으로 확정할 수 없는 내용은 모른다고 말하세요.
- 사용자와 같은 언어로 답변하세요.
- completed steps나 검색어 자체를 장황하게 반복하지 말고, 최종 답변에 필요한 내용만 전달하세요.`),
      new HumanMessage([
        `Recent conversation:\n${formatRecentConversation(input.messages)}`,
        '',
        `Original question:\n${input.originalUserQuestion}`,
        '',
        `User clarifications:\n${formatClarifications(input.researchClarifications)}`,
        '',
        `Facts:\n${formatFacts(loopState.facts)}`,
        '',
        `Completed research steps:\n${formatSteps(loopState.steps)}`,
      ].join('\n')),
    ]

    let fullContent = ''
    const answerStream = await deps.answerModel.stream(
      answerMessages,
      withUsageScope(getConfig(), 'research_answer'),
    )

    const writer = getWriter(getConfig())
    for await (const chunk of answerStream) {
      const text = String((chunk as AIMessageChunk).content ?? '')
      if (!text) continue
      fullContent += text
      writer?.({ type: 'answer_token', content: text, node: 'research' })
    }

    return fullContent
  })

  return entrypoint('research_workflow', async (input: ResearchWorkflowInput) => {
    let loopState: ResearchLoopState = {
      facts: [],
      steps: [],
      iteration: 0,
    }

    while (loopState.iteration < MAX_RESEARCH_STEPS) {
      const plannedSearch = await planResearchStep(input, loopState)
      if (!plannedSearch) break

      const searchResult = await searchResearch(input, plannedSearch)
      const distilled = await distillResearch(input, loopState, plannedSearch, searchResult)
      loopState = distilled.nextState

      if (distilled.enoughToAnswer) break

      const reviewedSearch = await reviewResearch(input, loopState)
      if (!reviewedSearch) break

      const reviewSearchResult = await searchResearch(input, reviewedSearch)
      const reviewedDistilled = await distillResearch(input, loopState, reviewedSearch, reviewSearchResult)
      loopState = reviewedDistilled.nextState

      if (reviewedDistilled.enoughToAnswer) break
    }

    const answer = await answerResearch(input, loopState)
    return {
      answer,
      facts: loopState.facts,
      steps: loopState.steps,
    } satisfies ResearchWorkflowResult
  })
}

export function createDefaultResearchRunner(
  options: {
    mode?: 'workflow' | 'agentic'
    workflow?: ResearchWorkflowDependencies
  } = {},
): RunResearchFn {
  const mode = options.mode ?? 'workflow'

  if (mode === 'agentic') {
    const agent = createDefaultResearchAgent()
    return async function runAgenticResearch(
      input: ResearchInput,
      config,
    ): Promise<ResearchResult> {
      const result = await agent.invoke(
        { messages: input.turnMessages },
        {
          ...config,
          context: { searchEnabled: input.searchEnabled },
          metadata: {
            ...(config?.metadata ?? {}),
            token_usage_scope: 'research_agentic',
          },
        },
      )

      const lastMessage = result.messages[result.messages.length - 1]
      return {
        answer: String(lastMessage?.content ?? '').trim(),
        streamsAnswerTokens: false,
      }
    }
  }

  const workflow = createResearchWorkflow(
    options.workflow ?? createDefaultResearchWorkflowDependencies(),
  )

  return async function runWorkflowResearch(
    input: ResearchInput,
    config,
  ): Promise<ResearchResult> {
    const result = await workflow.invoke({
      messages: input.messages,
      searchEnabled: input.searchEnabled,
      originalUserQuestion: input.originalUserQuestion,
      researchClarifications: input.researchClarifications,
    }, config)

    return {
      answer: result.answer,
      streamsAnswerTokens: true,
    }
  }
}
