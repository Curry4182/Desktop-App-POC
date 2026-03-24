# HITL Clarification 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3단계 보충 질문 체계 구현 — Classifier, Supervisor, Research Agent 각 단계에서 맥락에 맞는 보충 질문을 사용자에게 제시할 수 있도록 개선.

**Architecture:** `interrupt()`를 그래프 노드 레벨에서 호출하는 대신, Supervisor ReAct의 도구(`ask_user`)로 변환. Classifier의 fallback 버그 수정. `resumeGraph`의 하드코딩 제거.

**Tech Stack:** LangGraph.js interrupt/Command, Electron IPC, Vue 3

---

## 현재 문제 요약

| # | 문제 | 위치 |
|---|------|------|
| 1 | fallback interrupt에서 resume 값을 캡처하지 않음 | `supervisor.ts:114` |
| 2 | `resumeGraph`의 agentName이 `'pc_fix'`로 하드코딩 | `graph.ts:278` |
| 3 | Supervisor/Research 단계에서 보충 질문 불가 (Classifier에서만 가능) | 구조적 한계 |
| 4 | `interrupt()` 후 resume 시 research 노드의 응답 캡처가 불안정 | `graph.ts resumeGraph` |

## 파일 구조

### 수정 대상
- `agent/supervisor.ts` — fallback interrupt 버그 수정 + `ask_user` 도구 추가
- `agent/graph.ts` — `resumeGraph` agentName 동적 처리 + interrupt 후 research 응답 캡처
- `agent/agents/research-agent.ts` — research tool 내 clarification은 Supervisor에 위임 (변경 없음, 설계만)

---

## Task 1: Classifier fallback interrupt 버그 수정

**Files:**
- Modify: `agent/supervisor.ts:105-123`

- [ ] **Step 1: fallback interrupt에서 resume 값 캡처하도록 수정**

현재 코드 (버그):
```typescript
// Line 114: interrupt() 호출하지만 반환값을 캡처하지 않음
interrupt({
  type: 'clarify',
  question: '...',
  options: [...],
})
// → interrupt 후 함수가 그냥 계속 진행 → classifyRoute가 원래 route를 반환
```

수정:
```typescript
// Fallback: programmatic ambiguity detection if LLM didn't flag it
if (!parsed.clarify) {
  const ambiguousPronouns = /(?:그것|그거|저거|저것|그\s?음식|그\s?문제|그\s?사람|이것|이거)/.test(userMessage)
  const vaguePhrases = !hasHistory && /(?:어떻게|문제점|해결|알려줘|뭘까|뭐야)\s*[?？]?\s*$/.test(userMessage)
  const tooShort = !hasHistory && userMessage.replace(/[?？!！.\s]/g, '').length < 6

  if (ambiguousPronouns || (vaguePhrases && tooShort)) {
    const userChoice = interrupt({
      type: 'clarify' as const,
      question: ambiguousPronouns
        ? '어떤 대상에 대해 물어보시는 건가요?'
        : '조금 더 구체적으로 알려주시겠어요?',
      options: [
        { label: '직접 입력', value: '' },
      ],
    })
    // Resume: re-classify with user's clarification
    return classifyRoute(
      `${userMessage} (보충: ${userChoice})`,
      searchEnabled,
      hasHistory,
    )
  }
}
```

핵심: `interrupt()` 반환값을 `userChoice`에 저장 → 재귀 호출로 보충된 질문 재분류.

- [ ] **Step 2: 컴파일 확인**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

- [ ] **Step 3: 커밋**

```bash
git add agent/supervisor.ts
git commit -m "fix: capture resume value in fallback interrupt"
```

---

## Task 2: resumeGraph agentName 하드코딩 제거

**Files:**
- Modify: `agent/graph.ts:249-281`

- [ ] **Step 1: resumeGraph에서 그래프 상태의 agentName을 동적으로 읽도록 수정**

현재 코드 (버그):
```typescript
yield {
  type: 'done' as const,
  response: finalResponse,
  agentName: 'pc_fix' as AgentName,  // ← 하드코딩
  diagnosticResults: null,
}
```

수정:
```typescript
export async function* resumeGraph(
  threadId: string,
  resumeValue: unknown,
) {
  const app = getGraph()

  // Read current state to get agentName before resuming
  let agentName: AgentName = 'chat'
  try {
    const currentState = await app.getState({ configurable: { thread_id: threadId } })
    agentName = (currentState.values as any)?.agentName || 'chat'
  } catch { /* fallback to chat */ }

  const stream = app.streamEvents(
    new Command({ resume: resumeValue }),
    {
      configurable: { thread_id: threadId },
      version: 'v2',
    },
  )

  let finalResponse = ''
  let isResearch = agentName === 'research'

  for await (const event of stream) {
    // Capture research node response
    if (isResearch && event.event === 'on_chain_end' && event.name === 'research') {
      try {
        const response = event.data?.output?.response
        if (typeof response === 'string' && response) {
          finalResponse = response
          yield { type: 'token' as const, content: response }
        }
      } catch { /* ignore */ }
    }

    // Stream chat/pc_fix tokens
    if (!isResearch && event.event === 'on_chat_model_stream' && event.data?.chunk) {
      const content = event.data.chunk.content
      if (typeof content === 'string' && content) {
        finalResponse += content
        yield { type: 'token' as const, content }
      }
    }
  }

  // Check for further interrupts after resume
  try {
    const state = await app.getState({ configurable: { thread_id: threadId } })
    if (state.next && state.next.length > 0 && state.tasks) {
      for (const task of state.tasks) {
        if (task.interrupts && task.interrupts.length > 0) {
          for (const intr of task.interrupts) {
            yield { type: 'interrupt' as const, interruptData: intr.value }
          }
          return
        }
      }
    }
  } catch { /* no interrupt */ }

  yield {
    type: 'done' as const,
    response: finalResponse,
    agentName,
    diagnosticResults: null,
    sources: [],
    tokenUsage: {},
  }
}
```

- [ ] **Step 2: 컴파일 확인**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

- [ ] **Step 3: 커밋**

```bash
git add agent/graph.ts
git commit -m "fix: dynamic agentName in resumeGraph + interrupt re-check"
```

---

## Task 3: Supervisor에 `ask_user` 도구 추가

Supervisor ReAct 에이전트가 조사 중 사용자에게 보충 질문을 할 수 있는 도구.

**Files:**
- Create: `agent/tools/ask-user.ts`
- Modify: `agent/supervisor.ts`

- [ ] **Step 1: ask-user.ts 생성**

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { interrupt } from '@langchain/langgraph'

export const askUserTool = tool(
  async ({ question, options }) => {
    const parsedOptions = options.map((opt: string) => ({ label: opt, value: opt }))
    parsedOptions.push({ label: '직접 입력', value: '' })

    const userResponse = interrupt({
      type: 'clarify',
      question,
      options: parsedOptions,
    })

    return String(userResponse)
  },
  {
    name: 'ask_user',
    description: '사용자에게 보충 질문을 합니다. 조사 중 정보가 부족하거나 선택이 필요할 때 사용하세요. 예: 여러 후보 국가 중 선택, 모호한 조건 구체화.',
    schema: z.object({
      question: z.string().describe('사용자에게 물어볼 질문'),
      options: z.array(z.string()).describe('선택지 목록 (3~5개)'),
    }),
  }
)
```

- [ ] **Step 2: Supervisor ReAct 에이전트에 ask_user 도구 등록**

`agent/supervisor.ts`의 `createSupervisorReactAgent()`에 `askUserTool` 추가:

```typescript
import { askUserTool } from './tools/ask-user.js'

// Supervisor prompt에 추가:
// 3. ask_user: 조사 중 사용자에게 보충 질문이 필요할 때 사용

export function createSupervisorReactAgent() {
  const llm = createLLM({ temperature: 0.3 })
  return createReactAgent({
    llm,
    tools: [researchTool, generateAnswerTool, askUserTool],
    prompt: SUPERVISOR_REACT_PROMPT,
    name: 'supervisor_react',
  })
}
```

Supervisor ReAct 프롬프트의 도구 섹션 수정:

```
## 도구
1. research: 질문에 대한 자료를 검색합니다
2. generate_answer: 수집된 자료로 최종 답변을 생성합니다
3. ask_user: 조사 중 사용자에게 보충 질문이 필요할 때 사용합니다

## ask_user 사용 시점
- 조건 분해 후, 교집합이 여러 개일 때: "미국과 프랑스 중 어느 나라에 대해 알고 싶으신가요?"
- 검색 결과가 모호할 때: "CAD 관련 환경 문제 중 어떤 관점이 궁금하신가요?"
- 사용자 의도가 불분명할 때: "기술적 영향 vs 사회적 영향 중 어느 쪽?"

주의: 불필요한 보충 질문은 하지 마세요. 자료로 판단 가능하면 바로 진행.
```

- [ ] **Step 3: graph.ts의 streamMessage에서 research 노드의 interrupt도 처리**

`research` 노드 내부의 Supervisor ReAct가 `ask_user`로 `interrupt()`를 호출하면, 해당 interrupt가 외부 그래프까지 전파됩니다. 현재 `getState()` 체크 코드가 이미 이를 처리하므로 별도 수정 불필요.

다만, research 노드의 `agent.invoke()`를 `try/catch`로 감싸서 interrupt 전파를 명시적으로 처리:

`agent/graph.ts`의 `researchNode` 수정:

```typescript
async function researchNode(state: typeof SupervisorAnnotation.State) {
  const agent = createSupervisorReactAgent()
  // interrupt()가 내부에서 호출되면 GraphInterrupt가 전파됨
  // 이는 외부 그래프의 checkpointer에 의해 저장되고
  // getState()에서 감지됨
  const result = await agent.invoke(
    { messages: state.messages },
    { recursionLimit: MAX_ITERATIONS * 2 },
  )
  const lastMsg = result.messages[result.messages.length - 1]
  return { response: String(lastMsg.content) }
}
```

참고: `MAX_ITERATIONS`를 import해야 함 — 파일 상단에 추가.

- [ ] **Step 4: 컴파일 확인**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

- [ ] **Step 5: 커밋**

```bash
git add agent/tools/ask-user.ts agent/supervisor.ts agent/graph.ts
git commit -m "feat: add ask_user tool for Supervisor-level clarification"
```

---

## Task 4: electron/main.ts 타임아웃 정리 + resume 후 interrupt 재처리

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 타임아웃에 취소 토큰 추가**

현재 타임아웃은 60초 후 에러를 보내지만, 사용자가 이미 응답했을 수 있음. 취소 가능하도록 수정:

```typescript
// interrupt 이벤트 처리 부분 수정
case 'interrupt': {
  const data = (evt as any).interruptData
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const sendTimeout = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:stream:error', {
        message: '응답 시간이 초과되었습니다.',
        errorType: 'timeout',
      })
    }
  }

  if (data?.type === 'clarify') {
    win.webContents.send('agent:clarify', {
      id: Date.now().toString(),
      question: data.question,
      options: data.options || [],
    })
    timeoutId = setTimeout(sendTimeout, 60000)
    // Store timeout for cancellation
    ;(win as any).__hitlTimeout = timeoutId
  } else if (data?.type === 'confirm') {
    win.webContents.send('agent:confirm', {
      id: Date.now().toString(),
      action: data.action,
      description: data.description,
      scriptId: data.scriptId,
    })
    timeoutId = setTimeout(sendTimeout, 60000)
    ;(win as any).__hitlTimeout = timeoutId
  }
  break
}
```

HITL 응답 핸들러에서 타임아웃 취소:

```typescript
ipcMain.on('agent:confirm:response', (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  // Cancel timeout
  if ((win as any).__hitlTimeout) {
    clearTimeout((win as any).__hitlTimeout)
    ;(win as any).__hitlTimeout = null
  }
  resumeAndStream(win, response.confirmed)
})

ipcMain.on('agent:clarify:response', (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if ((win as any).__hitlTimeout) {
    clearTimeout((win as any).__hitlTimeout)
    ;(win as any).__hitlTimeout = null
  }
  const combined = [...(response.selected || []), response.freeText].filter(Boolean).join(', ')
  resumeAndStream(win, combined)
})
```

- [ ] **Step 2: resumeAndStream에서 interrupt 재처리 추가**

resume 후 또 다른 interrupt가 발생할 수 있음 (Supervisor가 연속으로 ask_user 호출):

```typescript
async function resumeAndStream(win: BrowserWindow, resumeValue: unknown) {
  if (!agentModule) return
  try {
    for await (const evt of agentModule.resumeGraph(
      (win as any).__lastThreadId,
      resumeValue,
    )) {
      if (win.isDestroyed()) break
      switch (evt.type) {
        case 'token':
          win.webContents.send('agent:stream:token', { content: evt.content })
          break
        case 'interrupt': {
          // Handle chained interrupts (ask_user called multiple times)
          const data = (evt as any).interruptData
          if (data?.type === 'clarify') {
            win.webContents.send('agent:clarify', {
              id: Date.now().toString(),
              question: data.question,
              options: data.options || [],
            })
            ;(win as any).__hitlTimeout = setTimeout(() => {
              if (!win.isDestroyed()) {
                win.webContents.send('agent:stream:error', {
                  message: '응답 시간이 초과되었습니다.',
                  errorType: 'timeout',
                })
              }
            }, 60000)
          } else if (data?.type === 'confirm') {
            win.webContents.send('agent:confirm', {
              id: Date.now().toString(),
              action: data.action,
              description: data.description,
              scriptId: data.scriptId,
            })
          }
          break
        }
        case 'done':
          win.webContents.send('agent:stream:done', {
            response: evt.response,
            agentName: (evt as any).agentName || 'chat',
            diagnosticResults: evt.diagnosticResults ?? null,
            sources: (evt as any).sources ?? [],
            tokenUsage: (evt as any).tokenUsage ?? {},
          })
          break
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!win.isDestroyed()) {
      win.webContents.send('agent:stream:error', { message: msg, errorType: 'unknown' })
    }
  }
}
```

- [ ] **Step 3: 컴파일 확인**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

- [ ] **Step 4: 커밋**

```bash
git add electron/main.ts
git commit -m "fix: timeout cleanup + chained interrupt support in resume"
```

---

## Task 5: 통합 테스트

- [ ] **Step 1: 컴파일 + 단위 테스트**

```bash
npx vue-tsc --noEmit -p tsconfig.json
npm test
```

- [ ] **Step 2: 앱 실행 후 시나리오 테스트**

```bash
npm run dev
```

테스트 시나리오:

| # | 입력 | 예상 동작 |
|---|------|----------|
| 1 | "배고파서 음식을 시킬려고 하는데 그 음식의 문제점이 뭘까?" | Classifier fallback → ClarificationCard |
| 2 | "CAD의 창시자가 태어난 국가의 환경 문제" | Supervisor → research 순차 호출 → 답변 |
| 3 | "반도체 산업이 발달한 국가 중 CAD 기술과 관련된 나라의 환경 문제" | Supervisor → 교집합 판단 → 여러 후보 시 ask_user → 답변 |
| 4 | "안녕하세요" | chat 라우팅 → 바로 답변 |

- [ ] **Step 3: 수정 사항 있으면 커밋**

```bash
git add -A
git commit -m "fix: resolve issues found during integration testing"
```
