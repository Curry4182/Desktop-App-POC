/**
 * 메인 그래프의 핵심 노드 구현 모듈.
 *
 * 각 노드는 Command 객체를 반환하여 다음 노드로의 전이를 명시적으로 지정한다.
 * LangGraph의 conditional edge 대신 Command-based routing을 사용한다.
 */
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { Command, END, type LangGraphRunnableConfig } from '@langchain/langgraph'
import { requestClarification } from '../clarify.js'
import type {
  DesignAssistantGraphDependencies,
  GraphTurnState,
} from './types.js'

/** 메시지 배열에서 가장 마지막 사용자 메시지의 텍스트를 추출한다 */
function getLatestUserQuestion(messages: BaseMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (HumanMessage.isInstance(messages[i])) return String(messages[i].content)
  }
  return ''
}

/**
 * 턴 컨텍스트를 반영한 메시지 배열을 만든다.
 *
 * interpret 노드가 재작성한 질문(resolvedQuestion)과 clarification 결과를
 * 마지막 사용자 메시지에 주입하여, 후속 노드(assistant/research)가
 * 맥락이 보강된 요청을 받을 수 있도록 한다.
 */
function withTurnContext(
  messages: BaseMessage[],
  resolvedQuestion: string,
  clarifications: string[],
  limit: number,
) {
  const recentMessages = messages.slice(-limit)
  const normalizedResolved = resolvedQuestion.trim()
  if (!normalizedResolved) return recentMessages

  const clarificationSuffix = clarifications.length > 0
    ? `\n선택한 의미: ${clarifications.join(', ')}`
    : ''
  const turnContent = `${normalizedResolved}${clarificationSuffix}`.trim()

  // 마지막 human 메시지를 찾아 재작성된 내용으로 교체
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (!HumanMessage.isInstance(recentMessages[i])) continue

    const currentContent = String(recentMessages[i].content ?? '').trim()
    if (currentContent === turnContent) return recentMessages

    const nextMessages = [...recentMessages]
    nextMessages[i] = new HumanMessage(turnContent)
    return nextMessages
  }

  return recentMessages
}

/** config에 토큰 사용량 추적용 scope를 추가한다 */
function withUsageScope(config: LangGraphRunnableConfig | undefined, scope: string) {
  return {
    ...config,
    metadata: {
      ...config?.metadata,
      token_usage_scope: scope,
    },
  }
}

/**
 * 그래프 의존성을 받아 4개의 핵심 노드 함수를 생성한다.
 * 각 노드는 deps를 클로저로 캡처하여 LLM/에이전트에 접근한다.
 */
export function createCoreNodes(deps: DesignAssistantGraphDependencies) {
  /**
   * [interpret 노드]
   * 사용자의 마지막 발화를 대화 맥락을 반영한 독립 요청문으로 재작성한다.
   * 모호한 경우 LangGraph interrupt를 통해 clarification UI를 띄운다.
   * 한 턴에서 clarification은 최대 3회로 제한된다.
   */
  async function interpretNode(
    state: GraphTurnState,
    config?: LangGraphRunnableConfig,
  ) {
    const latestUserQuestion = state.originalUserQuestion || getLatestUserQuestion(state.messages)
    const decision = await deps.interpretModel.invoke([
      new SystemMessage(`당신은 최근 대화 맥락을 보고 사용자의 마지막 발화를 "이번 턴의 실제 요청"으로 해석하는 planner입니다.

목표:
- 마지막 사용자 발화를 같은 언어의 self-contained request 1문장으로 다시 씁니다.
- 이 요청은 router, assistant, research가 그대로 받아 처리할 수 있어야 합니다.
- 가능하면 최근 대화만으로 지시어/생략/동의 표현을 복원합니다.

규칙:
- 직전 assistant가 제안한 옵션에 대한 동의("ㅇㅇ", "응", "좋아", "그렇게 해줘")는 가능한 한 실제 실행 요청으로 복원하세요.
- "그거", "그 회사", "그 사람", "그중", "영향을 많이 끼친 사람" 같은 생략 표현은 최근 대화로 복원하세요.
- 없는 회사/인물/사건을 만들어내지 마세요.
- 질문의 범위를 넓히지 마세요.
- 사용자의 의도를 바꾸지 마세요.
- rewrittenQuestion는 항상 채우세요. 이미 독립적인 질문이면 원문을 그대로 넣으세요.
- clarification이 꼭 필요할 때만 needsClarification=true로 하세요.
- needsClarification=false면 question="" options=[]
- 같은 요청에서 이미 한 번 clarify했다면 다시 clarify하지 말고, 가장 합리적인 rewrittenQuestion으로 진행하세요.`),
      ...state.messages.slice(-8),
    ], withUsageScope(config, 'interpret'))

    const rewrittenQuestion = decision.rewrittenQuestion.trim()
    const nextQuestion = rewrittenQuestion || latestUserQuestion

    // NOTE: clarify 빈도를 줄이려면 프롬프트에 아래 규칙을 추가할 수 있음:
    //   "최근 대화만으로 합리적으로 추론 가능한 경우에는 clarify하지 마세요."
    if (!decision.needsClarification || state.globalClarifyCount >= 3) {
      return new Command({
        goto: 'router',
        update: {
          originalUserQuestion: nextQuestion,
        },
      })
    }

    const selected = requestClarification(
      decision.question || '의미를 선택해주세요.',
      decision.options,
    ).trim()

    const clarificationMessage = selected
      ? `질문 보충: ${nextQuestion}\n의미 선택: ${selected}`
      : `질문 보충: ${nextQuestion}`

    return new Command({
      goto: 'router',
      update: {
        originalUserQuestion: nextQuestion,
        globalClarifyCount: state.globalClarifyCount + 1,
        researchClarifications: [...state.researchClarifications, selected].filter(Boolean),
        messages: [new HumanMessage(clarificationMessage)],
      },
    })
  }

  /**
   * [router 노드]
   * 재작성된 요청을 분석해 assistant(일반 대화/PC진단) 또는
   * research_init(위키 기반 다단계 조사)로 라우팅한다.
   * 검색이 꺼진 상태에서 research로 라우팅되면 assistant로 폴백한다.
   */
  async function routerNode(
    state: GraphTurnState,
    config?: LangGraphRunnableConfig,
  ) {
    const recentMessages = withTurnContext(
      state.messages,
      state.originalUserQuestion,
      state.researchClarifications,
      10,
    )

    const route = await deps.routerModel.invoke([
      new SystemMessage(`사용자 요청을 다음 두 경로 중 하나로 라우팅하세요.

- assistant:
  - 일반 대화, 짧은 후속 질문, 설명 보강
  - PC 진단/스크립트 실행/시스템 도구 사용
  - 검색이 꺼진 상태에서 외부 사실 확인이 필요한 질문

- research_init:
  - 위키 기반 사실 확인이 필요한 질문
  - 여러 단계를 거쳐 사실을 연결해야 하는 조사형 질문
  - 출처 기반으로 답해야 하는 질문

특히 아래는 research_init으로 보냅니다.
- "A를 만든 사람의 출생 국가와 그 국가의 인구수"
- "어떤 인물/국가/기술을 순차적으로 찾아야 답이 나오는 질문"
- 최신성보다 백과사전식 배경지식 조사가 중요한 질문`),
      ...recentMessages,
    ], withUsageScope(config, 'router'))

    if (route.next === 'research_init' && !state.searchEnabled) {
      return new Command({ goto: 'assistant' })
    }

    return new Command({ goto: route.next })
  }

  /**
   * [assistant 노드]
   * ReAct 에이전트를 호출하여 일반 대화, 후속 설명, PC 진단/수리를 처리한다.
   * 진단 도구(systemInfo, networkCheck 등)와 스크립트 실행 도구를 사용할 수 있다.
   */
  async function assistantNode(
    state: GraphTurnState,
    config?: LangGraphRunnableConfig,
  ) {
    const assistantMessages = withTurnContext(
      state.messages,
      state.originalUserQuestion,
      state.researchClarifications,
      12,
    )

    const result = await deps.assistantAgent.invoke(
      { messages: assistantMessages },
      {
        ...withUsageScope(config, 'assistant'),
        context: { searchEnabled: state.searchEnabled },
      },
    )
    const lastMessage = result.messages[result.messages.length - 1]

    return new Command({
      goto: END,
      update: { messages: [lastMessage] },
    })
  }

  /**
   * [research_init 노드]
   * 위키 기반 자료조사를 실행한다.
   * ReAct 에이전트가 자율적으로 search_documents → get_document_summary →
   * get_document_content 도구를 호출하여 정보를 수집하고 최종 답변을 생성한다.
   */
  async function researchNode(
    state: GraphTurnState,
    config?: LangGraphRunnableConfig,
  ) {
    const turnMessages = withTurnContext(
      state.messages,
      state.originalUserQuestion,
      state.researchClarifications,
      12,
    )

    const result = await deps.runResearch(
      {
        messages: state.messages,
        turnMessages,
        searchEnabled: state.searchEnabled,
        originalUserQuestion: state.originalUserQuestion,
        researchClarifications: state.researchClarifications,
      },
      config,
    )

    if (!result.streamsAnswerTokens) {
      config?.writer?.({
        type: 'answer_token',
        content: result.answer,
        node: 'research',
      })
    }

    return new Command({
      goto: END,
      update: { messages: [new AIMessage(result.answer)] },
    })
  }

  return {
    interpretNode,
    routerNode,
    assistantNode,
    researchNode,
  }
}
