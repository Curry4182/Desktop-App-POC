# v3 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the agent backend from scratch to eliminate nested-agent bugs, using LangGraph.js official patterns (Supervisor + Command routing, `stream()` with multiple modes, MemorySaver).

**Architecture:** Supervisor node routes via `structuredOutput` + `Command` to flat agent nodes (research, pc_fix, chat). Research uses Planner + Worker pattern to prevent context pollution. Streaming uses `stream(["messages", "custom", "updates"])` instead of legacy `streamEvents`.

**Tech Stack:** LangGraph.js, `createReactAgent`, `Command`, `MemorySaver`, `interrupt()`, `config.writer()`, Langfuse, Electron IPC, Vue 3 + Pinia

**Spec:** `docs/superpowers/specs/2026-03-24-v3-redesign.md`

---

## File Structure

```
agent/
├── graph.ts                 # CREATE: StateGraph + compile + streamGraph()
├── supervisor.ts            # CREATE: supervisor node (structuredOutput routing + summary)
├── llm-factory.ts           # KEEP: no changes
├── observability.ts         # CREATE: Langfuse tracer
├── types.ts                 # MODIFY: clean up, add CustomStreamEvent types
├── agents/
│   ├── research-agent.ts    # CREATE: Planner ReAct agent
│   ├── pc-fix-agent.ts      # MODIFY: add wrapper node function
│   └── chat-agent.ts        # CREATE: simple LLM node function
└── tools/
    ├── research-worker.ts   # CREATE: research_worker tool
    ├── wiki-api.ts          # CREATE: pure functions from wiki-search.ts
    ├── ask-user.ts          # MODIFY: update return message
    ├── pc-diagnostic.ts     # KEEP: no changes
    └── script-runner.ts     # KEEP: no changes

electron/
├── main.ts                  # CREATE: new stream consumption logic
├── preload.ts               # MODIFY: update types
└── preload.js               # MODIFY: update IPC channels

src/
├── stores/chat.ts           # MODIFY: update IPC listeners
└── components/              # KEEP: minimal changes

DELETE:
├── agent/state.ts
├── agent/agents/answer-agent.ts
├── agent/history/conversation-manager.ts
├── agent/tools/wiki-search.ts
```

---

### Task 1: Clean up types and create observability module

**Files:**
- Modify: `agent/types.ts`
- Create: `agent/observability.ts`

- [ ] **Step 1: Update types.ts**

Remove `SupervisorState` interface and old `StreamStep` type. Add `CustomStreamEvent` types and `AgentRoute` type:

```typescript
// agent/types.ts
import type { BaseMessage } from '@langchain/core/messages'

// ──────────────────────────────────────────────
// 시스템 정보 (systeminformation 기반) — KEEP AS-IS
// ──────────────────────────────────────────────
export interface OsInfo {
  platform: string
  distro: string
  release: string
  arch: string
  hostname: string
  kernel: string
}

export interface CpuInfo {
  manufacturer: string
  brand: string
  speed: number
  cores: number
  physicalCores: number
}

export interface MemoryInfo {
  totalGB: string
  freeGB: string
  usedGB: string
  usedPercent: string
}

export interface GpuInfo {
  vendor: string
  model: string
  vramMB: number
  driverVersion?: string
}

export interface DiskInfo {
  fs: string
  type: string
  mount: string
  totalGB: string
  usedGB: string
  freeGB: string
  usedPercent: string
}

export interface SystemInfo {
  os: OsInfo
  cpu: CpuInfo
  memory: MemoryInfo
  gpu: GpuInfo[]
  disks: DiskInfo[]
}

// ──────────────────────────────────────────────
// 설치 프로그램
// ──────────────────────────────────────────────
export interface InstalledProgram {
  name: string
  version?: string
  installLocation?: string
}

// ──────────────────────────────────────────────
// 파일 경로 체크 결과
// ──────────────────────────────────────────────
export interface FilePathResult {
  exists: boolean
  isFile?: boolean
  isDirectory?: boolean
  error?: string
}

// ──────────────────────────────────────────────
// 네트워크 체크 결과
// ──────────────────────────────────────────────
export interface NetworkResult {
  reachable: boolean
  dns?: boolean
  port?: Record<number, boolean>
  error?: string
}

export type NetworkTarget = string | { host: string; port?: number }

// ──────────────────────────────────────────────
// 전체 진단 결과
// ──────────────────────────────────────────────
export interface DiagnosticResult {
  timestamp: string
  query: string
  system: SystemInfo
  installedPrograms: InstalledProgram[]
  network: Record<string, NetworkResult>
  filePaths?: Record<string, FilePathResult>
}

// ──────────────────────────────────────────────
// LLM 팩토리 옵션
// ──────────────────────────────────────────────
export interface LLMOptions {
  temperature?: number
  maxTokens?: number
}

// ─── Script Registry ───
export interface ScriptEntry {
  id: string
  name: string
  description: string
  file: string
  platform: 'windows' | 'macos' | 'linux'
  symptoms: string[]
  category: string
}

export interface ScriptRegistry {
  scripts: ScriptEntry[]
}

// ─── Agent Routing ───
export type AgentName = 'research' | 'pc_fix' | 'chat'
export type AgentRoute = AgentName | '__end__'

// ─── Custom Stream Events (config.writer) ───
export type CustomStreamEvent =
  | { type: 'search_start'; query: string }
  | { type: 'search_result'; titles: string[]; count: number }
  | { type: 'source_found'; title: string; url: string; snippet: string }
  | { type: 'research_step'; step: string }

// ─── Research Source ───
export interface ResearchSource {
  title: string
  content: string
  sourceType: 'wikipedia' | 'other'
  url?: string
  documentId?: string
  metadata?: Record<string, unknown>
}

// ─── HITL ───
export interface ConfirmRequest {
  id: string
  action: string
  description: string
  scriptId?: string
}

export interface ConfirmResponse {
  id: string
  confirmed: boolean
}

export interface ClarifyOption {
  label: string
  value: string
}

export interface ClarifyRequest {
  id: string
  question: string
  options: ClarifyOption[]
}

export interface ClarifyResponse {
  id: string
  selected: string[]
  freeText?: string
}
```

- [ ] **Step 2: Create observability.ts**

```typescript
// agent/observability.ts
import 'dotenv/config'

export async function createTracer() {
  if (!process.env.LANGFUSE_SECRET_KEY) return null
  try {
    const { CallbackHandler } = await import('langfuse-langchain')
    return new CallbackHandler({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    })
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --project tsconfig.node.json --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add agent/types.ts agent/observability.ts
git commit -m "feat(v3): clean up types, add observability module"
```

---

### Task 2: Create wiki-api.ts (pure functions)

**Files:**
- Create: `agent/tools/wiki-api.ts`

Extract Wikipedia API calls from `agent/tools/wiki-search.ts` into pure functions (no LangChain tool wrapper).

- [ ] **Step 1: Create wiki-api.ts**

```typescript
// agent/tools/wiki-api.ts

const TOP_K = parseInt(process.env.WIKI_SEARCH_TOP_K || '5', 10)
const SUMMARY_WORD_LIMIT = 150
const DETAIL_WORD_LIMIT = 300

// ─── Helpers ───

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

function truncateWords(text: string, limit: number): string {
  const words = text.split(/\s+/)
  if (words.length <= limit) return text
  return words.slice(0, limit).join(' ') + '...'
}

function relevanceScore(query: string, text: string): number {
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  if (queryWords.size === 0) return 1
  const textLower = text.toLowerCase()
  let matches = 0
  for (const word of queryWords) {
    if (textLower.includes(word)) matches++
  }
  return matches / queryWords.size
}

// ─── Types ───

export interface WikiSearchResult {
  title: string
  snippet: string
  pageid: number
}

export interface WikiSummary {
  title: string
  content: string
  url: string
  pageid: string
  description?: string
}

export interface WikiSection {
  index: string
  title: string
}

export interface WikiSectionContent {
  article: string
  section: string
  content: string
  url: string
}

// ─── API Functions ───

export async function searchWikipedia(query: string): Promise<WikiSearchResult[]> {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('list', 'search')
  url.searchParams.set('srsearch', query)
  url.searchParams.set('srlimit', String(TOP_K))
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')

  const res = await fetch(url.toString())
  const data = await res.json() as {
    query: { search: Array<{ title: string; snippet: string; pageid: number }> }
  }

  const pages = data.query?.search
  if (!pages || pages.length === 0) return []

  return pages
    .map(page => ({
      title: page.title,
      snippet: stripHtml(page.snippet),
      pageid: page.pageid,
      relevance: relevanceScore(query, stripHtml(page.snippet) + ' ' + page.title),
    }))
    .filter(r => r.relevance > 0.1)
    .slice(0, 3)
    .map(({ relevance: _, ...rest }) => rest)
}

export async function getSummary(title: string): Promise<WikiSummary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as {
      title: string
      extract: string
      content_urls?: { desktop?: { page?: string } }
      pageid?: number
      description?: string
    }
    return {
      title: data.title,
      content: truncateWords(data.extract, SUMMARY_WORD_LIMIT),
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      pageid: String(data.pageid || ''),
      description: data.description,
    }
  } catch {
    return null
  }
}

export async function getSections(title: string): Promise<WikiSection[]> {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'parse')
  url.searchParams.set('page', title)
  url.searchParams.set('prop', 'sections')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')

  try {
    const res = await fetch(url.toString())
    const data = await res.json() as {
      parse?: { sections: Array<{ index: string; line: string; level: string }> }
    }
    if (!data.parse?.sections) return []
    return data.parse.sections
      .filter(s => s.level === '2' || s.level === '3')
      .map(s => ({ index: s.index, title: s.line }))
  } catch {
    return []
  }
}

export async function getSectionContent(title: string, section: string): Promise<WikiSectionContent | null> {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'parse')
  url.searchParams.set('page', title)
  url.searchParams.set('section', section)
  url.searchParams.set('prop', 'text')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')

  try {
    const res = await fetch(url.toString())
    const data = await res.json() as {
      parse?: { title: string; text: { '*': string } }
    }
    if (!data.parse?.text) return null
    const rawHtml = data.parse.text['*']
    const text = stripHtml(rawHtml).replace(/\s+/g, ' ').trim()
    return {
      article: title,
      section,
      content: truncateWords(text, DETAIL_WORD_LIMIT),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add agent/tools/wiki-api.ts
git commit -m "feat(v3): add wiki-api pure functions"
```

---

### Task 3: Create research-worker tool and update ask-user

**Files:**
- Create: `agent/tools/research-worker.ts`
- Modify: `agent/tools/ask-user.ts`

- [ ] **Step 1: Create research-worker.ts**

```typescript
// agent/tools/research-worker.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { searchWikipedia, getSummary, getSections, getSectionContent } from './wiki-api.js'
import type { ResearchSource } from '../types.js'

export const researchWorkerTool = tool(
  async ({ query, depth }: { query: string; depth?: string }, config: LangGraphRunnableConfig) => {
    const sources: ResearchSource[] = []

    // Step 1: Search
    config.writer?.({ type: 'search_start', query })
    const results = await searchWikipedia(query)

    if (results.length === 0) {
      config.writer?.({ type: 'search_result', titles: [], count: 0 })
      return JSON.stringify({ summary: `No results found for "${query}".`, sources: [] })
    }

    config.writer?.({ type: 'search_result', titles: results.map(r => r.title), count: results.length })

    // Step 2: Get summaries for top results
    const summaries: string[] = []
    for (const result of results.slice(0, 2)) {
      const summary = await getSummary(result.title)
      if (summary) {
        summaries.push(`[${summary.title}]: ${summary.content}`)
        sources.push({
          title: summary.title,
          content: summary.content,
          sourceType: 'wikipedia',
          url: summary.url,
          documentId: summary.pageid,
          metadata: { description: summary.description },
        })
        config.writer?.({
          type: 'source_found',
          title: summary.title,
          url: summary.url,
          snippet: summary.content.slice(0, 100),
        })
      }
    }

    // Step 3: If depth is "deep", get section details for the first result
    if (depth === 'deep' && results.length > 0) {
      const mainTitle = results[0].title
      const sections = await getSections(mainTitle)
      // Get first 2 relevant sections
      for (const sec of sections.slice(0, 2)) {
        const content = await getSectionContent(mainTitle, sec.index)
        if (content) {
          summaries.push(`[${mainTitle} - ${sec.title}]: ${content.content}`)
        }
      }
    }

    return JSON.stringify({
      summary: summaries.join('\n\n'),
      sources,
    })
  },
  {
    name: 'research_worker',
    description: 'Search Wikipedia for a specific query and return summarized results with sources. Use depth="deep" for detailed section-level information. Each call is independent — use specific, focused queries (1-3 English words work best).',
    schema: z.object({
      query: z.string().max(50).describe('English search query, 1-3 specific words. Proper nouns and technical terms work best.'),
      depth: z.enum(['normal', 'deep']).optional().describe('Search depth. "normal" for summary, "deep" for section-level detail. Default: normal.'),
    }),
  }
)
```

- [ ] **Step 2: Update ask-user.ts**

Replace the return message to remove reference to `generate_answer` (which no longer exists):

```typescript
// agent/tools/ask-user.ts
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

    return `사용자 선택: "${userResponse}" — 이 결과를 반영하여 research_worker로 검색을 수행하세요. 자체 지식으로 답변하지 마세요.`
  },
  {
    name: 'ask_user',
    description: '사용자에게 보충 질문을 합니다. 결과를 받은 후 반드시 research_worker로 검색하세요.',
    schema: z.object({
      question: z.string().describe('사용자에게 물어볼 질문'),
      options: z.array(z.string()).describe('선택지 목록 (3~5개)'),
    }),
  }
)
```

- [ ] **Step 3: Commit**

```bash
git add agent/tools/research-worker.ts agent/tools/ask-user.ts
git commit -m "feat(v3): add research-worker tool, update ask-user"
```

---

### Task 4: Create agent nodes (research, chat, pc-fix wrapper)

**Files:**
- Create: `agent/agents/research-agent.ts`
- Create: `agent/agents/chat-agent.ts`
- Modify: `agent/agents/pc-fix-agent.ts`

- [ ] **Step 1: Create research-agent.ts**

```typescript
// agent/agents/research-agent.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { Command } from '@langchain/langgraph'
import { SystemMessage } from '@langchain/core/messages'
import { createLLM } from '../llm-factory.js'
import { researchWorkerTool } from '../tools/research-worker.js'
import { askUserTool } from '../tools/ask-user.js'

const WINDOW_SIZE = parseInt(process.env.CONVERSATION_WINDOW_SIZE || '10', 10)

const RESEARCH_PLANNER_PROMPT = `당신은 자료조사 전문 에이전트입니다.
사용자의 질문을 분석하고, 순차적으로 조사하여, 최종 답변을 생성합니다.

## 도구
1. research_worker: Wikipedia에서 특정 주제를 검색합니다. 1~3단어 영어 키워드가 가장 효과적입니다.
2. ask_user: 사용자에게 보충 질문을 합니다 (모호한 질문일 때만).

## 작업 흐름

### 1단계: 질문 분석
- 질문의 조건을 분해합니다.
- 예: "CAD를 만든 사람이 살았던 나라의 경제" → (1) CAD 핵심 인물 → (2) 그 나라 → (3) 경제
- research_worker를 먼저 시도합니다. ask_user는 검색으로 해결 불가능한 모호성에만 사용합니다.

### 2단계: 순차 조사
- 각 조건을 research_worker로 하나씩 조사합니다.
- 이전 결과를 다음 검색에 반영합니다.
- 예: research_worker("Computer-aided design") → "Ivan Sutherland, 미국" → research_worker("United States economy")

### 3단계: 답변 생성
- 조사 결과만을 기반으로 답변합니다.
- 각 정보에 출처를 명시합니다.
- 검색에서 못 찾은 정보는 "검색 결과에서 해당 정보를 찾지 못했습니다"로 명시합니다.
- 자체 지식으로 보충하지 마세요.

## 검색 키워드 전략
- 핵심 개념어 1~3단어 (영어)
- BAD: "CAD technology development major contributing countries"
- GOOD: "Computer-aided design"
- 첫 검색에서 고유명사 발견 시 후속 검색

## ask_user 사용 조건
- 대명사가 맥락 없이 사용: "그거 뭐야?"
- research_worker 결과에서 후보가 여러 개이고 사용자 선택이 필요할 때
- ask_user 후 반드시 research_worker로 검색!

## 금지 사항
- Wikipedia에서 찾지 못한 정보를 자체 지식으로 보충하지 마세요
- "일반적으로 ~로 알려져 있습니다" ← LLM 자체 지식, 금지
- 사용자와 같은 언어로 답변하세요`

const researchAgent = createReactAgent({
  llm: createLLM({ temperature: 0.3 }),
  tools: [researchWorkerTool, askUserTool],
  prompt: (state: { messages: any[]; conversationSummary?: string }) => [
    new SystemMessage(RESEARCH_PLANNER_PROMPT),
    ...(state.conversationSummary
      ? [new SystemMessage(`[이전 대화 요약]\n${state.conversationSummary}`)]
      : []),
    ...state.messages.slice(-WINDOW_SIZE),
  ],
  name: 'research_agent',
})

export async function researchNode(state: { messages: any[]; conversationSummary?: string }) {
  const result = await researchAgent.invoke(state, { recursionLimit: 25 })
  const lastMsg = result.messages[result.messages.length - 1]
  return new Command({
    goto: 'supervisor',
    update: { messages: [lastMsg] },
  })
}
```

- [ ] **Step 2: Create chat-agent.ts**

```typescript
// agent/agents/chat-agent.ts
import { Command } from '@langchain/langgraph'
import { SystemMessage } from '@langchain/core/messages'
import { createLLM } from '../llm-factory.js'

const WINDOW_SIZE = parseInt(process.env.CONVERSATION_WINDOW_SIZE || '10', 10)

const CHAT_PROMPT = `당신은 CAD 설계 엔지니어를 위한 어시스턴트입니다.
설계 워크플로우, 소프트웨어 도구, 엔지니어링 프로세스에 관한 질문을 도와드립니다.

## 시스템 기능
이 시스템에는 Wikipedia 검색 기능이 있습니다.
검색이 필요한 질문은 검색 에이전트가 처리합니다.
이전 대화에서 자료조사를 통해 답변한 내용은 Wikipedia 검색 결과를 기반으로 합니다.

## 규칙
- 간결하고 전문적으로 답변하세요
- 사용자와 같은 언어로 응답하세요
- 의미 없는 입력(감탄사, 장난)에는 짧게 1문장으로 응답
- 이전 대화 맥락이 있으면 활용하여 후속 질문에 답변하세요
- "실시간 검색을 못합니다" 같은 답변 금지 — 이 시스템은 검색 가능합니다`

const llm = createLLM()

export async function chatNode(state: { messages: any[]; conversationSummary?: string }) {
  const messagesForLLM = [
    new SystemMessage(CHAT_PROMPT),
    ...(state.conversationSummary
      ? [new SystemMessage(`[이전 대화 요약]\n${state.conversationSummary}`)]
      : []),
    ...state.messages.slice(-WINDOW_SIZE),
  ]

  const response = await llm.invoke(messagesForLLM)

  return new Command({
    goto: 'supervisor',
    update: { messages: [response] },
  })
}
```

- [ ] **Step 3: Update pc-fix-agent.ts**

Keep existing agent creation, add a wrapper node function:

```typescript
// agent/agents/pc-fix-agent.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { Command } from '@langchain/langgraph'
import { tool } from '@langchain/core/tools'
import { interrupt } from '@langchain/langgraph'
import { SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { createLLM } from '../llm-factory.js'
import {
  systemInfoTool,
  installedProgramsTool,
  networkCheckTool,
  fullDiagnosticTool,
} from '../tools/pc-diagnostic.js'
import { listScriptsTool, getScriptById } from '../tools/script-runner.js'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)
const SCRIPT_BASE_PATH = process.env.SCRIPT_BASE_PATH || './resources/scripts'
const WINDOW_SIZE = parseInt(process.env.CONVERSATION_WINDOW_SIZE || '10', 10)

const PC_FIX_SYSTEM_PROMPT = `당신은 PC 문제 진단 및 해결 전문 에이전트입니다.

작업 순서:
1. 먼저 진단 도구를 사용하여 PC 상태를 파악하세요.
2. 문제를 식별한 후, list_scripts로 사용 가능한 수정 스크립트를 확인하세요.
3. 적절한 스크립트가 있다면 run_script_with_confirmation으로 실행하세요 (사용자 확인 필요).
4. 실행 후 다시 진단하여 문제가 해결되었는지 검증하세요.

규칙:
- 사용자의 증상을 정확히 파악하세요.
- 진단 결과를 바탕으로 판단하세요.
- 스크립트 실행 시 반드시 run_script_with_confirmation을 사용하세요.
- 해결되지 않으면 대안을 제시하세요.
- 사용자와 같은 언어로 응답하세요.`

const scriptRunnerWithConfirmTool = tool(
  async ({ scriptId }) => {
    const entry = getScriptById(scriptId)
    if (!entry) {
      return `Error: Script "${scriptId}" not found in registry.`
    }

    const confirmed = interrupt({
      type: 'confirm',
      action: entry.name,
      description: entry.description,
      scriptId: entry.id,
    })

    if (!confirmed) {
      return `사용자가 "${entry.name}" 실행을 취소했습니다.`
    }

    const scriptPath = path.join(SCRIPT_BASE_PATH, entry.file)
    if (!fs.existsSync(scriptPath)) {
      return `Error: Script file "${entry.file}" does not exist.`
    }

    const ext = path.extname(entry.file).toLowerCase()
    let command: string
    if (ext === '.ps1') {
      command = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`
    } else if (ext === '.bat' || ext === '.cmd') {
      command = `cmd /c "${scriptPath}"`
    } else {
      return `Error: Unsupported script type: ${ext}`
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      })
      return `Script "${entry.name}" executed.\n\nOutput:\n${[stdout, stderr].filter(Boolean).join('\n')}`
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return `Script "${entry.name}" failed: ${message}`
    }
  },
  {
    name: 'run_script_with_confirmation',
    description: 'Execute a fix script after getting user confirmation.',
    schema: z.object({
      scriptId: z.string().describe('The ID of the script to execute'),
    }),
  }
)

const pcFixAgent = createReactAgent({
  llm: createLLM({ temperature: 0.2 }),
  tools: [
    systemInfoTool,
    installedProgramsTool,
    networkCheckTool,
    fullDiagnosticTool,
    listScriptsTool,
    scriptRunnerWithConfirmTool,
  ],
  prompt: (state: { messages: any[]; conversationSummary?: string }) => [
    new SystemMessage(PC_FIX_SYSTEM_PROMPT),
    ...(state.conversationSummary
      ? [new SystemMessage(`[이전 대화 요약]\n${state.conversationSummary}`)]
      : []),
    ...state.messages.slice(-WINDOW_SIZE),
  ],
  name: 'pc_fix_agent',
})

export async function pcFixNode(state: { messages: any[]; conversationSummary?: string }) {
  const result = await pcFixAgent.invoke(state, { recursionLimit: 15 })
  const lastMsg = result.messages[result.messages.length - 1]
  return new Command({
    goto: 'supervisor',
    update: { messages: [lastMsg] },
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add agent/agents/research-agent.ts agent/agents/chat-agent.ts agent/agents/pc-fix-agent.ts
git commit -m "feat(v3): create agent node functions with Command routing"
```

---

### Task 5: Create supervisor and graph

**Files:**
- Create: `agent/supervisor.ts`
- Create: `agent/graph.ts`

- [ ] **Step 1: Create supervisor.ts**

```typescript
// agent/supervisor.ts
import { Command } from '@langchain/langgraph'
import { SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { createLLM } from './llm-factory.js'
import type { AgentRoute } from './types.js'

const WINDOW_SIZE = parseInt(process.env.CONVERSATION_WINDOW_SIZE || '10', 10)

const ROUTE_SCHEMA = z.object({
  next: z.enum(['research', 'pc_fix', 'chat', '__end__']).describe('The next agent to route to'),
})

const SUPERVISOR_PROMPT = `사용자 메시지를 분석하여 적절한 에이전트로 라우팅하세요.

라우팅 규칙:
- "research": 새로운 지식 검색이 필요한 질문 (이전에 조사하지 않은 주제), 사용자가 명시적으로 검색 요청
- "pc_fix": PC 문제 진단/해결
- "chat": 일반 대화, 인사, 감탄사, 후속 질문, 이전 대화에 대한 추가 질문, 짧은 반응
- "__end__": 에이전트가 이미 충분한 답변을 생성한 경우 (대화 종료)

## chat으로 라우팅:
- 감탄사/장난: "메롱", "ㅋㅋ", "ㅎㅎ", "안녕"
- 후속 질문: "왜?", "어떻게?", "더 알려줘", "그래서?"
- 이전에 이미 조사한 주제에 대한 추가 질문
- 짧은 반응: "응", "그래", "알겠어"
- 출처 질문: "어떤 자료를 봤어?", "출처 알려줘"

## research로 라우팅:
- 새로운 주제에 대한 질문
- 구체적인 정보 조사가 필요한 질문
- 사용자가 명시적으로 검색/조사를 요청

## __end__로 라우팅:
- 마지막 메시지가 AI의 답변이고, 사용자의 새 메시지가 아닌 경우
- 에이전트가 답변을 완료한 직후`

const llm = createLLM({ temperature: 0 })
const routerLLM = llm.withStructuredOutput(ROUTE_SCHEMA)

export async function supervisorNode(state: {
  messages: any[]
  searchEnabled: boolean
  conversationSummary: string
}) {
  // Check if conversation needs summarization
  if (state.messages.length > WINDOW_SIZE * 2) {
    const oldMessages = state.messages.slice(0, -WINDOW_SIZE)
    const summaryLLM = createLLM({ temperature: 0 })
    const summaryResponse = await summaryLLM.invoke([
      new SystemMessage('이전 대화 내용을 간결하게 요약하세요. 핵심 정보와 맥락만 포함. 2~3문장으로.'),
      ...(state.conversationSummary
        ? [new SystemMessage(`기존 요약: ${state.conversationSummary}`)]
        : []),
      ...oldMessages,
    ])

    const route = await routerLLM.invoke([
      new SystemMessage(SUPERVISOR_PROMPT),
      ...state.messages.slice(-WINDOW_SIZE),
    ])

    let next: AgentRoute = route.next
    if (next === 'research' && !state.searchEnabled) next = 'chat'

    return new Command({
      goto: next,
      update: {
        conversationSummary: String(summaryResponse.content),
        messages: state.messages.slice(-WINDOW_SIZE),
      },
    })
  }

  // Normal routing
  const route = await routerLLM.invoke([
    new SystemMessage(SUPERVISOR_PROMPT),
    ...(state.conversationSummary
      ? [new SystemMessage(`[이전 대화 요약]\n${state.conversationSummary}`)]
      : []),
    ...state.messages.slice(-WINDOW_SIZE),
  ])

  let next: AgentRoute = route.next
  if (next === 'research' && !state.searchEnabled) next = 'chat'

  return new Command({ goto: next })
}
```

- [ ] **Step 2: Create graph.ts**

```typescript
// agent/graph.ts
import { Annotation, MessagesAnnotation, StateGraph, MemorySaver, START, Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { randomUUID } from 'crypto'
import { supervisorNode } from './supervisor.js'
import { researchNode } from './agents/research-agent.js'
import { chatNode } from './agents/chat-agent.js'
import { pcFixNode } from './agents/pc-fix-agent.js'
import { createTracer } from './observability.js'
import 'dotenv/config'

// ─── State Schema ───

export const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  searchEnabled: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => true,
  }),
  conversationSummary: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
})

// ─── Build Graph ───

const checkpointer = new MemorySaver()

function buildGraph() {
  const graph = new StateGraph(GraphAnnotation)
    .addNode('supervisor', supervisorNode, {
      ends: ['research', 'pc_fix', 'chat', '__end__'],
    })
    .addNode('research', researchNode, {
      ends: ['supervisor'],
    })
    .addNode('pc_fix', pcFixNode, {
      ends: ['supervisor'],
    })
    .addNode('chat', chatNode, {
      ends: ['supervisor'],
    })
    .addEdge(START, 'supervisor')

  return graph.compile({ checkpointer })
}

let compiledGraph: ReturnType<typeof buildGraph> | null = null

function getGraph() {
  if (!compiledGraph) compiledGraph = buildGraph()
  return compiledGraph
}

// ─── Session Management ───

let currentThreadId = `session-${randomUUID()}`

export function getThreadId() {
  return currentThreadId
}

export function resetSession() {
  currentThreadId = `session-${randomUUID()}`
}

// ─── Streaming Entry Point ───

export async function* streamGraph(
  userMessage: string,
  searchEnabled: boolean = true,
) {
  const graph = getGraph()
  const tracer = await createTracer()
  const callbacks = tracer ? [tracer] : []

  const config = {
    configurable: { thread_id: currentThreadId },
    callbacks,
  }

  const input = {
    messages: [new HumanMessage(userMessage)],
    searchEnabled,
  }

  const stream = await graph.stream(input, {
    ...config,
    streamMode: ['messages', 'custom', 'updates'] as const,
  })

  for await (const chunk of stream) {
    const [mode, data] = chunk as [string, any]

    switch (mode) {
      case 'messages': {
        // data = [AIMessageChunk, metadata]
        const [msgChunk, metadata] = data
        if (msgChunk._getType() === 'ai' && msgChunk.content) {
          // Skip supervisor tokens (structuredOutput doesn't produce streaming tokens,
          // but guard anyway)
          if (metadata?.langgraph_node !== 'supervisor') {
            yield {
              type: 'token' as const,
              content: String(msgChunk.content),
              node: metadata?.langgraph_node || 'unknown',
            }
          }
        }
        break
      }
      case 'custom': {
        // data = config.writer() payload from tools
        yield { type: 'custom' as const, data }
        break
      }
      case 'updates': {
        // data = { nodeKey: stateUpdate } or __interrupt__
        if (data && '__interrupt__' in data) {
          // Handle interrupts
          for (const intr of data.__interrupt__) {
            yield { type: 'interrupt' as const, data: intr.value }
          }
          return // Stop — waiting for user response
        }
        break
      }
    }
  }

  yield { type: 'done' as const }
}

// ─── Resume After Interrupt ───

export async function* resumeGraph(resumeValue: unknown) {
  const graph = getGraph()

  const config = {
    configurable: { thread_id: currentThreadId },
  }

  const stream = await graph.stream(new Command({ resume: resumeValue }), {
    ...config,
    streamMode: ['messages', 'custom', 'updates'] as const,
  })

  for await (const chunk of stream) {
    const [mode, data] = chunk as [string, any]

    switch (mode) {
      case 'messages': {
        const [msgChunk, metadata] = data
        if (msgChunk._getType() === 'ai' && msgChunk.content) {
          if (metadata?.langgraph_node !== 'supervisor') {
            yield {
              type: 'token' as const,
              content: String(msgChunk.content),
              node: metadata?.langgraph_node || 'unknown',
            }
          }
        }
        break
      }
      case 'custom': {
        yield { type: 'custom' as const, data }
        break
      }
      case 'updates': {
        if (data && '__interrupt__' in data) {
          for (const intr of data.__interrupt__) {
            yield { type: 'interrupt' as const, data: intr.value }
          }
          return
        }
        break
      }
    }
  }

  yield { type: 'done' as const }
}
```

- [ ] **Step 3: Commit**

```bash
git add agent/supervisor.ts agent/graph.ts
git commit -m "feat(v3): create supervisor + graph with stream() multi-mode"
```

---

### Task 6: Rewrite electron/main.ts

**Files:**
- Create: `electron/main.ts`

- [ ] **Step 1: Rewrite electron/main.ts**

```typescript
// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let agentModule: typeof import('../agent/graph.js') | null = null

async function loadAgentModule() {
  if (!agentModule) {
    agentModule = await import('../agent/graph.js')
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await loadAgentModule()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── Reset ───

ipcMain.on('agent:reset', () => {
  agentModule?.resetSession()
})

// ─── Streaming Message Handler ───

ipcMain.on('agent:message', async (event, { message, searchEnabled }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !agentModule) return

  try {
    for await (const evt of agentModule.streamGraph(message, searchEnabled ?? true)) {
      if (win.isDestroyed()) break

      switch (evt.type) {
        case 'token':
          win.webContents.send('stream:token', { content: evt.content, node: evt.node })
          break
        case 'custom':
          win.webContents.send('stream:custom', evt.data)
          break
        case 'interrupt': {
          const data = evt.data as any
          if (data?.type === 'clarify') {
            win.webContents.send('stream:interrupt', {
              interruptType: 'clarify',
              id: Date.now().toString(),
              question: data.question,
              options: data.options || [],
            })
          } else if (data?.type === 'confirm') {
            win.webContents.send('stream:interrupt', {
              interruptType: 'confirm',
              id: Date.now().toString(),
              action: data.action,
              description: data.description,
              scriptId: data.scriptId,
            })
          }
          // Set timeout for HITL response
          const timeout = setTimeout(() => {
            if (!win.isDestroyed()) {
              win.webContents.send('stream:error', {
                message: '응답 시간이 초과되었습니다.',
              })
            }
          }, 60000)
          ;(win as any).__hitlTimeout = timeout
          return // Stop streaming — waiting for user response
        }
        case 'done':
          win.webContents.send('stream:done', {})
          break
      }
    }
  } catch (err) {
    if (!win.isDestroyed()) {
      const message = err instanceof Error ? err.message : String(err)
      win.webContents.send('stream:error', { message })
    }
  }
})

// ─── HITL Resume ───

async function resumeAndStream(win: BrowserWindow, resumeValue: unknown) {
  if (!agentModule) return
  try {
    for await (const evt of agentModule.resumeGraph(resumeValue)) {
      if (win.isDestroyed()) break
      switch (evt.type) {
        case 'token':
          win.webContents.send('stream:token', { content: evt.content, node: evt.node })
          break
        case 'custom':
          win.webContents.send('stream:custom', evt.data)
          break
        case 'interrupt': {
          const data = evt.data as any
          if (data?.type === 'clarify') {
            win.webContents.send('stream:interrupt', {
              interruptType: 'clarify',
              id: Date.now().toString(),
              question: data.question,
              options: data.options || [],
            })
          } else if (data?.type === 'confirm') {
            win.webContents.send('stream:interrupt', {
              interruptType: 'confirm',
              id: Date.now().toString(),
              action: data.action,
              description: data.description,
              scriptId: data.scriptId,
            })
          }
          const timeout = setTimeout(() => {
            if (!win.isDestroyed()) {
              win.webContents.send('stream:error', { message: '응답 시간이 초과되었습니다.' })
            }
          }, 60000)
          ;(win as any).__hitlTimeout = timeout
          return
        }
        case 'done':
          win.webContents.send('stream:done', {})
          break
      }
    }
  } catch (err) {
    if (!win.isDestroyed()) {
      const message = err instanceof Error ? err.message : String(err)
      win.webContents.send('stream:error', { message })
    }
  }
}

ipcMain.on('agent:confirm:response', (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
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

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat(v3): rewrite electron main with stream() consumption"
```

---

### Task 7: Update preload bridge and frontend store

**Files:**
- Modify: `electron/preload.js`
- Modify: `electron/preload.ts`
- Modify: `src/stores/chat.ts`

- [ ] **Step 1: Update preload.js**

```javascript
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Fire-and-forget message send
  sendMessage: (message, searchEnabled) => {
    ipcRenderer.send('agent:message', { message, searchEnabled })
  },

  // Stream listeners
  onStreamToken: (callback) => {
    ipcRenderer.on('stream:token', (_event, data) => callback(data))
  },
  onStreamCustom: (callback) => {
    ipcRenderer.on('stream:custom', (_event, data) => callback(data))
  },
  onStreamDone: (callback) => {
    ipcRenderer.on('stream:done', (_event, data) => callback(data))
  },
  onStreamError: (callback) => {
    ipcRenderer.on('stream:error', (_event, data) => callback(data))
  },
  onStreamInterrupt: (callback) => {
    ipcRenderer.on('stream:interrupt', (_event, data) => callback(data))
  },

  // HITL response senders
  sendConfirmResponse: (response) => {
    ipcRenderer.send('agent:confirm:response', response)
  },
  sendClarifyResponse: (response) => {
    ipcRenderer.send('agent:clarify:response', response)
  },

  // Reset conversation
  resetConversation: () => {
    ipcRenderer.send('agent:reset')
  },

  // Cleanup
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
```

- [ ] **Step 2: Update preload.ts**

```typescript
// electron/preload.ts
export interface ElectronAPI {
  sendMessage: (message: string, searchEnabled: boolean) => void
  onStreamToken: (callback: (data: { content: string; node: string }) => void) => void
  onStreamCustom: (callback: (data: any) => void) => void
  onStreamDone: (callback: (data: Record<string, never>) => void) => void
  onStreamError: (callback: (data: { message: string }) => void) => void
  onStreamInterrupt: (callback: (data: any) => void) => void
  sendConfirmResponse: (response: { id: string; confirmed: boolean }) => void
  sendClarifyResponse: (response: { id: string; selected: string[]; freeText?: string }) => void
  resetConversation: () => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

- [ ] **Step 3: Update src/stores/chat.ts**

Replace `onStreamStep` with `onStreamCustom`, add `onStreamInterrupt`, remove `toggleSearch` IPC (search toggle is now sent with each message), update `onStreamDone` to not expect `response`/`agentName`/`sources` (these come through tokens and custom events now):

```typescript
// src/stores/chat.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

interface ResearchSource {
  title: string
  content: string
  sourceType: string
  url?: string
  documentId?: string
  metadata?: Record<string, unknown>
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  steps?: Array<{ type: string; [key: string]: any }>
  sources?: ResearchSource[]
  isStreaming?: boolean
}

interface ConfirmRequest {
  id: string
  action: string
  description: string
  scriptId?: string
}

interface ClarifyRequest {
  id: string
  question: string
  options: Array<{ label: string; value: string }>
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([
    {
      role: 'assistant',
      content: '안녕하세요! Design Assistant입니다.\n\nCAD 설계 질문, PC 진단, 정보 검색 등 무엇이든 물어보세요.',
      timestamp: Date.now(),
    },
  ])
  const isLoading = ref(false)
  const searchEnabled = ref(true)
  const lastError = ref<{ message: string } | null>(null)
  const lastUserMessage = ref<string | null>(null)

  // HITL state
  const pendingConfirm = ref<ConfirmRequest | null>(null)
  const pendingClarify = ref<ClarifyRequest | null>(null)

  let listenersSetup = false

  function setupListeners() {
    if (listenersSetup || !window.electronAPI) return
    listenersSetup = true

    window.electronAPI.resetConversation()

    window.electronAPI.onStreamToken((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.content += data.content
      }
    })

    window.electronAPI.onStreamCustom((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        if (!lastMsg.steps) lastMsg.steps = []
        lastMsg.steps.push(data)

        // Collect sources from custom events
        if (data.type === 'source_found' && data.title && data.url) {
          if (!lastMsg.sources) lastMsg.sources = []
          if (!lastMsg.sources.some((s: ResearchSource) => s.title === data.title)) {
            lastMsg.sources.push({
              title: data.title,
              content: data.snippet || '',
              sourceType: 'wikipedia',
              url: data.url,
            })
          }
        }
      }
    })

    window.electronAPI.onStreamDone(() => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.isStreaming = false
      }
      isLoading.value = false
      lastError.value = null
    })

    window.electronAPI.onStreamError((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.content = `오류가 발생했습니다: ${data.message}`
        lastMsg.isStreaming = false
      }
      isLoading.value = false
      lastError.value = data
    })

    window.electronAPI.onStreamInterrupt((data) => {
      if (data.interruptType === 'confirm') {
        pendingConfirm.value = {
          id: data.id,
          action: data.action,
          description: data.description,
          scriptId: data.scriptId,
        }
      } else if (data.interruptType === 'clarify') {
        pendingClarify.value = {
          id: data.id,
          question: data.question,
          options: data.options || [],
        }
      }
    })
  }

  function sendMessage(text: string) {
    setupListeners()

    lastUserMessage.value = text
    lastError.value = null

    messages.value.push({
      role: 'user',
      content: text,
      timestamp: Date.now(),
    })

    messages.value.push({
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      steps: [],
    })

    isLoading.value = true

    if (window.electronAPI) {
      window.electronAPI.sendMessage(text, searchEnabled.value)
    } else {
      setTimeout(() => {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.isStreaming) {
          lastMsg.content = `[Mock] "${text}" — Electron 환경에서 실제 AI 응답이 표시됩니다.`
          lastMsg.isStreaming = false
        }
        isLoading.value = false
      }, 800)
    }
  }

  function retryLastMessage() {
    if (lastUserMessage.value) {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') messages.value.pop()
      const prevMsg = messages.value[messages.value.length - 1]
      if (prevMsg && prevMsg.role === 'user') messages.value.pop()
      sendMessage(lastUserMessage.value)
    }
  }

  function dismissError() {
    lastError.value = null
  }

  function respondToConfirm(confirmed: boolean) {
    if (pendingConfirm.value && window.electronAPI) {
      window.electronAPI.sendConfirmResponse({
        id: String(pendingConfirm.value.id),
        confirmed: !!confirmed,
      })
      pendingConfirm.value = null
    }
  }

  function respondToClarify(selected: string[], freeText?: string) {
    if (pendingClarify.value && window.electronAPI) {
      window.electronAPI.sendClarifyResponse({
        id: String(pendingClarify.value.id),
        selected: [...selected],
        freeText: freeText || undefined,
      })
      pendingClarify.value = null
    }
  }

  function toggleSearch(enabled: boolean) {
    searchEnabled.value = enabled
  }

  function clearChat() {
    messages.value = [{
      role: 'assistant',
      content: '안녕하세요! Design Assistant입니다.\n\nCAD 설계 질문, PC 진단, 정보 검색 등 무엇이든 물어보세요.',
      timestamp: Date.now(),
    }]
    lastError.value = null
  }

  return {
    messages,
    isLoading,
    searchEnabled,
    lastError,
    pendingConfirm,
    pendingClarify,
    sendMessage,
    retryLastMessage,
    dismissError,
    respondToConfirm,
    respondToClarify,
    toggleSearch,
    clearChat,
  }
})
```

- [ ] **Step 4: Commit**

```bash
git add electron/preload.js electron/preload.ts src/stores/chat.ts
git commit -m "feat(v3): update preload bridge and frontend store for new IPC"
```

---

### Task 8: Delete old files and verify build

**Files:**
- Delete: `agent/state.ts`
- Delete: `agent/agents/answer-agent.ts`
- Delete: `agent/history/conversation-manager.ts`
- Delete: `agent/tools/wiki-search.ts`

- [ ] **Step 1: Delete old files**

```bash
rm agent/state.ts agent/agents/answer-agent.ts agent/history/conversation-manager.ts agent/tools/wiki-search.ts
```

- [ ] **Step 2: Verify no import references remain**

```bash
grep -r "state\.js\|answer-agent\|conversation-manager\|wiki-search\.js" agent/ electron/ src/ --include="*.ts" --include="*.js" --include="*.vue"
```

Expected: no results (all old imports have been replaced in previous tasks).

- [ ] **Step 3: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite starts on port 5173, Electron window opens without import errors.

- [ ] **Step 4: Commit**

```bash
git rm agent/state.ts agent/agents/answer-agent.ts agent/history/conversation-manager.ts agent/tools/wiki-search.ts
git add -A
git commit -m "feat(v3): remove deprecated files, complete v3 migration"
```

---

### Task 9: Integration test — manual smoke test

- [ ] **Step 1: Test basic chat**

Send "안녕" → should route to chat agent, get a short response.

- [ ] **Step 2: Test research flow**

Send "CAD란 무엇인가?" → should route to research, show custom stream events (search_start, search_result, source_found), get answer with sources.

- [ ] **Step 3: Test ask_user interrupt**

Send "삼성에 대해 알려줘" → may trigger ask_user interrupt (which Samsung?). Verify ClarificationCard appears, select an option, verify research continues.

- [ ] **Step 4: Test conversation memory**

Send "더 자세히 알려줘" after a research answer → should route to chat with context from previous conversation via MemorySaver.

- [ ] **Step 5: Test reset**

Click reset → send "이전에 뭘 물어봤지?" → should not remember previous conversation.
