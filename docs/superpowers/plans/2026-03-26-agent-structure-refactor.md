# Agent 디렉토리 구조 리팩토링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `agent/` 하위 구조를 LangGraph.js 관례에 맞게 재구성하여 가독성을 높인다. 기능 변경 없이 파일 이동과 분리만 수행.

**Architecture:** 현재 `app/graph/`, `support/`, `infra/`, `shared/types/` 4개 디렉토리를 `state.ts`, `graph.ts`, `nodes/`, `tools/`, `prompts/`, `schemas/`, `lib/`, `types.ts`로 재배치. LangGraph.js 커뮤니티의 `state → graph → nodes → tools` 관례를 따른다.

**Tech Stack:** TypeScript, LangGraph.js, LangChain, Electron, Vue 3

**Spec:** `docs/superpowers/specs/2026-03-26-agent-structure-refactor-design.md`

---

### Task 1: `infra/` → `lib/` 이름 변경

가장 단순한 변경. 디렉토리 이름만 바꾸고 내부 import를 업데이트.

**Files:**
- Rename: `agent/infra/llm.ts` → `agent/lib/llm.ts`
- Rename: `agent/infra/runtime-types.ts` → `agent/lib/runtime-types.ts`
- Rename: `agent/infra/telemetry.ts` → `agent/lib/telemetry.ts`
- Rename: `agent/infra/token-usage.ts` → `agent/lib/token-usage.ts`
- Modify: `agent/app/graph/runtime.ts` (import 경로)
- Modify: `agent/support/assistant.ts` (import 경로)
- Modify: `agent/research/workflow.ts` (import 경로)
- Modify: `agent/research/agent.ts` (import 경로)
- Modify: `evals/langfuse/cad-catia/types.ts` (import 경로)
- Delete: `agent/infra/llm/` (빈 디렉토리)
- Delete: `agent/infra/telemetry/` (빈 디렉토리)
- Delete: `agent/infra/` (빈 디렉토리)

- [ ] **Step 1: 새 디렉토리 생성 및 파일 이동**

```bash
mkdir -p agent/lib
mv agent/infra/llm.ts agent/lib/llm.ts
mv agent/infra/runtime-types.ts agent/lib/runtime-types.ts
mv agent/infra/telemetry.ts agent/lib/telemetry.ts
mv agent/infra/token-usage.ts agent/lib/token-usage.ts
```

- [ ] **Step 2: `agent/app/graph/runtime.ts`의 import 경로 변경**

변경할 import:
```typescript
// Before:
import { createLLM } from '../../infra/llm.js'
import type { ... } from '../../infra/runtime-types.js'
import { createTracer } from '../../infra/telemetry.js'
import { TokenUsageCollector } from '../../infra/token-usage.js'

// After:
import { createLLM } from '../../lib/llm.js'
import type { ... } from '../../lib/runtime-types.js'
import { createTracer } from '../../lib/telemetry.js'
import { TokenUsageCollector } from '../../lib/token-usage.js'
```

- [ ] **Step 3: `agent/support/assistant.ts`의 import 경로 변경**

```typescript
// Before:
import { createLLM } from '../infra/llm.js'
import type { AssistantAgentLike } from '../infra/runtime-types.js'

// After:
import { createLLM } from '../lib/llm.js'
import type { AssistantAgentLike } from '../lib/runtime-types.js'
```

- [ ] **Step 4: `agent/research/workflow.ts`와 `agent/research/agent.ts`의 import 경로 변경**

`workflow.ts`와 `agent.ts`에서 `../infra/` → `../lib/`로 변경. 파일을 읽어서 정확한 import 라인 확인 후 변경.

- [ ] **Step 5: `evals/langfuse/cad-catia/types.ts`의 import 경로 변경**

```typescript
// Before:
import type { TokenUsageByNode } from '../../../agent/infra/token-usage.js'

// After:
import type { TokenUsageByNode } from '../../../agent/lib/token-usage.js'
```

- [ ] **Step 6: `lib/runtime-types.ts`의 내부 import 확인**

```typescript
// runtime-types.ts line 3:
// Before:
import type { ResearchSearchResult } from '../research/wiki.js'
// → 이 시점에서는 wiki.ts가 아직 research/에 있으므로 변경 불필요
```

- [ ] **Step 7: 빈 디렉토리 삭제**

```bash
rm -rf agent/infra
```

- [ ] **Step 8: TypeScript 컴파일 확인**

```bash
cd /Users/gangbyeong-gon/Source/design-assistant && npx tsc --noEmit
```
Expected: 에러 없이 통과

- [ ] **Step 9: 커밋**

```bash
git add agent/lib/ agent/app/graph/runtime.ts agent/support/assistant.ts agent/research/ evals/langfuse/cad-catia/types.ts
git add -u agent/infra/
git commit -m "refactor: rename agent/infra/ to agent/lib/"
```

---

### Task 2: `shared/types/` → `types.ts` 통합

4개 타입 파일을 하나로 합침.

**Files:**
- Create: `agent/types.ts`
- Delete: `agent/shared/types/llm.ts`
- Delete: `agent/shared/types/system.ts`
- Delete: `agent/shared/types/research.ts`
- Delete: `agent/shared/types/scripts.ts`
- Modify: `agent/support/diagnostics.ts` (import: `../shared/types/system.js` → `../types.js`)
- Modify: `agent/support/scripts.ts` (import: `../shared/types/scripts.js` → `../types.js`)
- Modify: `agent/research/wiki.ts` (import: `../shared/types/research.js` → `../types.js`)
- Modify: `shared/chat-protocol.ts` (외부 consumer)

- [ ] **Step 1: 기존 타입 파일 내용 확인**

4개 파일 전부 읽어서 내용 파악. 이미 파악된 내용:
- `llm.ts`: `LLMOptions` 타입
- `system.ts`: OS/CPU/Memory/GPU/Disk/InstalledProgram/Diagnostic 타입들
- `research.ts`: `ResearchSource` 타입
- `scripts.ts`: `ScriptEntry`, `ScriptRegistry` 타입

- [ ] **Step 2: `agent/types.ts` 생성**

4개 파일의 정확한 내용을 하나로 합침. **원본의 `interface`/`type` 키워드를 그대로 보존**. 섹션 주석으로 구분:

```typescript
// === LLM ===
// shared/types/llm.ts 내용을 그대로 복사 (interface 키워드 보존)

// === System Diagnostics ===
// shared/types/system.ts 내용을 그대로 복사

// === Research ===
// shared/types/research.ts 내용을 그대로 복사

// === Scripts ===
// shared/types/scripts.ts 내용을 그대로 복사
```

- [ ] **Step 3: 내부 import 경로 업데이트**

3개 파일의 import를 구체적으로 변경:

```typescript
// agent/support/diagnostics.ts
// Before: import type { ... } from '../shared/types/system.js'
// After:  import type { ... } from '../types.js'

// agent/support/scripts.ts
// Before: import type { ... } from '../shared/types/scripts.js'
// After:  import type { ... } from '../types.js'

// agent/research/wiki.ts
// Before: import type { ... } from '../shared/types/research.js'
// After:  import type { ... } from '../types.js'
```

- [ ] **Step 4: 외부 consumer 업데이트**

```typescript
// shared/chat-protocol.ts
// Before:
import type { ResearchSource } from '../agent/shared/types/research.js'
// After:
import type { ResearchSource } from '../agent/types.js'
```

- [ ] **Step 5: 기존 파일 삭제**

```bash
rm -rf agent/shared/
```

- [ ] **Step 6: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: 커밋**

```bash
git add agent/types.ts shared/chat-protocol.ts
git add -u agent/shared/
git commit -m "refactor: consolidate agent/shared/types/ into agent/types.ts"
```

---

### Task 3: Tool 파일 이동 (`support/`, `research/wiki.ts` → `tools/`)

**Files:**
- Move: `agent/support/diagnostics.ts` → `agent/tools/diagnostics.ts`
- Move: `agent/support/scripts.ts` → `agent/tools/scripts.ts`
- Move: `agent/research/wiki.ts` → `agent/tools/wiki.ts`
- Modify: `agent/support/assistant.ts` (import 경로)
- Modify: `agent/research/workflow.ts` (import 경로: `./wiki` → `../tools/wiki`)
- Modify: `agent/research/agent.ts` (import 경로: `./wiki` → `../tools/wiki`)
- Modify: `agent/lib/runtime-types.ts` (import 경로: `../research/wiki` → `../tools/wiki`)
- Modify: `electron/main.ts` (import 경로: `../agent/support/scripts` → `../agent/tools/scripts`)
- Modify: `tests/agent-core.test.ts` (import 경로)

- [ ] **Step 1: 디렉토리 생성 및 파일 이동**

```bash
mkdir -p agent/tools
mv agent/support/diagnostics.ts agent/tools/diagnostics.ts
mv agent/support/scripts.ts agent/tools/scripts.ts
mv agent/research/wiki.ts agent/tools/wiki.ts
```

- [ ] **Step 2: `agent/support/assistant.ts`의 import 경로 변경**

```typescript
// Before:
import { fullDiagnosticTool, installedProgramsTool, networkCheckTool, systemInfoTool } from './diagnostics.js'
import { formatScriptMetadata, listScriptsTool, scriptRunnerTool } from './scripts.js'

// After:
import { fullDiagnosticTool, installedProgramsTool, networkCheckTool, systemInfoTool } from '../tools/diagnostics.js'
import { formatScriptMetadata, listScriptsTool, scriptRunnerTool } from '../tools/scripts.js'
```

- [ ] **Step 3: `agent/research/workflow.ts`의 import 경로 변경**

파일을 읽어서 `./wiki` import를 찾아 변경:
```typescript
// Before: import { ... } from './wiki.js'
// After:  import { ... } from '../tools/wiki.js'
```

- [ ] **Step 4: `agent/research/agent.ts`의 import 경로 변경**

```typescript
// Before: import { ... } from './wiki.js'
// After:  import { ... } from '../tools/wiki.js'
```

- [ ] **Step 5: `agent/lib/runtime-types.ts`의 import 경로 변경**

```typescript
// Before: import type { ResearchSearchResult } from '../research/wiki.js'
// After:  import type { ResearchSearchResult } from '../tools/wiki.js'
```

- [ ] **Step 6: `electron/main.ts`의 import 경로 변경**

```typescript
// Before: import { getScriptById } from '../agent/support/scripts.js'
// After:  import { getScriptById } from '../agent/tools/scripts.js'
```

- [ ] **Step 7: `tests/agent-core.test.ts`의 import 경로 변경**

```typescript
// Before:
import { performResearchSearch, type DataSource, WikipediaDataSource } from '../agent/research/wiki.js'
import { listAvailableScripts, listScriptsTool, scriptRunnerTool } from '../agent/support/scripts.js'
import { getSystemInfo } from '../agent/support/diagnostics.js'

// After:
import { performResearchSearch, type DataSource, WikipediaDataSource } from '../agent/tools/wiki.js'
import { listAvailableScripts, listScriptsTool, scriptRunnerTool } from '../agent/tools/scripts.js'
import { getSystemInfo } from '../agent/tools/diagnostics.js'
```

- [ ] **Step 8: 빈 디렉토리 정리**

```bash
rm -rf agent/support/services agent/support/tools
rm -rf agent/research/agentic agent/research/services
```

- [ ] **Step 9: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 10: 커밋**

```bash
git add agent/tools/
git add -u agent/support/ agent/research/ agent/lib/runtime-types.ts electron/main.ts tests/agent-core.test.ts
git commit -m "refactor: move tool files to agent/tools/"
```

---

### Task 4: Assistant agent 이동 (`support/assistant.ts` → `tools/assistant-agent.ts`)

**Files:**
- Move: `agent/support/assistant.ts` → `agent/tools/assistant-agent.ts`
- Modify: `agent/app/graph/runtime.ts` (import 경로)
- Delete: `agent/support/` (빈 디렉토리)

- [ ] **Step 1: 파일 이동**

```bash
mv agent/support/assistant.ts agent/tools/assistant-agent.ts
```

- [ ] **Step 2: `agent/tools/assistant-agent.ts`의 내부 import 경로 변경**

Task 3에서 `assistant.ts`(당시 `support/`에 있음)의 diagnostics/scripts import를 `../tools/diagnostics.js`, `../tools/scripts.js`로 변경했음. 이제 `assistant-agent.ts`가 `tools/`로 이동했으므로 이 경로를 다시 `./diagnostics.js`, `./scripts.js`로 단순화:

```typescript
// Before (Task 3에서 변경된 상태):
import { ... } from '../tools/diagnostics.js'
import { ... } from '../tools/scripts.js'

// After (같은 tools/ 안이므로):
import { ... } from './diagnostics.js'
import { ... } from './scripts.js'
```

`../lib/`, `../app/` 경로는 depth가 동일하므로 변경 불필요.

- [ ] **Step 3: `agent/app/graph/runtime.ts`의 import 경로 변경**

```typescript
// Before:
import { createDefaultAssistantAgent } from '../../support/assistant.js'

// After:
import { createDefaultAssistantAgent } from '../../tools/assistant-agent.js'
```

- [ ] **Step 4: support 디렉토리 삭제**

```bash
rm -rf agent/support
```

- [ ] **Step 5: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: 커밋**

```bash
git add agent/tools/assistant-agent.ts
git add -u agent/support/ agent/app/graph/runtime.ts
git commit -m "refactor: move assistant agent to agent/tools/assistant-agent.ts"
```

---

### Task 5: 스키마 이동 (`app/graph/schema.ts`, `research/schema.ts` → `schemas/`)

**Files:**
- Move: `agent/app/graph/schema.ts` → `agent/schemas/routing.ts`
- Move: `agent/research/schema.ts` → `agent/schemas/research.ts`
- Modify: `agent/app/graph/runtime.ts` (import 경로)
- Modify: `agent/app/graph/nodes.ts` (import가 있다면)
- Modify: `agent/research/workflow.ts` (import 경로: `./schema` → `../schemas/research`)
- Modify: `agent/research/agent.ts` (import 경로)

- [ ] **Step 1: 디렉토리 생성 및 파일 이동**

```bash
mkdir -p agent/schemas
mv agent/app/graph/schema.ts agent/schemas/routing.ts
mv agent/research/schema.ts agent/schemas/research.ts
```

- [ ] **Step 2: `agent/app/graph/runtime.ts`의 import 경로 변경**

```typescript
// Before:
import { interpretSchema, routeSchema, type InterpretDecision, type RouteDecision } from './schema.js'

// After:
import { interpretSchema, routeSchema, type InterpretDecision, type RouteDecision } from '../../schemas/routing.js'
```

- [ ] **Step 3: `agent/research/workflow.ts`와 `agent/research/agent.ts`의 import 경로 변경**

파일을 읽어서 `./schema` import를 찾아 변경:
```typescript
// Before: import { ... } from './schema.js'
// After:  import { ... } from '../schemas/research.js'
```

- [ ] **Step 4: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: 커밋**

```bash
git add agent/schemas/
git add -u agent/app/graph/ agent/research/
git commit -m "refactor: move schemas to agent/schemas/"
```

---

### Task 6: 프롬프트 이동 (`app/prompts.ts` → `prompts/assistant.ts`)

**Files:**
- Move: `agent/app/prompts.ts` → `agent/prompts/assistant.ts`
- Modify: `agent/tools/assistant-agent.ts` (import 경로)

- [ ] **Step 1: 디렉토리 생성 및 파일 이동**

```bash
mkdir -p agent/prompts
mv agent/app/prompts.ts agent/prompts/assistant.ts
```

- [ ] **Step 2: `agent/tools/assistant-agent.ts`의 import 경로 변경**

```typescript
// Before:
import { chatNodePrompt } from '../app/prompts.js'

// After:
import { chatNodePrompt } from '../prompts/assistant.js'
```

- [ ] **Step 3: 다른 파일에서 `app/prompts` import가 있는지 확인**

```bash
grep -r "app/prompts" agent/ --include="*.ts"
```

발견되면 함께 변경.

- [ ] **Step 4: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: 커밋**

```bash
git add agent/prompts/
git add -u agent/app/prompts.ts agent/tools/assistant-agent.ts
git commit -m "refactor: move prompts to agent/prompts/"
```

---

### Task 7: State 분리 (`runtime.ts` → `state.ts`)

`runtime.ts`에서 상태 정의만 분리하여 `state.ts`로 추출.

**Files:**
- Create: `agent/state.ts`
- Modify: `agent/app/graph/runtime.ts` (상태 정의 제거, state.ts에서 import)
- Modify: `agent/app/graph/nodes.ts` (GraphTurnState import 경로 — runtime.ts에서 export하던 것)

- [ ] **Step 1: `agent/state.ts` 생성**

`runtime.ts`의 53-71행 + 22행 + 224-231행을 추출:

```typescript
import { Annotation, MessagesAnnotation } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'

const overwriteReducer = <T>(_prev: T, next: T) => next

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

export type DesignAssistantState = typeof GraphAnnotation.State

export type GraphTurnState = {
  messages: BaseMessage[]
  searchEnabled: boolean
  originalUserQuestion: string
  researchClarifications: string[]
  globalClarifyCount?: number
}
```

- [ ] **Step 2: `agent/app/graph/runtime.ts`에서 상태 관련 코드 제거, state.ts에서 import**

```typescript
// 제거: overwriteReducer, GraphAnnotation, DesignAssistantState, GraphTurnState 정의
// 추가:
import { GraphAnnotation, type DesignAssistantState, type GraphTurnState } from '../../state.js'
// re-export (public API 유지):
export { GraphAnnotation, type DesignAssistantState, type GraphTurnState } from '../../state.js'
```

- [ ] **Step 3: `agent/app/graph/nodes.ts`의 import 확인**

nodes.ts는 `GraphTurnState`와 `DesignAssistantGraphDependencies`를 `./runtime.js`에서 import. runtime.ts가 state.ts를 re-export하므로 **nodes.ts 변경 불필요**.

- [ ] **Step 4: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: 커밋**

```bash
git add agent/state.ts agent/app/graph/runtime.ts
git commit -m "refactor: extract state definition to agent/state.ts"
```

---

### Task 8: 노드 분리 (`nodes.ts` → `nodes/`)

> **참고:** `nodes/helpers.ts`는 스펙에 없는 추가 파일. 공유 헬퍼를 분리하기 위해 필요.
> **참고:** 이 단계에서 노드 파일들은 `../app/graph/runtime.js`에서 타입을 import. 이 경로는 Task 9에서 `../graph.js`로 변경될 예정이므로 일시적임.

**Files:**
- Create: `agent/nodes/helpers.ts`
- Create: `agent/nodes/interpret.ts`
- Create: `agent/nodes/router.ts`
- Create: `agent/nodes/assistant.ts`
- Create: `agent/nodes/research.ts`
- Create: `agent/nodes/index.ts`
- Delete: `agent/app/graph/nodes.ts`
- Modify: `agent/app/graph/runtime.ts` (import 경로)

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p agent/nodes
```

- [ ] **Step 2: 헬퍼 함수 위치 결정**

`nodes.ts`의 헬퍼 함수들 (`getRecentMessages`, `getLatestUserQuestion`, `withTurnContext`, `withUsageScope`)은 여러 노드에서 공유. `nodes/index.ts`에 배치하거나 별도 `nodes/helpers.ts` 생성.

→ `nodes/helpers.ts`로 분리:

```typescript
// agent/nodes/helpers.ts
import { HumanMessage, type BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'

export function getRecentMessages(messages: BaseMessage[], limit = 10) {
  return messages.slice(-limit)
}

export function getLatestUserQuestion(messages: BaseMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message._getType() === 'human') return String(message.content)
  }
  return ''
}

export function withTurnContext(
  messages: BaseMessage[],
  resolvedQuestion: string,
  clarifications: string[],
  limit = 10,
) {
  const recentMessages = messages.slice(-limit)
  const normalizedResolved = resolvedQuestion.trim()
  if (!normalizedResolved) return recentMessages

  const clarificationSuffix = clarifications.length > 0
    ? `\n선택한 의미: ${clarifications.join(', ')}`
    : ''
  const turnContent = `${normalizedResolved}${clarificationSuffix}`.trim()

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    if (recentMessages[index]?._getType() !== 'human') continue

    const currentContent = String(recentMessages[index].content ?? '').trim()
    if (currentContent === turnContent) return recentMessages

    const nextMessages = [...recentMessages]
    nextMessages[index] = new HumanMessage(turnContent)
    return nextMessages
  }

  return recentMessages
}

export function withUsageScope(config: LangGraphRunnableConfig | undefined, scope: string) {
  return {
    callbacks: config?.callbacks,
    tags: config?.tags,
    metadata: {
      ...(config?.metadata ?? {}),
      token_usage_scope: scope,
    },
  }
}
```

- [ ] **Step 3: `agent/nodes/interpret.ts` 생성**

```typescript
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { Command, type LangGraphRunnableConfig } from '@langchain/langgraph'
import { requestClarification } from '../app/clarify.js'
import type { DesignAssistantGraphDependencies, GraphTurnState } from '../app/graph/runtime.js'
import { getRecentMessages, getLatestUserQuestion, withUsageScope } from './helpers.js'

export function createInterpretNode(deps: DesignAssistantGraphDependencies) {
  return async function interpretNode(
    state: GraphTurnState & { globalClarifyCount: number },
    config?: LangGraphRunnableConfig,
  ) {
    // ... interpretNode의 전체 구현 (nodes.ts 62-120행)
  }
}
```

- [ ] **Step 4: `agent/nodes/router.ts` 생성**

```typescript
import { SystemMessage } from '@langchain/core/messages'
import { Command, type LangGraphRunnableConfig } from '@langchain/langgraph'
import type { DesignAssistantGraphDependencies, GraphTurnState } from '../app/graph/runtime.js'
import { withTurnContext, withUsageScope } from './helpers.js'

export function createRouterNode(deps: DesignAssistantGraphDependencies) {
  return async function routerNode(
    state: GraphTurnState,
    config?: LangGraphRunnableConfig,
  ) {
    // ... routerNode의 전체 구현 (nodes.ts 122-157행)
  }
}
```

- [ ] **Step 5: `agent/nodes/assistant.ts` 생성**

```typescript
import { Command, END, type LangGraphRunnableConfig } from '@langchain/langgraph'
import type { DesignAssistantGraphDependencies, GraphTurnState } from '../app/graph/runtime.js'
import { withTurnContext } from './helpers.js'

export function createAssistantNode(deps: DesignAssistantGraphDependencies) {
  return async function assistantNode(
    state: GraphTurnState,
    config?: LangGraphRunnableConfig,
  ) {
    // ... assistantNode의 전체 구현 (nodes.ts 159-187행)
  }
}
```

- [ ] **Step 6: `agent/nodes/research.ts` 생성**

```typescript
import { AIMessage } from '@langchain/core/messages'
import { Command, END, type LangGraphRunnableConfig } from '@langchain/langgraph'
import type { DesignAssistantGraphDependencies, GraphTurnState } from '../app/graph/runtime.js'
import { withTurnContext } from './helpers.js'

export function createResearchNode(deps: DesignAssistantGraphDependencies) {
  return async function researchNode(
    state: GraphTurnState,
    config?: LangGraphRunnableConfig,
  ) {
    // ... researchNode의 전체 구현 (nodes.ts 189-223행)
  }
}
```

- [ ] **Step 7: `agent/nodes/index.ts` 생성**

```typescript
import type { DesignAssistantGraphDependencies } from '../app/graph/runtime.js'
import { createInterpretNode } from './interpret.js'
import { createRouterNode } from './router.js'
import { createAssistantNode } from './assistant.js'
import { createResearchNode } from './research.js'

export function createCoreNodes(deps: DesignAssistantGraphDependencies) {
  return {
    interpretNode: createInterpretNode(deps),
    routerNode: createRouterNode(deps),
    assistantNode: createAssistantNode(deps),
    researchNode: createResearchNode(deps),
  }
}
```

- [ ] **Step 8: `agent/app/graph/runtime.ts`의 import 경로 변경**

```typescript
// Before:
import { createCoreNodes } from './nodes.js'

// After:
import { createCoreNodes } from '../../nodes/index.js'
```

- [ ] **Step 9: 기존 nodes.ts 삭제**

```bash
rm agent/app/graph/nodes.ts
```

- [ ] **Step 10: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 11: 커밋**

```bash
git add agent/nodes/
git add -u agent/app/graph/
git commit -m "refactor: split nodes into individual files under agent/nodes/"
```

---

### Task 9: Graph 통합 + Clarify 이동 (`runtime.ts` + `graph.ts` → 새 `graph.ts`)

가장 큰 변경. `app/graph/runtime.ts`의 내용을 `graph.ts`로 이동.

> **스펙과의 차이:** 스펙은 `clarify.ts`를 `graph.ts`에 흡수하도록 기술하지만, `clarify.ts`는 `nodes/interpret.ts`에서만 사용하는 독립 유틸리티이므로 `agent/clarify.ts`로 별도 유지하는 것이 더 깔끔. 스펙 업데이트 필요.

**Files:**
- Modify: `agent/graph.ts` (runtime.ts 내용으로 교체)
- Move/absorb: `agent/app/clarify.ts` → `agent/graph.ts` 안에 포함
- Delete: `agent/app/graph/runtime.ts`
- Delete: `agent/app/` (빈 디렉토리)
- Modify: `agent/nodes/*.ts` (import 경로: `../app/graph/runtime` → `../graph`)
- Modify: `tests/agent-core.test.ts` (이미 `../agent/graph.js`에서 import하므로 변경 불필요)

- [ ] **Step 1: `agent/app/clarify.ts` 내용을 별도 `agent/clarify.ts`로 먼저 이동**

clarify.ts는 작은 파일(12행)이지만 nodes/interpret.ts에서 import하므로 graph.ts에 합치기보다 루트에 독립 파일로 유지하는 게 깔끔. → `agent/clarify.ts`로 이동.

```bash
mv agent/app/clarify.ts agent/clarify.ts
```

- [ ] **Step 2: `agent/nodes/interpret.ts`의 clarify import 경로 변경**

```typescript
// Before:
import { requestClarification } from '../app/clarify.js'

// After:
import { requestClarification } from '../clarify.js'
```

- [ ] **Step 3: `agent/graph.ts`를 runtime.ts 내용으로 교체**

현재 `graph.ts`는 단순 re-export(8행). `app/graph/runtime.ts`의 전체 내용을 `graph.ts`로 복사하되:
- import 경로를 루트 기준으로 조정 (`../../lib/` → `./lib/`, `../../state.js` → `./state.js` 등)
- `state.ts` re-export 유지
- `app/graph/runtime.ts`에서 `./nodes.js` → `./nodes/index.js` (이미 Task 8에서 변경됨)

import 경로 변경 요약:
```typescript
// Before (app/graph/runtime.ts에서의 경로):
import { createLLM } from '../../lib/llm.js'
import type { ... } from '../../lib/runtime-types.js'
import { createTracer } from '../../lib/telemetry.js'
import { TokenUsageCollector } from '../../lib/token-usage.js'
import { createDefaultResearchRunner } from '../../research/workflow.js'
import { createDefaultAssistantAgent } from '../../tools/assistant-agent.js'
import { createCoreNodes } from '../../nodes/index.js'
import { interpretSchema, routeSchema, ... } from '../../schemas/routing.js'
import { GraphAnnotation, ... } from '../../state.js'

// After (graph.ts 루트에서의 경로):
import { createLLM } from './lib/llm.js'
import type { ... } from './lib/runtime-types.js'
import { createTracer } from './lib/telemetry.js'
import { TokenUsageCollector } from './lib/token-usage.js'
import { createDefaultResearchRunner } from './research/workflow.js'
import { createDefaultAssistantAgent } from './tools/assistant-agent.js'
import { createCoreNodes } from './nodes/index.js'
import { interpretSchema, routeSchema, ... } from './schemas/routing.js'
import { GraphAnnotation, ... } from './state.js'
```

- [ ] **Step 4: `agent/nodes/*.ts`의 import 경로 변경**

모든 노드 파일에서:
```typescript
// Before:
import type { DesignAssistantGraphDependencies, GraphTurnState } from '../app/graph/runtime.js'

// After:
import type { DesignAssistantGraphDependencies, GraphTurnState } from '../graph.js'
```

변경 대상: `nodes/interpret.ts`, `nodes/router.ts`, `nodes/assistant.ts`, `nodes/research.ts`, `nodes/index.ts`

- [ ] **Step 5: app 디렉토리 삭제**

```bash
rm -rf agent/app
```

- [ ] **Step 6: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: 커밋**

```bash
git add agent/graph.ts agent/clarify.ts agent/nodes/
git add -u agent/app/
git commit -m "refactor: consolidate graph.ts as single entry point, remove app/ directory"
```

---

### Task 10: 최종 정리 및 검증

**Files:**
- Verify: 전체 빌드
- Verify: 테스트 실행
- Clean: 잔여 빈 디렉토리

- [ ] **Step 1: 빈 디렉토리가 남아있는지 확인**

```bash
find agent/ -type d -empty
```

남아있으면 삭제.

- [ ] **Step 2: TypeScript 컴파일 최종 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 테스트 실행**

```bash
npx vitest run tests/agent-core.test.ts
```

- [ ] **Step 4: 최종 구조 확인**

```bash
find agent/ -name "*.ts" | sort
```

기대하는 출력:
```
agent/clarify.ts
agent/graph.ts
agent/lib/llm.ts
agent/lib/runtime-types.ts
agent/lib/telemetry.ts
agent/lib/token-usage.ts
agent/nodes/assistant.ts
agent/nodes/helpers.ts
agent/nodes/index.ts
agent/nodes/interpret.ts
agent/nodes/research.ts
agent/nodes/router.ts
agent/prompts/assistant.ts
agent/research/agent.ts
agent/research/workflow.ts
agent/schemas/research.ts
agent/schemas/routing.ts
agent/state.ts
agent/tools/assistant-agent.ts
agent/tools/diagnostics.ts
agent/tools/scripts.ts
agent/tools/wiki.ts
agent/types.ts
```

- [ ] **Step 5: 최종 커밋 (정리가 있었다면)**

```bash
git add -A agent/
git commit -m "refactor: final cleanup of agent directory structure"
```
