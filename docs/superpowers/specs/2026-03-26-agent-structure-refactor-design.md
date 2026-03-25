# Agent 디렉토리 구조 리팩토링 설계

## 목표

`agent/` 하위 구조를 LangGraph.js 커뮤니티 관례(`state → graph → nodes → tools`)에 맞게 재구성하여 가독성을 높인다. **기능 변경 없이 파일 이동과 분리만 수행한다.**

## 원칙

- Public API 시그니처 변경 없음
- 내부 로직 변경 없음 — import 경로만 변경
- Research workflow 서브그래프 전환은 범위 밖
- 프롬프트 추출(인라인 → 상수)은 범위 밖 — 별도 후속 작업으로 분리

## 현재 구조 → 새 구조

### 현재

```
agent/
├── package.json              # module config (type: "module")
├── app/
│   ├── graph/
│   │   ├── runtime.ts        # 상태 + DI + 그래프 빌드 + 컴파일 + 스트리밍
│   │   ├── nodes.ts          # 노드 4개 전부
│   │   └── schema.ts         # routing/interpret 스키마
│   ├── clarify.ts
│   └── prompts.ts
├── research/
│   ├── workflow.ts
│   ├── agent.ts
│   ├── schema.ts
│   ├── wiki.ts
│   ├── agentic/              # 빈 디렉토리
│   └── services/             # 빈 디렉토리
├── support/
│   ├── assistant.ts          # ReAct agent 생성 + 미들웨어
│   ├── diagnostics.ts        # 시스템 진단 tool
│   ├── scripts.ts            # 스크립트 tool
│   ├── services/             # 빈 디렉토리
│   └── tools/                # 빈 디렉토리
├── infra/
│   ├── llm.ts
│   ├── runtime-types.ts
│   ├── telemetry.ts
│   ├── token-usage.ts
│   ├── llm/                  # 빈 디렉토리
│   └── telemetry/            # 빈 디렉토리
├── shared/types/
│   ├── llm.ts
│   ├── system.ts
│   ├── research.ts
│   └── scripts.ts
└── graph.ts                   # public API
```

### 새 구조

```
agent/
├── package.json              # 기존 유지
├── state.ts                  # GraphAnnotation, 리듀서, DesignAssistantState
├── graph.ts                  # 그래프 빌드 + 컴파일 + 스트리밍 + public API
├── clarify.ts                # requestClarification (interrupt 유틸리티)
├── nodes/
│   ├── index.ts              # createCoreNodes 재조립
│   ├── helpers.ts            # 공유 헬퍼 (getRecentMessages, withTurnContext 등)
│   ├── interpret.ts          # createInterpretNode
│   ├── router.ts             # createRouterNode
│   ├── assistant.ts          # createAssistantNode
│   └── research.ts           # createResearchNode
├── tools/
│   ├── diagnostics.ts        # 시스템 진단 tool 정의 + 실행 로직
│   ├── scripts.ts            # 스크립트 tool 정의 + 실행 로직
│   ├── wiki.ts               # Wikipedia 데이터소스 + tool 정의
│   └── assistant-agent.ts    # createDefaultAssistantAgent (ReAct agent 팩토리)
├── prompts/
│   └── assistant.ts          # assistant 시스템 프롬프트
├── research/
│   ├── workflow.ts           # 기존 유지 (인라인 프롬프트 포함, 추출은 후속 작업)
│   └── agent.ts              # 기존 유지
├── schemas/
│   ├── routing.ts            # routeSchema, interpretSchema
│   └── research.ts           # research 관련 스키마 (research/schema.ts에서 이동)
├── lib/
│   ├── llm.ts                # LLM 팩토리
│   ├── runtime-types.ts      # 런타임 인터페이스
│   ├── telemetry.ts          # 트레이싱
│   └── token-usage.ts        # 토큰 사용량 추적
└── types.ts                  # 공유 타입 통합 (llm, system, research, scripts)
```

## 삭제 대상

### 디렉토리 (내용물이 새 위치로 이동)
- `app/` → graph.ts, nodes/, state.ts, prompts/, schemas/로 분산
- `support/` → tools/로 이동
- `infra/` → lib/로 이름 변경
- `shared/types/` → types.ts로 통합

### 빈 디렉토리 (정리 삭제)
- `research/agentic/`, `research/services/`
- `support/services/`, `support/tools/`
- `infra/llm/`, `infra/telemetry/`

## 파일별 변경 상세

### `state.ts` (신규 — runtime.ts에서 분리)

- `GraphAnnotation` 정의
- `DesignAssistantState` 타입
- `overwriteReducer` 헬퍼

### `graph.ts` (통합)

현재 두 곳의 로직을 하나로:
- `app/graph/runtime.ts` → `createDefaultGraphDependencies`, `buildGraph`, `compileGraph`, `createAgentRuntime`
- 기존 `graph.ts` → public API export (`streamGraph`, `resumeGraph`)
- `app/clarify.ts` → `agent/clarify.ts`로 이동 (독립 유틸리티로 유지)

### `nodes/` (분리)

현재 `nodes.ts`의 `createCoreNodes` 팩토리를 유지하되 각 노드를 개별 파일로:
- `nodes/interpret.ts` → `export function createInterpretNode(deps) { ... }`
- `nodes/router.ts` → `export function createRouterNode(deps) { ... }`
- `nodes/assistant.ts` → `export function createAssistantNode(deps) { ... }`
- `nodes/research.ts` → `export function createResearchNode(deps) { ... }`
- `nodes/index.ts` → 개별 노드를 import하여 `createCoreNodes`로 재조립

### `tools/` (이동)

- `support/diagnostics.ts` → `tools/diagnostics.ts` (내용 동일)
- `support/scripts.ts` → `tools/scripts.ts` (내용 동일)
- `research/wiki.ts` → `tools/wiki.ts` (내용 동일)
- `support/assistant.ts` → `tools/assistant-agent.ts` (내용 동일, 이름만 변경)

### `prompts/` (이동)

- `app/prompts.ts` → `prompts/assistant.ts` (내용 동일)
- (research 프롬프트 추출은 후속 작업으로 별도 진행)

### `schemas/` (이동)

- `app/graph/schema.ts` → `schemas/routing.ts` (내용 동일)
- `research/schema.ts` → `schemas/research.ts` (이동, 단일 위치)

### `lib/` (이름 변경)

- `infra/` → `lib/` (디렉토리명만 변경, 내부 파일 동일)

### `types.ts` (통합)

- `shared/types/llm.ts`, `system.ts`, `research.ts`, `scripts.ts` → 단일 `types.ts`로 합침

## Import 경로 변경

### agent 내부

| 변경 전 | 변경 후 |
|---------|---------|
| `./app/graph/runtime` | `./graph` 또는 `./state` |
| `./app/graph/nodes` | `./nodes` |
| `./app/graph/schema` | `./schemas/routing` |
| `./app/prompts` | `./prompts/assistant` |
| `./app/clarify` | `./graph` |
| `./support/diagnostics` | `./tools/diagnostics` |
| `./support/scripts` | `./tools/scripts` |
| `./support/assistant` | `./tools/assistant-agent` |
| `./research/wiki` | `./tools/wiki` |
| `./research/schema` | `./schemas/research` |
| `./infra/llm` | `./lib/llm` |
| `./infra/telemetry` | `./lib/telemetry` |
| `./infra/token-usage` | `./lib/token-usage` |
| `./infra/runtime-types` | `./lib/runtime-types` |
| `./shared/types/*` | `./types` |

### research/ 내부 (wiki.ts 이동으로 인한 변경)

| 파일 | 변경 전 | 변경 후 |
|------|---------|---------|
| `research/workflow.ts` | `./wiki` | `../tools/wiki` |
| `research/agent.ts` | `./wiki` | `../tools/wiki` |
| `research/workflow.ts` | `./schema` | `../schemas/research` |
| `research/agent.ts` | `./schema` | `../schemas/research` |

### lib/ 내부 (runtime-types.ts의 cross-reference)

| 파일 | 변경 전 | 변경 후 | 비고 |
|------|---------|---------|------|
| `lib/runtime-types.ts` | `../research/wiki` | `../tools/wiki` | `ResearchSearchResult` 타입 참조 |

## 외부 영향 (agent 바깥에서의 import 변경)

| 파일 | 변경 전 import | 변경 후 import |
|------|---------------|---------------|
| `electron/main.ts` | `../agent/support/scripts.js` (`getScriptById`) | `../agent/tools/scripts.js` |
| `shared/chat-protocol.ts` | `../agent/shared/types/research.js` (`ResearchSource`) | `../agent/types.js` |
| `tests/agent-core.test.ts` | `../agent/support/scripts.js` | `../agent/tools/scripts.js` |
| `tests/agent-core.test.ts` | `../agent/support/diagnostics.js` | `../agent/tools/diagnostics.js` |
| `tests/agent-core.test.ts` | `../agent/research/wiki.js` | `../agent/tools/wiki.js` |
| `evals/langfuse/cad-catia/types.ts` | `../../../agent/infra/token-usage.js` | `../../../agent/lib/token-usage.js` |
| `evals/langfuse/cad-catia/runner.ts` | `../../../agent/graph.js` | 변경 없음 (public API) |

## 마이그레이션 순서

안전한 리팩토링을 위해 다음 순서로 진행:

1. **인프라 이동**: `infra/` → `lib/` (이름 변경)
2. **타입 통합**: `shared/types/*.ts` → `types.ts`
3. **Tool 이동**: `support/diagnostics.ts`, `support/scripts.ts` → `tools/`, `research/wiki.ts` → `tools/wiki.ts`
4. **Assistant agent 이동**: `support/assistant.ts` → `tools/assistant-agent.ts`
5. **스키마 이동**: `app/graph/schema.ts` → `schemas/routing.ts`, `research/schema.ts` → `schemas/research.ts`
6. **프롬프트 이동**: `app/prompts.ts` → `prompts/assistant.ts`
7. **State 분리**: `runtime.ts`에서 `state.ts` 추출
8. **노드 분리**: `nodes.ts` → `nodes/` 개별 파일
9. **Graph 통합**: `runtime.ts` + 기존 `graph.ts` → 새 `graph.ts`
10. **Clarify 흡수**: `app/clarify.ts` → `graph.ts`에 포함
11. **외부 import 업데이트**: electron, shared, tests, evals
12. **빈 디렉토리 정리**: 삭제
13. **빌드 검증**: TypeScript 컴파일 + 테스트 실행
