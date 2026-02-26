# Design Assistant

AI 기반 범용 PC 어시스턴트 데스크톱 앱입니다.
채팅 명령으로 PC 진단, 문서 검색(RAG), UI 제어를 수행합니다.

> POC (Proof of Concept) 버전

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **PC 진단** | `systeminformation` 기반 HW/OS/GPU/디스크 정보 수집 + 설치 프로그램 목록 탐지 |
| **RAG 검색** | Markdown 문서를 기반으로 벡터 검색 후 답변 생성 |
| **UI 제어** | 채팅 명령으로 패널 열기/닫기, 진단 시작, 보고서 내보내기 등 실행 |
| **LLM 교체** | 환경변수 하나로 OpenAI ↔ Anthropic 전환 |

---

## 기술 스택

- **Frontend**: Vue 3 (Composition API) + Pinia
- **Desktop**: Electron 33
- **Language**: TypeScript 5
- **AI Workflow**: LangGraph.js + LangChain
- **LLM**: OpenAI / Anthropic (환경변수로 전환)
- **시스템 정보**: systeminformation
- **RAG**: MemoryVectorStore + OpenAI Embeddings
- **Build**: Vite 6
- **Test**: Vitest

## 개발 환경 요구사항

| 항목 | 버전 |
|------|------|
| Node.js | v18.19+ (권장 v22) |
| npm | v9+ |
| OS | macOS / Windows 10+ |

---

## 아키텍처

```
Vue (Renderer Process)
  └── window.electronAPI (contextBridge)
        └── Electron Main Process (IPC)
              └── LangGraph Agent
                    ├── Router Node      → 메시지 분류
                    ├── Chat Node        → 일반 대화 (LLM)
                    ├── RAG Node         → 문서 검색 + 답변 생성
                    ├── Diagnostic Node  → PC 진단 도구 실행
                    └── UI Action Node   → Vue 함수 트리거
```

**라우팅 흐름**

```
사용자 입력 → [Router] → diagnostic  → PC 진단 도구 → 결과 분석 → 응답
                       → rag         → 벡터 검색    → 문서 기반 답변
                       → ui_action   → UI 함수 실행 → 확인 메시지
                       → chat        → LLM 직접 응답
```

---

## 디렉토리 구조

```
design-assistant/
├── electron/
│   ├── main.ts          # Electron 메인 프로세스, IPC 핸들러
│   ├── preload.js       # contextBridge → window.electronAPI (CJS, 런타임 로드)
│   └── preload.ts       # preload 타입 정의 (타입체크 전용)
│
├── src/                 # Vue 3 (Renderer)
│   ├── App.vue
│   ├── main.js
│   ├── components/
│   │   ├── ChatWindow.vue       # 채팅 UI, IPC 연결
│   │   ├── MessageBubble.vue    # 메시지 렌더링
│   │   └── DiagnosticPanel.vue  # 진단 결과 패널
│   └── stores/
│       └── chat.ts              # Pinia 상태 관리
│
├── agent/               # LangGraph 에이전트
│   ├── graph.ts         # StateGraph 워크플로우 정의
│   ├── llm-factory.ts   # LLM 추상화 (OpenAI / Anthropic)
│   ├── types.ts         # 공유 타입 정의
│   ├── nodes/
│   │   ├── router.ts    # 메시지 분류
│   │   ├── chat.ts      # 일반 대화
│   │   ├── rag.ts       # RAG 검색
│   │   ├── diagnostic.ts
│   │   └── ui-action.ts
│   ├── tools/
│   │   ├── pc-diagnostic.ts   # systeminformation 기반 진단 도구
│   │   └── ui-functions.ts    # UI 액션 레지스트리
│   └── rag/
│       ├── vectorstore.ts     # MemoryVectorStore 싱글톤
│       └── loader.ts          # Markdown 문서 로더
│
├── resources/
│   └── knowledge-base/        # RAG 소스 .md 문서
│
├── tests/               # Vitest 단위/통합 테스트 (26개)
├── .env.example         # 환경변수 템플릿
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.electron.json
├── vite.config.ts
└── package.json
```

---

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 API 키를 입력합니다.

```env
# OpenAI 사용 시
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Anthropic으로 전환 시
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

### 3. 개발 실행

```bash
npm run dev
```

Vite 개발 서버(port 5173)가 시작되고 Electron 창이 자동으로 열립니다.

> **주의**: 브라우저에서 `localhost:5173`을 직접 열면 mock 응답만 표시됩니다.
> 반드시 자동으로 열리는 **Electron 창**에서 테스트하세요.

터미널에 아래 로그가 보이면 정상입니다.
```
[Main] 환경 변수 로드 완료
[Main] 에이전트 로드 성공
```

### 4. 타입 체크 / 테스트

```bash
npm run typecheck
npm test
```

### 5. 프로덕션 빌드

```bash
npm run build
```

`dist/` 폴더에 인스톨러가 생성됩니다.

---

## 환경변수 전체 목록

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `LLM_PROVIDER` | `openai` | LLM 공급자 (`openai` \| `anthropic`) |
| `OPENAI_API_KEY` | - | OpenAI API 키 |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI 모델명 |
| `ANTHROPIC_API_KEY` | - | Anthropic API 키 |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | Anthropic 모델명 |
| `KNOWLEDGE_BASE_PATH` | `./resources/knowledge-base` | RAG 문서 디렉토리 경로 |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | 임베딩 모델명 |

---

## PC 진단 상세

`systeminformation` 패키지를 사용해 OS/CPU/메모리/GPU/디스크를 수집하고,
Windows는 레지스트리(PowerShell), macOS는 `/Applications`에서 설치 프로그램 목록을 탐지합니다.
LLM이 설치 목록을 해석하여 사용자 질문과 관련된 소프트웨어를 식별합니다.

진단 결과는 우측 **DiagnosticPanel**에 표시됩니다.

---

## RAG 문서 추가

`resources/knowledge-base/` 폴더에 `.md` 파일을 추가하면
앱 재시작 시 자동으로 벡터 스토어에 로드됩니다.

---

## 채팅 명령 예시

### PC 진단
- `"PC 진단해줘"`
- `"설치된 프로그램 목록 보여줘"`
- `"디스크 용량 확인해줘"`
- `"네트워크 연결 상태 점검해줘"`

### 문서 검색 (RAG)
- `"CATIA Part Design에서 Pad 사용법 알려줘"`
- `"어셈블리 구속 조건 종류가 뭐야?"`

### UI 제어
- `"진단 패널 열어줘"` / `"닫아줘"`
- `"채팅 초기화해줘"`
- `"대화 내용 저장해줘"`

---

## 트러블슈팅

**Q. 채팅 입력 시 `[Mock] 입력: ...` 응답만 나온다**
→ Electron 창이 아닌 브라우저에서 테스트하고 있을 가능성이 높습니다. `npm run dev` 실행 후 자동으로 열리는 Electron 창을 사용하세요.

**Q. 터미널에 `ERR_UNKNOWN_FILE_EXTENSION ".ts"` 오류가 나온다**
→ `NODE_OPTIONS='--import tsx'`가 적용되지 않은 경우입니다. Node.js v18.19 미만이면 지원되지 않습니다. Node.js v22 사용을 권장합니다.

**Q. 터미널에 `Most NODE_OPTIONs are not supported in packaged apps` 경고가 나온다**
→ 개발 모드에서 발생하는 Electron 노이즈입니다. 기능에 영향을 주지 않으므로 무시해도 됩니다.

**Q. `[Main] 에이전트 로드 실패` 로그가 나온다**
→ `.env` 파일이 없거나 API 키가 잘못 설정된 경우입니다. `.env.example`을 복사해 API 키를 입력하세요.

---

## 라이선스

MIT
