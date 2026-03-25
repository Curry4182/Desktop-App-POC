# Agent 디렉토리 구조 리팩토링 설계

## 목표

`agent/` 하위 구조를 LangGraph.js 커뮤니티 관례(`state → graph → nodes → tools`)에 맞게 재구성하여 가독성을 높인다. **기능 변경 없이 파일 이동과 분리만 수행한다.**

## 원칙

- Public API 시그니처 변경 없음 (electron 쪽 수정 불필요)
- 내부 로직 변경 없음 — import 경로만 변경
- Research workflow 서브그래프 전환은 범위 밖

## 현재 구조 → 새 구조

### 현재

```
agent/
├── app/
│   ├── graph/
│   │   ├── runtime.ts      # 상태 + DI + 그래프 빌드 + 컴파일 + 스트리밍
│   │   ├── nodes.ts         # 노드 4개 전부
│   │   └── schema.ts        # routing/interpret 스키마
│   ├── clarify.ts
│   └── prompts.ts
├── research/
│   ├── workflow.ts
│   ├── agent.ts
│   ├── schema.ts
│   └── wiki.ts
├── support/
│   ├── assistant.ts         # ReAct agent 생성 + 미들웨어
│   ├── diagnostics.ts       # 시스템 진단 tool
│   ├── scripts.ts           # 스크립트 tool
│   └── services/
├── infra/
│   ├── llm.ts
│   ├── runtime-types.ts
│   ├── telemetry.ts
│   ├── token-usage.ts
│   └── llm/
├── shared/types/
│   ├── llm.ts
│   ├── system.ts
│   ├── research.ts
│   └── scripts.ts
└── graph.ts                  # public API
```

### 새 구조

```
agent/
├── state.ts                  # GraphAnnotation, 리듀서, DesignAssistantState
├── graph.ts                  # 그래프 빌드 + 컴파일 + 스트리밍 + public API
├── nodes/
│   ├── index.ts              # createCoreNodes 재조립
│   ├── interpret.ts          # createInterpretNode
│   ├── router.ts             # createRouterNode
│   ├── assistant.ts          # createAssistantNode
│   └── research.ts           # createResearchNode
├── tools/
│   ├── diagnostics.ts        # 시스템 진단 tool 정의 + 실행 로직
│   ├── scripts.ts            # 스크립트 tool 정의 + 실행 로직
│   └── wiki.ts               # Wikipedia 데이터소스 + tool 정의
├── prompts/
│   ├── assistant.ts          # assistant 시스템 프롬프트
│   └── research.ts           # research workflow 프롬프트 상수
├── research/
│   ├── workflow.ts           # 기존 유지 (프롬프트만 prompts/research.ts로 추출)
│   ├── agent.ts              # 기존 유지
│   └── schema.ts             # 기존 유지
├── schemas/
│   ├── routing.ts            # routeSchema, interpretSchema
│   └── research.ts           # research 관련 스키마 (re-export)
├── lib/
│   ├── llm.ts                # LLM 팩토리
│   ├── runtime-types.ts      # 런타임 인터페이스
│   ├── telemetry.ts          # 트레이싱
│   └── token-usage.ts        # 토큰 사용량 추적
└── types.ts                  # 공유 타입 통합 (llm, system, research, scripts)
```

## 파일별 변경 상세

### `state.ts` (신규 파일)

`runtime.ts`에서 분리:
- `GraphAnnotation` 정의
- `DesignAssistantState` 타입
- `overwriteReducer` 헬퍼

### `graph.ts` (통합)

현재 두 곳의 로직을 하나로:
- `app/graph/runtime.ts` → `createDefaultGraphDependencies`, `buildGraph`, `compileGraph`, `createAgentRuntime`
- 기존 `graph.ts` → public API export (`streamGraph`, `resumeGraph`)
- `support/assistant.ts`의 `createDefaultAssistantAgent` → dependency 생성부로 흡수
- `app/clarify.ts`의 `requestClarification` → 그래프 유틸리티로 포함

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

### `prompts/` (이동 + 추출)

- `app/prompts.ts` → `prompts/assistant.ts` (내용 동일)
- `research/workflow.ts` 내 인라인 프롬프트 문자열 → `prompts/research.ts`로 상수 추출

### `schemas/` (이동)

- `app/graph/schema.ts` → `schemas/routing.ts` (내용 동일)
- `research/schema.ts` → `schemas/research.ts` (re-export 또는 그대로 이동)

### `lib/` (이름 변경)

- `infra/` → `lib/` (디렉토리명만 변경, 내부 파일 동일)

### `types.ts` (통합)

- `shared/types/llm.ts`, `system.ts`, `research.ts`, `scripts.ts` → 단일 `types.ts`로 합침

## 삭제되는 디렉토리

- `app/` (graph.ts, nodes/, state.ts로 분산)
- `support/` (tools/, graph.ts로 분산)
- `infra/` (lib/로 이름 변경)
- `shared/types/` (types.ts로 통합)

## Import 경로 변경

| 변경 전 | 변경 후 |
|---------|---------|
| `./app/graph/runtime` | `./graph` 또는 `./state` |
| `./app/graph/nodes` | `./nodes` |
| `./app/graph/schema` | `./schemas/routing` |
| `./app/prompts` | `./prompts/assistant` |
| `./app/clarify` | `./graph` |
| `./support/diagnostics` | `./tools/diagnostics` |
| `./support/scripts` | `./tools/scripts` |
| `./support/assistant` | `./graph` |
| `./research/wiki` | `./tools/wiki` |
| `./infra/llm` | `./lib/llm` |
| `./infra/telemetry` | `./lib/telemetry` |
| `./infra/token-usage` | `./lib/token-usage` |
| `./infra/runtime-types` | `./lib/runtime-types` |
| `./shared/types/*` | `./types` |

## 외부 영향

- **electron/main.ts**: `agent/graph.ts`의 public API 시그니처 불변 → 변경 없음
- **evals/**, **tests/**: agent 내부 import 경로를 사용하는 경우 함께 업데이트
- **기능 동작**: 완전히 동일
