# Design Assistant v2 — Supervisor + ReAct Multi-Agent Design

> Date: 2026-03-24
> Status: Approved

---

## 1. Overview

POC의 단일 라우터 아키텍처를 LangGraph.js 기반 Supervisor + ReAct 멀티에이전트 구조로 전환한다.

### 1.1 현재 구조 (POC)

```
사용자 입력 → [Router Node] → diagnostic / rag / ui_action / chat → END
```

### 1.2 목표 구조 (v2)

```
사용자 입력 → [Supervisor Agent]
                 ├── Search Agent   (Wiki 키워드 검색, ReAct 루프)
                 ├── PC Fix Agent   (진단 + 배치 실행 + 검증, ReAct 루프)
                 └── Chat Agent     (일반 대화, 단일 LLM 호출)
```

### 1.3 제거 대상

| 항목 | 파일 |
|------|------|
| RAG 파이프라인 | `agent/rag/`, `agent/nodes/rag.ts`, `resources/knowledge-base/` |
| UI Action 기능 | `agent/nodes/ui-action.ts`, `agent/tools/ui-functions.ts` |
| Router 노드 | `agent/nodes/router.ts` (Supervisor로 대체) |
| LLM Factory 일부 | `llm-factory.ts`의 `createEmbeddings()` 함수 및 `OpenAIEmbeddings` import 제거 |
| 환경변수 | `KNOWLEDGE_BASE_PATH`, `EMBEDDING_MODEL` |
| 의존성 | `faiss-node`, `@langchain/community` (RAG용) |

---

## 2. Supervisor Agent

- 사용자 메시지를 분석하여 적절한 하위 에이전트에 위임
- **구현 방식**: `StateGraph` + conditional edges + `Send` API 기반 커스텀 Supervisor (별도 패키지 불필요)
- Supervisor 노드가 LLM으로 에이전트 분류 + clarification 판단, conditional edge로 하위 에이전트 라우팅
- 독립적인 에이전트를 **병렬 실행** 가능 (LangGraph.js `Send` API 활용)
  - 병렬 실행 시나리오: 검색 + 진단이 동시에 필요한 질문 → Search + PC Fix Agent 동시 호출
  - Supervisor의 conditional edge에서 `Send` 객체 배열 반환으로 병렬 포크
  - 병렬 결과는 Supervisor 노드에서 취합 후 최종 응답 생성
- Clarification 판단: 맥락 부족 시 사용자에게 보기 + 직접 입력 제시
- **Checkpointer**: `MemorySaver` (`@langchain/langgraph/checkpoint`) 사용하여 그래프 상태 영속화
  - `interrupt` 후 `Command({ resume: value })` 로 재개 가능
  - 대화별 `thread_id`로 상태 관리

**상태 흐름**: Supervisor → 하위 에이전트로 messages 전달 → 에이전트 결과를 Supervisor state에 병합 → 최종 응답 생성

**파일**: `agent/supervisor.ts`

---

## 3. Search Agent (Wiki 검색)

### 3.1 Tool: Wiki 키워드 검색

- LangChain 기반 Tool로 Wikipedia 키워드 검색 구현
- 상위 N개 문서 반환 (`WIKI_SEARCH_TOP_K`, 기본: 3)

### 3.2 ReAct 루프

```
1. Action    : 키워드 추출 → Wiki 검색 Tool 호출
2. Observation: 상위 N개 문서 내용 확인
3. Reasoning : 충분한지 판단
   ├── 충분 → 답변 생성 → 종료
   └── 부족 → 키워드 재구성 → 재검색
```

- `createReactAgent` 사용
- 최대 반복: `REACT_MAX_ITERATIONS` (기본: 5)
- 각 반복의 요약을 스트리밍으로 표시

### 3.3 UI 토글

- 프론트엔드 토글 버튼으로 검색 ON/OFF
- OFF 시 Supervisor가 Search Agent를 호출하지 않음

**파일**: `agent/agents/search-agent.ts`, `agent/tools/wiki-search.ts`

---

## 4. PC Fix Agent (진단 + 문제 해결)

### 4.1 기존 진단 Tool 유지

- `systeminformation` 기반 HW/OS/GPU/디스크/네트워크 진단
- 설치 프로그램 목록 탐지
- **LangChain Tool 래핑 필요**: 기존 plain 함수를 `tool()` (from `@langchain/core/tools`) + Zod 스키마로 래핑하여 `createReactAgent`에서 사용 가능하도록 변환

### 4.2 신규 Tool: 배치 스크립트 실행

- `resources/scripts/` 내 미리 정의된 `.bat`/`.ps1` 파일 실행
- 화이트리스트 방식: `registry.json`에 등록된 스크립트만 실행 가능
- 타 팀이 스크립트 추가 + registry.json 항목 추가만으로 확장

**registry.json 구조:**
```json
{
  "scripts": [
    {
      "id": "fix-network",
      "name": "네트워크 초기화",
      "description": "DNS 캐시 초기화 및 네트워크 어댑터 재시작",
      "file": "fix-network.bat",
      "platform": "windows",
      "symptoms": ["인터넷 연결 안 됨", "DNS 오류"],
      "category": "network"
    }
  ]
}
```

### 4.3 ReAct 루프

```
1. Action    : 증상 파악 → PC 진단 Tool 실행
2. Observation: 진단 결과 확인
3. Reasoning : 배치 스크립트 선택
4. Action    : [Human-in-the-Loop 확인] → 배치 스크립트 실행
5. Observation: 실행 결과 확인
6. Reasoning : 해결 여부 판단
   ├── 해결 → 결과 보고 → 종료
   └── 미해결 → 다른 조치 시도
```

**파일**: `agent/agents/pc-fix-agent.ts`, `agent/tools/script-runner.ts`, `agent/tools/pc-diagnostic.ts`

---

## 5. Chat Agent

- 일반 대화 처리 (단일 LLM 호출, `llm.invoke()` 사용)
- ReAct 불필요 — `createReactAgent` 미사용
- 기존 `agent/nodes/chat.ts`의 시스템 프롬프트와 로직을 이관
- 한국어 CAD 설계 어시스턴트 페르소나 유지

**파일**: `agent/agents/chat-agent.ts`

---

## 6. Human-in-the-Loop

### 6.1 실행 확인 (Confirmation)

배치 스크립트 등 시스템 변경 작업 실행 전 사용자 확인 필수.

- LangGraph.js `interrupt` 기능으로 그래프 실행 일시 중단/재개
- **필수 조건**: `MemorySaver` checkpointer + `thread_id` 기반 상태 관리 (Section 2 참조)
- **재개 흐름**: Renderer → `agent:confirm:response` IPC → Main → `graph.stream(new Command({ resume: value }), { configurable: { thread_id } })`
- 확인 대상: 배치 스크립트 실행, 시스템 설정 변경
- 확인 불필요: 정보 조회 (진단, 검색 등)
- **타임아웃**: 사용자 미응답 시 60초 후 자동 취소, 에러 메시지 표시

### 6.2 질문 맥락 보충 (Clarification)

맥락 부족 시 보기(라디오) + 직접 입력을 제시하여 질문 구체화.

- LLM이 보기 항목을 동적 생성
- 직접 입력 옵션 항상 포함
- 보기 선택 + 직접 입력 동시 가능

### 6.3 IPC 채널

```
Main → Renderer:
  'agent:confirm'             — 실행 확인 요청
  'agent:clarify'             — 맥락 보충 요청

Renderer → Main:
  'agent:confirm:response'    — 확인/취소 응답
  'agent:clarify:response'    — 선택/입력 응답
```

### 6.4 신규 컴포넌트

- `ConfirmDialog.vue`: 실행 확인 다이얼로그
- `ClarificationCard.vue`: 보기 + 직접 입력

---

## 7. Streaming

### 7.1 방식

- **요청**: Renderer → `ipcRenderer.send('agent:message', { message, history })` (fire-and-forget)
- **응답**: Main → `webContents.send('agent:stream:*')` 로 토큰/청크 단위 실시간 전송
- 기존 `ipcMain.handle` (request-response) 패턴을 `ipcMain.on` + `webContents.send` (이벤트 스트림)으로 전환
- Pinia chat store: `await` 기반 → 이벤트 리스너 기반으로 리팩터링 (토큰 수신 시 reactive message에 append)

### 7.2 IPC 채널

```
Main → Renderer:
  'agent:stream:token'      — LLM 응답 토큰
  'agent:stream:step'       — ReAct 단계 요약
  'agent:stream:done'       — 응답 완료
  'agent:stream:error'      — 에러 발생
```

### 7.3 스트리밍 대상

| 항목 | 내용 |
|------|------|
| LLM 응답 | 토큰 단위 실시간 |
| ReAct 단계 | 요약만 표시 (Thought 비노출, DEBUG 모드 제외) |
| 진단 진행률 | 항목별 진행 상태 |
| 배치 실행 로그 | stdout/stderr 실시간 |

### 7.4 프론트엔드 변경

- `ChatWindow.vue`: 토큰 수신 시 실시간 렌더링 (타이핑 효과)
- `MessageBubble.vue`: ReAct 단계 표시 (접기/펼치기)

---

## 8. Conversation History Management

```
[Summary] 이전 대화 요약 (LLM 생성)
─────────────────────────────────────
[User] 최근 메시지 1        ← 최근 N개 유지
[AI]   응답 1
[User] 최근 메시지 2
...
```

- `CONVERSATION_WINDOW_SIZE` (기본: 10) 초과 시 이전 대화를 LLM으로 요약
- **요약 시점**: 새 메시지 수신 시, 그래프 호출 전에 window 초과 여부 체크
- **요약 방식**: 초과분을 LLM에 전달하여 1개의 summary 메시지로 압축
- **상태 구조**: `{ summary: string | null, recentMessages: Message[] }` — summary는 messages 앞에 system message로 주입
- 앱 종료 시 히스토리 소멸 (메모리 기반)

**파일**: `agent/history/conversation-manager.ts`

---

## 9. Error Handling

- 에러 발생 시 `ErrorRetryCard.vue` 표시
- "다시 시도" → 마지막 사용자 메시지로 에이전트 재실행
- "취소" → 대화 계속 가능
- 에러 유형별 사용자 친화적 메시지 매핑

---

## 10. Directory Structure

```
agent/
├── supervisor.ts
├── agents/
│   ├── search-agent.ts
│   ├── pc-fix-agent.ts
│   └── chat-agent.ts
├── tools/
│   ├── wiki-search.ts
│   ├── pc-diagnostic.ts       (기존 유지)
│   └── script-runner.ts       (신규)
├── history/
│   └── conversation-manager.ts
├── llm-factory.ts             (기존 유지)
├── types.ts                   (확장)
└── graph.ts                   (리팩터링)

src/components/
├── ChatWindow.vue             (스트리밍 지원 개선)
├── MessageBubble.vue          (ReAct 단계 표시)
├── DiagnosticPanel.vue        (기존 유지)
├── ConfirmDialog.vue          (신규)
├── ClarificationCard.vue      (신규)
├── ErrorRetryCard.vue         (신규)
└── SearchToggle.vue           (신규)

resources/
└── scripts/
    ├── registry.json
    ├── fix-network.bat
    ├── clear-dns-cache.ps1
    └── clear-temp-files.bat
```

---

## 11. Environment Variables

| 변수명 | 기본값 | 상태 | 설명 |
|--------|--------|------|------|
| `KNOWLEDGE_BASE_PATH` | — | 제거 | RAG 제거 |
| `EMBEDDING_MODEL` | — | 제거 | RAG 제거 |
| `WIKI_SEARCH_TOP_K` | `3` | 신규 | Wiki 검색 문서 수 |
| `REACT_MAX_ITERATIONS` | `5` | 신규 | ReAct 최대 반복 |
| `SCRIPT_BASE_PATH` | `./resources/scripts` | 신규 | 배치 스크립트 경로 |
| `CONVERSATION_WINDOW_SIZE` | `10` | 신규 | 최근 대화 유지 수 |
| `DEBUG_REACT_STEPS` | `false` | 신규 | ReAct Thought 표시 여부 |

---

## 12. Implementation Priority

| 순서 | 항목 |
|------|------|
| 1 | Supervisor + ReAct 구조 + 기존 코드 제거 |
| 2 | Search Agent (Wiki 검색 + ReAct) |
| 3 | Human-in-the-Loop (확인/보충 UI) |
| 4 | Streaming (Electron IPC) |
| 5 | PC Fix Agent (배치 실행 + ReAct 검증) |
| 6 | UI 토글 + 프론트엔드 정리 |
