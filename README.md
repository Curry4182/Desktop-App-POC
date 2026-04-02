# Design Assistant

Electron + Vue + LangGraph.js 기반 데스크톱 챗봇입니다.

현재 앱은 크게 3가지를 합니다.

- 일반 대화와 CAD 관련 질의 응답
- 위키 기반 자료조사
- PC 진단과 등록된 배치 스크립트 실행

PowerShell 없이도 윈도우에서 `cmd`로 배치 파일을 실행할 수 있도록 구성되어 있습니다.

## 핵심 특징

- `LangGraph` 상위 흐름: `interpret -> router -> assistant | research`
- `research`는 ReAct 에이전트가 Wikipedia 도구를 자율 호출하여 조사
- PC 문제 해결용 스크립트는 `resources/scripts/registry.json`에 등록
- 위험한 스크립트 실행은 Human-in-the-loop 확인 후 진행
- Langfuse 기반 CAD/CATIA eval 지원

## 기술 스택

- Frontend: Vue 3 + Pinia
- Desktop: Electron 33
- Language: TypeScript
- AI: LangChain.js 1.x + LangGraph.js 1.x
- Models: OpenAI / Anthropic
- System info: `systeminformation`
- Test: Vitest
- Eval: Langfuse

## Agent 구조

```text
agent/
├── graph.ts                          # public entrypoint (barrel export)
│
├── app/                              # 메인 그래프 (LangGraph StateGraph)
│   ├── graph/
│   │   ├── runtime.ts               # 그래프 구성·컴파일·스트리밍 런타임
│   │   ├── nodes.ts                 # 4개 핵심 노드 (interpret/router/assistant/research)
│   │   ├── schema.ts               # interpret/router structured output 스키마
│   │   └── types.ts                # 그래프 의존성·입출력 타입 정의
│   ├── prompts.ts                   # assistant 시스템 프롬프트
│   └── clarify.ts                   # LangGraph interrupt 기반 clarification
│
├── research/                         # 위키 기반 자료조사 (agentic ReAct)
│   ├── workflow.ts                  # createDefaultResearchRunner (에이전트 실행)
│   ├── agent.ts                     # ReAct 에이전트 정의 (미들웨어 포함)
│   ├── document-tools.ts            # 3단계 도구 (search → summary → content)
│   ├── document-source.ts           # DocumentSource 인터페이스
│   └── wiki.ts                      # Wikipedia API 구현체
│
├── support/                          # PC 진단 / 스크립트 실행
│   ├── assistant.ts                 # assistant ReAct 에이전트
│   ├── diagnostics.ts               # 시스템 정보·네트워크·종합 진단 도구
│   └── scripts.ts                   # 스크립트 레지스트리 조회·실행
│
├── infra/                            # 인프라 유틸리티
│   ├── llm.ts                       # LLM 팩토리 (OpenAI/Anthropic)
│   ├── runtime-types.ts             # 의존성 주입용 타입 정의
│   ├── token-usage.ts               # 노드별 토큰 사용량 추적
│   └── telemetry.ts                 # 트레이싱 (현재 비활성화)
│
└── shared/types/                     # 공유 타입
    ├── system.ts                    # PC 진단 결과 타입
    ├── scripts.ts                   # 스크립트 레지스트리 타입
    └── research.ts                  # 자료조사 소스 타입
```

## 그래프 흐름

```text
사용자 메시지
    │
    ▼
┌─────────┐                        ┌────────┐
│interpret │ ────────────────────→  │ router │
│          │   재작성된 요청문       │        │
│ 발화 재작성│   (모호하면 interrupt  │ 요청 분류│
│ + 명확화  │    → clarification)   │        │
└─────────┘                        └───┬────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                   ┌────────────┐          ┌──────────────┐
                   │ assistant  │          │research_init │
                   │ (ReAct)    │          │ (ReAct)      │
                   │            │          │              │
                   │ 일반 대화   │          │ Wikipedia    │
                   │ PC 진단    │          │ 자료조사      │
                   └─────┬──────┘          └──────┬───────┘
                         │                        │
                         └───────────┬────────────┘
                                     ▼
                                    END
```

### interpret

- 최근 대화를 보고 이번 턴의 실제 요청을 독립 요청문으로 복원
- `그거`, `그 회사`, `ㅇㅇ 그렇게 해줘` 같은 후속 질문을 self-contained request로 변환
- 모호하면 LangGraph `interrupt()`로 프론트엔드에 clarification UI를 띄움 (턴당 최대 1회)
- LLM: structured output → `InterpretDecision` (temperature 0)

### router

- 재작성된 요청을 `assistant` vs `research_init`으로 분류
- 일반 대화 / PC 진단 / 검색 꺼진 상태 → `assistant`
- 위키 기반 사실 확인 / 다단계 조사 필요 → `research_init`
- 검색이 꺼져 있는데 research로 분류되면 assistant로 폴백
- LLM: structured output → `RouteDecision` (temperature 0)

### assistant

ReAct 에이전트로 일반 대화와 PC 진단/수리를 담당합니다.

사용 가능한 도구:

| 도구 | 기능 |
|------|------|
| `get_system_info` | OS/CPU/메모리/GPU/디스크 정보 |
| `get_installed_programs` | 설치된 프로그램 목록 |
| `check_network` | DNS/포트 연결 확인 |
| `run_full_diagnostic` | 종합 PC 진단 |
| `list_scripts` | 등록된 수정 스크립트 목록 |
| `run_script` | 스크립트 실행 (**사용자 승인 필요**) |

미들웨어: 모델 호출 6회 제한, 도구 호출 8회 제한, `run_script`에 human-in-the-loop

### research_init

ReAct 에이전트가 자율적으로 3단계 Wikipedia 도구를 호출하여 조사합니다.

1. `search_documents` — 키워드로 Wikipedia 검색
2. `get_document_summary` — 문서 요약 조회
3. `get_document_content` — 문서 전문 조회

미들웨어: 모델 호출 8회 제한, 도구 호출 12회 제한, 메시지 14개 초과 시 자동 요약

## 런타임

`createAgentRuntime()`이 Electron 프론트엔드와 연결되는 인터페이스입니다.

- **`streamGraph()`** — 새 사용자 메시지로 그래프 실행, 4종 이벤트를 yield
  - `token` — AI 응답 토큰 (interpret/router는 필터링, assistant/research만 전달)
  - `custom` — 조사 진행 상태 (`research_step`, `search_start` 등)
  - `interrupt` — clarification 요청
  - `done` — 턴 완료 + 토큰 사용량 스냅샷
- **`resumeGraph()`** — clarification 응답 후 중단된 그래프 재개

기본 runtime은 모듈 레벨 singleton으로 1회 생성되며, 이후 각 질문은 같은 compiled graph를 재사용합니다. 대화 상태는 `threadId` 단위로 분리됩니다.

## 의존성 주입

```text
createDefaultGraphDependencies()
    ├── interpretModel  ← createLLM().withStructuredOutput(interpretSchema)
    ├── routerModel     ← createLLM().withStructuredOutput(routeSchema)
    ├── assistantAgent  ← createDefaultAssistantAgent()  (ReAct + 진단 도구)
    └── runResearch     ← createDefaultResearchRunner()  (ReAct + 위키 도구)
```

모든 의존성을 `DesignAssistantGraphDependencies` 타입으로 묶어서 주입하므로, 테스트에서 각각 모킹이 가능합니다. `createLLM()`은 환경변수(`LLM_PROVIDER`)에 따라 OpenAI/Anthropic을 전환합니다.

## Renderer / Electron / Agent 관계

```text
Vue Renderer
  -> preload
  -> Electron main IPC
  -> agent runtime stream
  -> token/custom/interrupt/done 이벤트를 다시 renderer로 전달
```

Electron main이 하는 일:

- 창별 `threadId` 관리
- 실행 중 요청 abort 관리
- clarify / confirm interrupt를 UI 이벤트로 변환
- stream token/custom/done 이벤트 전달

## 윈도우 배치 스크립트

### 등록 위치

배치 파일은 아래 두 곳으로 구성됩니다.

- 실제 실행 파일: `resources/scripts/*.bat`
- 메타 정보: `resources/scripts/registry.json`

현재 registry 필드:

- `id`, `name`, `description`, `file`, `platform`, `symptoms`, `category`

예시:

```json
{
  "id": "fix-network",
  "name": "네트워크 초기화",
  "description": "DNS 캐시 초기화 및 네트워크 어댑터 재시작",
  "file": "fix-network.bat",
  "platform": "windows",
  "symptoms": ["인터넷 연결 안 됨", "DNS 오류"],
  "category": "network"
}
```

### 실행 방식

- 윈도우에서는 `.bat` / `.cmd`만 실행
- PowerShell `.ps1` 실행은 지원하지 않음
- 실행은 `cmd /c` 기반
- 패키징된 앱에서도 실행되도록 `electron-builder.extraResources`로 `resources/scripts`를 `process.resourcesPath/scripts`에 복사

### 승인 UI

스크립트 실행 전 사용자 확인 창에 아래 정보가 표시됩니다.

- 스크립트 이름, 설명, 카테고리, 증상, 파일명

## 환경 변수

기본 템플릿은 `.env.example`을 참고하면 됩니다.

| 변수명 | 설명 |
|---|---|
| `LLM_PROVIDER` | `openai` 또는 `anthropic` |
| `OPENAI_API_KEY` | OpenAI API 키 |
| `OPENAI_MODEL` | OpenAI 모델명 (기본: gpt-5-mini) |
| `ANTHROPIC_API_KEY` | Anthropic API 키 |
| `ANTHROPIC_MODEL` | Anthropic 모델명 (기본: claude-sonnet-4-5-20250929) |
| `SCRIPT_BASE_PATH` | 스크립트 경로 override |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key |
| `LANGFUSE_BASE_URL` | Langfuse base URL |

## 시작하기

### 1. 설치

```bash
npm install
```

### 2. 환경 변수 준비

```bash
cp .env.example .env
```

### 3. 개발 실행

```bash
npm run dev
```

### 4. 타입 체크

```bash
npm run typecheck
```

### 5. 테스트

```bash
npm test
```

### 6. 실제 API 통합 테스트

```bash
npm run test:integration
```

이 테스트는 OpenAI/Langfuse 키가 있을 때만 실행됩니다.

### 7. 빌드

```bash
npm run build
```

## 테스트 구성

- `tests/agent-core.test.ts`
  - follow-up 대화 흐름
  - research 기본 동작
  - diagnostics / scripts smoke
- `tests/langfuse-cad-catia.int.test.ts`
  - 실제 API를 쓰는 Langfuse CAD/CATIA smoke eval

## Langfuse Eval

CAD/CATIA 시나리오 평가 스크립트:

```bash
npm run eval:langfuse:cad-catia
```

## 현재 전제

- research는 최신 뉴스 검색기가 아니라 Wikipedia 기반 배경지식 조사에 맞춰져 있습니다.
- 윈도우 스크립트는 관리자 권한이 필요한 배치가 있을 수 있습니다.

## 현재 기준으로 보면 더 이상 없는 것

- Markdown 벡터스토어 기반 RAG
- UI 제어 패널 액션 노드
- multi-agent supervisor 구조
- PowerShell 기반 스크립트 실행
- workflow 모드 연구 파이프라인 (plan → search → distill → review)
