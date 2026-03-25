# Design Assistant

Electron + Vue + LangGraph.js 기반 데스크톱 챗봇입니다.

현재 앱은 크게 3가지를 합니다.

- 일반 대화와 CAD 관련 질의 응답
- 위키 기반 자료조사
- PC 진단과 등록된 배치 스크립트 실행

PowerShell 없이도 윈도우에서 `cmd`로 배치 파일을 실행할 수 있도록 구성되어 있습니다.

## 핵심 특징

- `LangGraph` 상위 흐름: `interpret -> router -> assistant | research`
- `research`는 두 모드 지원
  - `workflow`: 계획형 조사 파이프라인
  - `agentic`: 도구를 가진 에이전트가 자율 탐색
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

## 현재 구조

처음 보는 사람이 기능 이름으로 찾을 수 있게 `agent`를 역할 기준으로 나눴습니다.

```text
agent/
├── app/
│   ├── clarify.ts
│   ├── prompts.ts
│   └── graph/
│       ├── nodes.ts       # interpret / router / assistant / research
│       ├── runtime.ts     # graph 생성, compile, stream/resume
│       └── schema.ts      # graph structured output schema
├── research/
│   ├── agent.ts          # agentic research
│   ├── workflow.ts       # workflow research
│   ├── wiki.ts           # Wikipedia datasource/search
│   └── schema.ts         # research structured output schema
├── support/
│   ├── assistant.ts      # general assistant + support tools
│   ├── diagnostics.ts    # system diagnostics
│   └── scripts.ts        # script registry/load/execute
├── infra/
│   ├── llm.ts
│   ├── telemetry.ts
│   ├── token-usage.ts
│   └── runtime-types.ts
├── shared/
│   └── types/
└── graph.ts              # public entrypoint
```

## 상위 동작 흐름

```text
사용자 입력
  -> interpret
  -> router
  -> assistant 또는 research
```

### `interpret`

- 최근 대화를 보고 이번 턴의 실제 요청을 복원
- `그거`, `그 회사`, `ㅇㅇ 그렇게 해줘` 같은 후속 질문을 self-contained request로 변환
- 정말 필요한 경우만 clarify interrupt 발생

### `router`

- 일반 대화/PC 지원이면 `assistant`
- 출처 기반 사실조사면 `research`

### `assistant`

- 일반 질의 응답
- 시스템 진단
- 등록된 스크립트 조회/실행

### `research`

`RESEARCH_MODE`에 따라 둘 중 하나로 동작합니다.

- `workflow`
  - `plan -> search -> distill -> review -> answer`
- `agentic`
  - 위키 검색 도구를 가진 에이전트가 여러 번 탐색 후 답변

## 그래프 생성 방식

질문할 때마다 graph를 새로 만드는 구조는 아닙니다.

- 기본 runtime은 모듈 레벨 singleton으로 1회 생성
- 이후 각 질문은 같은 compiled graph를 재사용
- 대화 상태는 `threadId` 단위로 분리

즉 바뀌는 것은 매번 graph가 아니라 입력과 thread state입니다.

## 윈도우 배치 스크립트

### 등록 위치

배치 파일은 아래 두 곳으로 구성됩니다.

- 실제 실행 파일: `resources/scripts/*.bat`
- 메타 정보: [`resources/scripts/registry.json`](/Users/gangbyeong-gon/Source/design-assistant/resources/scripts/registry.json)

현재 registry 필드:

- `id`
- `name`
- `description`
- `file`
- `platform`
- `symptoms`
- `category`

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

- 스크립트 이름
- 설명
- 카테고리
- 증상
- 파일명

## 환경 변수

기본 템플릿은 [`.env.example`](/Users/gangbyeong-gon/Source/design-assistant/.env.example) 를 참고하면 됩니다.

주요 변수:

| 변수명 | 설명 |
|---|---|
| `LLM_PROVIDER` | `openai`, `anthropic`, `azure` 중 선택 |
| `OPENAI_API_KEY` | OpenAI API 키 |
| `OPENAI_MODEL` | OpenAI 모델명 |
| `ANTHROPIC_API_KEY` | Anthropic API 키 |
| `ANTHROPIC_MODEL` | Anthropic 모델명 |
| `SCRIPT_BASE_PATH` | 스크립트 경로 override |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key |
| `LANGFUSE_BASE_URL` | Langfuse base URL |
| `RESEARCH_MODE` | `workflow` 또는 `agentic` |

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

테스트는 복잡한 세분화보다 핵심 흐름만 남겨두었습니다.

- [`tests/agent-core.test.ts`](/Users/gangbyeong-gon/Source/design-assistant/tests/agent-core.test.ts)
  - follow-up 대화 흐름
  - research 기본 동작
  - diagnostics / scripts smoke
- [`tests/langfuse-cad-catia.int.test.ts`](/Users/gangbyeong-gon/Source/design-assistant/tests/langfuse-cad-catia.int.test.ts)
  - 실제 API를 쓰는 Langfuse CAD/CATIA smoke eval

## Langfuse Eval

CAD/CATIA 시나리오 평가 스크립트:

```bash
npm run eval:langfuse:cad-catia
```

모드 비교:

```bash
npm run eval:langfuse:cad-catia -- --mode workflow
npm run eval:langfuse:cad-catia -- --mode agentic
```

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

## 현재 전제

- research는 최신 뉴스 검색기가 아니라 Wikipedia 기반 배경지식 조사에 맞춰져 있습니다.
- broad question에서는 `workflow`보다 `agentic`이 더 잘 맞는 경우가 있습니다.
- 윈도우 스크립트는 관리자 권한이 필요한 배치가 있을 수 있습니다.

## 현재 기준으로 보면 더 이상 없는 것

이 README는 예전 구조를 설명하지 않습니다.

- Markdown 벡터스토어 기반 RAG
- UI 제어 패널 액션 노드
- multi-agent supervisor 구조
- PowerShell 기반 스크립트 실행

지금 코드는 위 구조가 아니라, 현재 폴더와 런타임 흐름 기준으로 유지되고 있습니다.
