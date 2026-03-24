# v2 Multi-Agent Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the POC single-router architecture to a Supervisor + ReAct multi-agent system with streaming, Human-in-the-Loop, and conversation history management.

**Architecture:** Supervisor agent delegates to Search Agent (Wiki + ReAct), PC Fix Agent (diagnostics + batch scripts + ReAct), and Chat Agent. LangGraph.js `createReactAgent` for sub-agents, `MemorySaver` checkpointer for interrupt/resume, Electron IPC event streaming.

**Tech Stack:** LangGraph.js, LangChain, Vue 3, Electron, Pinia, systeminformation, Wikipedia API

**Spec:** `docs/superpowers/specs/2026-03-24-v2-multiagent-design.md`

---

## File Structure

### Files to Delete
- `agent/rag/loader.ts` — RAG markdown loader
- `agent/rag/vectorstore.ts` — MemoryVectorStore with OpenAI embeddings
- `agent/nodes/router.ts` — Single-route classifier
- `agent/nodes/rag.ts` — RAG search node
- `agent/nodes/ui-action.ts` — UI action executor node
- `agent/nodes/chat.ts` — Chat node (will be rewritten as agent)
- `agent/nodes/diagnostic.ts` — Diagnostic node (will be rewritten as agent)
- `agent/tools/ui-functions.ts` — UI function registry
- `resources/knowledge-base/catia-basics.md`
- `resources/knowledge-base/design-workflow.md`
- `resources/knowledge-base/pc-troubleshooting.md`

### Files to Create
- `agent/agents/chat-agent.ts` — Simple LLM chat agent
- `agent/agents/search-agent.ts` — Wiki search ReAct agent
- `agent/agents/pc-fix-agent.ts` — PC diagnostic + script ReAct agent
- `agent/supervisor.ts` — Supervisor that delegates to sub-agents
- `agent/tools/wiki-search.ts` — Wikipedia keyword search LangChain tool
- `agent/tools/script-runner.ts` — Batch script executor LangChain tool
- `agent/history/conversation-manager.ts` — Conversation window + summarization
- `src/components/ConfirmDialog.vue` — HITL confirmation dialog
- `src/components/ClarificationCard.vue` — Clarification options + text input
- `src/components/ErrorRetryCard.vue` — Error retry/cancel card
- `src/components/SearchToggle.vue` — Search feature ON/OFF toggle
- `resources/scripts/registry.json` — Script-to-symptom mapping
- `resources/scripts/fix-network.bat` — Example network fix script
- `resources/scripts/clear-dns-cache.ps1` — Example DNS cache clear script
- `resources/scripts/clear-temp-files.bat` — Example temp file cleanup script

### Files to Modify
- `agent/graph.ts` — Rewrite: Supervisor-based graph with MemorySaver + streaming
- `agent/state.ts` — Update: New state annotation for multi-agent
- `agent/types.ts` — Update: Remove UI action types, add streaming/HITL types
- `agent/llm-factory.ts` — Update: Remove createEmbeddings()
- `agent/tools/pc-diagnostic.ts` — Update: Wrap plain functions as LangChain tools
- `electron/main.ts` — Update: Streaming IPC, HITL IPC, fire-and-forget pattern
- `electron/preload.js` — Update: New IPC channels for streaming/HITL
- `electron/preload.ts` — Update: Type definitions for new IPC
- `src/stores/chat.ts` — Update: Streaming-based message handling, HITL state
- `src/components/ChatWindow.vue` — Update: Streaming rendering, HITL integration
- `src/components/MessageBubble.vue` — Update: ReAct step display
- `src/App.vue` — Update: SearchToggle integration, error/HITL components
- `package.json` — Update: Add/remove dependencies
- `.env` — Update: New env vars, remove old ones
- `.env.example` — Update: Match .env changes

---

## Task 1: Dependencies & Cleanup

Remove old code and update dependencies.

**Files:**
- Delete: `agent/rag/`, `agent/nodes/router.ts`, `agent/nodes/rag.ts`, `agent/nodes/ui-action.ts`, `agent/nodes/chat.ts`, `agent/nodes/diagnostic.ts`, `agent/tools/ui-functions.ts`, `resources/knowledge-base/`
- Modify: `package.json`, `agent/llm-factory.ts`

- [ ] **Step 1: Install new dependencies, remove old ones**

```bash
cd /Users/gangbyeong-gon/Source/design-assistant
npm uninstall faiss-node @langchain/community
```

Note: `@langchain/community` removed — wiki search uses native `fetch()` against Wikipedia REST API. `@langchain/langgraph-supervisor` is NOT installed — we build a custom Supervisor with `StateGraph` + conditional edges + `Send` API for more control over parallel execution and HITL flows.

- [ ] **Step 2: Delete RAG files**

```bash
rm -rf agent/rag/
rm -f agent/nodes/rag.ts
rm -rf resources/knowledge-base/
```

- [ ] **Step 3: Delete UI Action files**

```bash
rm -f agent/nodes/ui-action.ts
rm -f agent/tools/ui-functions.ts
```

- [ ] **Step 4: Delete Router node**

```bash
rm -f agent/nodes/router.ts
```

- [ ] **Step 5: Delete remaining old nodes (chat, diagnostic) and stub graph.ts**

```bash
rm -f agent/nodes/chat.ts
rm -f agent/nodes/diagnostic.ts
rmdir agent/nodes  # Remove empty directory
```

Immediately stub `agent/graph.ts` so the project remains compilable:

```typescript
import type { BaseMessage } from '@langchain/core/messages'

// Stub — will be fully rewritten in Task 10
export async function processMessage(
  userMessage: string,
  history: BaseMessage[] = [],
  threadId: string = 'default',
  searchEnabled: boolean = true,
) {
  return {
    response: '[v2 graph not yet wired]',
    agentName: 'chat' as const,
    diagnosticResults: null,
    messages: history,
  }
}
```

- [ ] **Step 6: Remove `createEmbeddings()` from llm-factory.ts**

Edit `agent/llm-factory.ts`:
- Remove `OpenAIEmbeddings` import from `@langchain/openai`
- Remove entire `createEmbeddings()` function
- Keep `createLLM()` function intact

Result:
```typescript
import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { LLMOptions } from './types.js'
import 'dotenv/config'

export function createLLM(options: LLMOptions = {}): BaseChatModel {
  const provider = process.env.LLM_PROVIDER || 'openai'

  switch (provider) {
    case 'anthropic':
      return new ChatAnthropic({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
        apiKey: process.env.ANTHROPIC_API_KEY,
      })

    case 'openai':
    default:
      return new ChatOpenAI({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
        apiKey: process.env.OPENAI_API_KEY,
      })
  }
}
```

- [ ] **Step 7: Update .env and .env.example**

Remove from `.env`:
```
KNOWLEDGE_BASE_PATH=./resources/knowledge-base
EMBEDDING_MODEL=text-embedding-3-small
```

Add to `.env`:
```
# v2 Settings
WIKI_SEARCH_TOP_K=3
REACT_MAX_ITERATIONS=5
SCRIPT_BASE_PATH=./resources/scripts
CONVERSATION_WINDOW_SIZE=10
DEBUG_REACT_STEPS=false
```

Update `.env.example` similarly (remove RAG settings, add v2 settings).

- [ ] **Step 8: Delete old tests that reference removed modules**

```bash
rm -f tests/rag-loader.test.ts
rm -f tests/ui-functions.test.ts
rm -f tests/graph-routing.test.ts
rm -f tests/integration.test.ts
```

Keep `tests/pc-diagnostic.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove RAG, UI Action, Router — prepare for v2 multi-agent"
```

---

## Task 2: Types & State

Update shared types and state annotation for v2.

**Files:**
- Modify: `agent/types.ts`, `agent/state.ts`

- [ ] **Step 1: Update agent/types.ts**

Remove `UIActionName`, `UIAction`, `RouteType`, `AgentState` types.
Add new types:

```typescript
import type { BaseMessage } from '@langchain/core/messages'

// ─── System Information (unchanged) ───
// Keep all existing: OsInfo, CpuInfo, MemoryInfo, GpuInfo, DiskInfo, SystemInfo,
// InstalledProgram, FilePathResult, NetworkResult, NetworkTarget, DiagnosticResult

// ─── LLM ───
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

// ─── Streaming ───
export type StreamEventType = 'token' | 'step' | 'done' | 'error'

export interface StreamToken {
  type: 'token'
  content: string
}

export interface StreamStep {
  type: 'step'
  step: 'thinking' | 'action' | 'observation'
  summary: string
}

export interface StreamDone {
  type: 'done'
  response: string
  diagnosticResults?: DiagnosticResult | null
}

export interface StreamError {
  type: 'error'
  message: string
  errorType: 'api_error' | 'timeout' | 'script_error' | 'unknown'
}

export type StreamEvent = StreamToken | StreamStep | StreamDone | StreamError

// ─── Human-in-the-Loop ───
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

// ─── Agent State ───
export type AgentName = 'search' | 'pc_fix' | 'chat'

export interface SupervisorState {
  messages: BaseMessage[]
  agentName: AgentName | null
  response: string | null
  diagnosticResults: DiagnosticResult | null
  searchEnabled: boolean
  summary: string | null
}
```

- [ ] **Step 2: Update agent/state.ts**

```typescript
import { Annotation } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'
import type { AgentName, DiagnosticResult } from './types.js'

export const SupervisorAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  agentName: Annotation<AgentName | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  response: Annotation<string | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  diagnosticResults: Annotation<DiagnosticResult | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  searchEnabled: Annotation<boolean>({
    reducer: (_x, y) => y,
    default: () => true,
  }),
  summary: Annotation<string | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
})

export type SupervisorStateType = typeof SupervisorAnnotation.State
```

- [ ] **Step 3: Commit**

```bash
git add agent/types.ts agent/state.ts
git commit -m "feat: update types and state annotation for v2 multi-agent"
```

---

## Task 3: Tools — Wiki Search

Create Wikipedia keyword search as a LangChain tool.

**Files:**
- Create: `agent/tools/wiki-search.ts`
- Create: `tests/wiki-search.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/wiki-search.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { wikiSearchTool } from '../agent/tools/wiki-search.js'

describe('wikiSearchTool', () => {
  it('should be a valid LangChain tool with correct metadata', () => {
    expect(wikiSearchTool.name).toBe('wiki_search')
    expect(wikiSearchTool.description).toBeDefined()
  })

  it('should return search results for a valid query', async () => {
    const result = await wikiSearchTool.invoke({ query: 'Python programming language' })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  }, 15000)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/wiki-search.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement wiki-search.ts**

Create `agent/tools/wiki-search.ts`:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const TOP_K = parseInt(process.env.WIKI_SEARCH_TOP_K || '3', 10)

async function searchWikipedia(query: string, topK: number): Promise<string> {
  // Step 1: Search for page titles
  const searchUrl = new URL('https://en.wikipedia.org/w/api.php')
  searchUrl.searchParams.set('action', 'query')
  searchUrl.searchParams.set('list', 'search')
  searchUrl.searchParams.set('srsearch', query)
  searchUrl.searchParams.set('srlimit', String(topK))
  searchUrl.searchParams.set('format', 'json')
  searchUrl.searchParams.set('origin', '*')

  const searchRes = await fetch(searchUrl.toString())
  const searchData = await searchRes.json() as {
    query: { search: Array<{ title: string; snippet: string }> }
  }

  const pages = searchData.query?.search
  if (!pages || pages.length === 0) {
    return `No Wikipedia results found for "${query}".`
  }

  // Step 2: Fetch summaries for each page
  const summaries = await Promise.all(
    pages.map(async (page) => {
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`
      try {
        const res = await fetch(summaryUrl)
        const data = await res.json() as { title: string; extract: string }
        return `## ${data.title}\n${data.extract}`
      } catch {
        return `## ${page.title}\n${page.snippet.replace(/<[^>]*>/g, '')}`
      }
    })
  )

  return summaries.join('\n\n---\n\n')
}

export const wikiSearchTool = tool(
  async ({ query }) => {
    return searchWikipedia(query, TOP_K)
  },
  {
    name: 'wiki_search',
    description: 'Search Wikipedia for information. Input should be a search query keyword. Returns summaries of top matching articles.',
    schema: z.object({
      query: z.string().describe('The search query to look up on Wikipedia'),
    }),
  }
)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/wiki-search.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent/tools/wiki-search.ts tests/wiki-search.test.ts
git commit -m "feat: add Wikipedia keyword search LangChain tool"
```

---

## Task 4: Tools — Wrap PC Diagnostic as LangChain Tools

Wrap existing plain functions as LangChain `tool()` wrappers for use with `createReactAgent`.

**Files:**
- Modify: `agent/tools/pc-diagnostic.ts`
- Modify: `tests/pc-diagnostic.test.ts`

- [ ] **Step 1: Add LangChain tool wrappers to pc-diagnostic.ts**

Keep all existing functions unchanged. Add tool wrappers at the bottom of the file:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

// ... (keep all existing code above) ...

// ─── LangChain Tool Wrappers ───

export const systemInfoTool = tool(
  async () => {
    const info = await getSystemInfo()
    return JSON.stringify(info, null, 2)
  },
  {
    name: 'get_system_info',
    description: 'Get detailed PC system information including OS, CPU, memory, GPU, and disk usage.',
    schema: z.object({}),
  }
)

export const installedProgramsTool = tool(
  async () => {
    const programs = await getInstalledPrograms()
    return JSON.stringify(programs, null, 2)
  },
  {
    name: 'get_installed_programs',
    description: 'List all installed programs/applications on the PC.',
    schema: z.object({}),
  }
)

export const networkCheckTool = tool(
  async ({ targets }) => {
    const parsedTargets: NetworkTarget[] = targets.map(t => {
      if (t.includes(':')) {
        const [host, port] = t.split(':')
        return { host, port: parseInt(port, 10) }
      }
      return t
    })
    const results = await checkNetwork(parsedTargets)
    return JSON.stringify(results, null, 2)
  },
  {
    name: 'check_network',
    description: 'Check network connectivity by testing DNS resolution and port reachability for given hosts.',
    schema: z.object({
      targets: z.array(z.string()).describe('List of hosts to check, optionally with port (e.g., "google.com", "8.8.8.8:53")'),
    }),
  }
)

export const fullDiagnosticTool = tool(
  async ({ query }) => {
    const result = await runDiagnostics(query)
    return JSON.stringify(result, null, 2)
  },
  {
    name: 'run_full_diagnostic',
    description: 'Run a comprehensive PC diagnostic including system info, installed programs, and network checks. Use this when the user reports a general PC problem.',
    schema: z.object({
      query: z.string().describe('The user symptom or question that triggered this diagnostic'),
    }),
  }
)
```

- [ ] **Step 2: Update test to verify tool wrappers exist**

Add to `tests/pc-diagnostic.test.ts`:

```typescript
import { systemInfoTool, installedProgramsTool, networkCheckTool, fullDiagnosticTool } from '../agent/tools/pc-diagnostic.js'

describe('LangChain tool wrappers', () => {
  it('should export valid tool objects', () => {
    expect(systemInfoTool.name).toBe('get_system_info')
    expect(installedProgramsTool.name).toBe('get_installed_programs')
    expect(networkCheckTool.name).toBe('check_network')
    expect(fullDiagnosticTool.name).toBe('run_full_diagnostic')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/pc-diagnostic.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add agent/tools/pc-diagnostic.ts tests/pc-diagnostic.test.ts
git commit -m "feat: wrap PC diagnostic functions as LangChain tools"
```

---

## Task 5: Tools — Script Runner

Create batch script execution tool with whitelist enforcement.

**Files:**
- Create: `agent/tools/script-runner.ts`
- Create: `resources/scripts/registry.json`
- Create: `resources/scripts/fix-network.bat`
- Create: `resources/scripts/clear-dns-cache.ps1`
- Create: `resources/scripts/clear-temp-files.bat`
- Create: `tests/script-runner.test.ts`

- [ ] **Step 1: Create scripts directory and registry.json**

```bash
mkdir -p /Users/gangbyeong-gon/Source/design-assistant/resources/scripts
```

Create `resources/scripts/registry.json`:

```json
{
  "scripts": [
    {
      "id": "fix-network",
      "name": "네트워크 초기화",
      "description": "DNS 캐시 초기화 및 네트워크 어댑터 재시작",
      "file": "fix-network.bat",
      "platform": "windows",
      "symptoms": ["인터넷 연결 안 됨", "DNS 오류", "네트워크 느림"],
      "category": "network"
    },
    {
      "id": "clear-dns-cache",
      "name": "DNS 캐시 초기화",
      "description": "DNS 캐시를 비우고 DNS 클라이언트 서비스를 재시작",
      "file": "clear-dns-cache.ps1",
      "platform": "windows",
      "symptoms": ["DNS 오류", "특정 사이트 접속 불가", "도메인 해석 실패"],
      "category": "network"
    },
    {
      "id": "clear-temp",
      "name": "임시 파일 정리",
      "description": "Windows 임시 폴더 및 브라우저 캐시 정리",
      "file": "clear-temp-files.bat",
      "platform": "windows",
      "symptoms": ["디스크 용량 부족", "PC 느림", "저장 공간 부족"],
      "category": "storage"
    }
  ]
}
```

- [ ] **Step 2: Create example batch scripts**

`resources/scripts/fix-network.bat`:
```bat
@echo off
echo [Fix Network] Starting network reset...
ipconfig /release
ipconfig /flushdns
ipconfig /renew
netsh winsock reset
echo [Fix Network] Network reset complete.
```

`resources/scripts/clear-dns-cache.ps1`:
```powershell
Write-Host "[DNS Cache] Clearing DNS cache..."
Clear-DnsClientCache
Restart-Service -Name Dnscache -Force
Write-Host "[DNS Cache] DNS cache cleared and service restarted."
```

`resources/scripts/clear-temp-files.bat`:
```bat
@echo off
echo [Temp Cleanup] Cleaning temporary files...
del /q /f /s %TEMP%\* 2>nul
del /q /f /s C:\Windows\Temp\* 2>nul
echo [Temp Cleanup] Temporary files cleaned.
```

- [ ] **Step 3: Write the failing test**

Create `tests/script-runner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scriptRunnerTool, listAvailableScripts } from '../agent/tools/script-runner.js'

describe('scriptRunnerTool', () => {
  it('should be a valid LangChain tool', () => {
    expect(scriptRunnerTool.name).toBe('run_script')
    expect(scriptRunnerTool.description).toBeDefined()
  })

  it('should reject scripts not in the registry', async () => {
    const result = await scriptRunnerTool.invoke({ scriptId: 'malicious-script' })
    expect(result).toContain('not found in registry')
  })
})

describe('listAvailableScripts', () => {
  it('should return registered scripts', () => {
    const scripts = listAvailableScripts()
    expect(scripts.length).toBeGreaterThan(0)
    expect(scripts[0]).toHaveProperty('id')
    expect(scripts[0]).toHaveProperty('name')
    expect(scripts[0]).toHaveProperty('symptoms')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run tests/script-runner.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement script-runner.ts**

Create `agent/tools/script-runner.ts`:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { ScriptEntry, ScriptRegistry } from '../types.js'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SCRIPT_BASE_PATH = process.env.SCRIPT_BASE_PATH
  || path.resolve(__dirname, '../../resources/scripts')

function loadRegistry(): ScriptRegistry {
  const registryPath = path.join(SCRIPT_BASE_PATH, 'registry.json')
  const raw = fs.readFileSync(registryPath, 'utf-8')
  return JSON.parse(raw) as ScriptRegistry
}

export function listAvailableScripts(): ScriptEntry[] {
  return loadRegistry().scripts
}

export function getScriptById(scriptId: string): ScriptEntry | undefined {
  return loadRegistry().scripts.find(s => s.id === scriptId)
}

export const scriptRunnerTool = tool(
  async ({ scriptId }) => {
    const entry = getScriptById(scriptId)
    if (!entry) {
      return `Error: Script "${scriptId}" not found in registry. Available: ${listAvailableScripts().map(s => s.id).join(', ')}`
    }

    const scriptPath = path.join(SCRIPT_BASE_PATH, entry.file)
    if (!fs.existsSync(scriptPath)) {
      return `Error: Script file "${entry.file}" does not exist at ${scriptPath}`
    }

    // Determine command based on file extension
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
      const output = [stdout, stderr].filter(Boolean).join('\n')
      return `Script "${entry.name}" executed successfully.\n\nOutput:\n${output}`
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return `Script "${entry.name}" failed: ${message}`
    }
  },
  {
    name: 'run_script',
    description: 'Execute a pre-defined fix script by its ID. Only scripts registered in registry.json can be run. Use list_scripts first to see available options.',
    schema: z.object({
      scriptId: z.string().describe('The ID of the script to execute (from registry.json)'),
    }),
  }
)

export const listScriptsTool = tool(
  async () => {
    const scripts = listAvailableScripts()
    return JSON.stringify(scripts.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      symptoms: s.symptoms,
      category: s.category,
    })), null, 2)
  },
  {
    name: 'list_scripts',
    description: 'List all available fix scripts with their IDs, descriptions, and symptom mappings.',
    schema: z.object({}),
  }
)
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run tests/script-runner.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add agent/tools/script-runner.ts resources/scripts/ tests/script-runner.test.ts
git commit -m "feat: add script runner tool with whitelist registry"
```

---

## Task 6: Conversation History Manager

Manage recent N messages + LLM summarization of older conversations.

**Files:**
- Create: `agent/history/conversation-manager.ts`
- Create: `tests/conversation-manager.test.ts`

- [ ] **Step 1: Create agent/history/ directory**

```bash
mkdir -p /Users/gangbyeong-gon/Source/design-assistant/agent/history
```

- [ ] **Step 2: Write the failing test**

Create `tests/conversation-manager.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ConversationManager } from '../agent/history/conversation-manager.js'
import { HumanMessage, AIMessage } from '@langchain/core/messages'

describe('ConversationManager', () => {
  it('should keep recent messages within window size', () => {
    const manager = new ConversationManager(4)
    manager.addMessage(new HumanMessage('Hello'))
    manager.addMessage(new AIMessage('Hi'))
    manager.addMessage(new HumanMessage('How are you?'))
    manager.addMessage(new AIMessage('Good!'))

    const messages = manager.getMessages()
    expect(messages.length).toBe(4)
  })

  it('should return summary as first system message when messages exceed window', async () => {
    const manager = new ConversationManager(2)
    manager.addMessage(new HumanMessage('msg1'))
    manager.addMessage(new AIMessage('reply1'))
    manager.addMessage(new HumanMessage('msg2'))
    manager.addMessage(new AIMessage('reply2'))

    // After exceeding window, summarize should be called
    // For unit test, we mock by setting summary directly
    manager.setSummary('Previously discussed: msg1 and reply1')
    const messages = manager.getMessages()

    // Should have summary + recent messages within window
    expect(messages.length).toBeLessThanOrEqual(3) // 1 summary + 2 recent
  })

  it('should clear all messages on reset', () => {
    const manager = new ConversationManager(10)
    manager.addMessage(new HumanMessage('test'))
    manager.reset()
    expect(manager.getMessages().length).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/conversation-manager.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement conversation-manager.ts**

Create `agent/history/conversation-manager.ts`:

```typescript
import type { BaseMessage } from '@langchain/core/messages'
import { SystemMessage } from '@langchain/core/messages'
import { createLLM } from '../llm-factory.js'

const WINDOW_SIZE = parseInt(process.env.CONVERSATION_WINDOW_SIZE || '10', 10)

const SUMMARIZE_PROMPT = `다음 대화 내용을 간결하게 요약하세요. 핵심 주제, 해결된 문제, 중요한 결정사항만 포함하세요. 한국어로 작성하세요.`

export class ConversationManager {
  private allMessages: BaseMessage[] = []
  private summary: string | null = null
  private windowSize: number

  constructor(windowSize: number = WINDOW_SIZE) {
    this.windowSize = windowSize
  }

  addMessage(message: BaseMessage): void {
    this.allMessages.push(message)
  }

  setSummary(summary: string): void {
    this.summary = summary
  }

  getSummary(): string | null {
    return this.summary
  }

  getMessages(): BaseMessage[] {
    const result: BaseMessage[] = []

    if (this.summary) {
      result.push(new SystemMessage(`[이전 대화 요약] ${this.summary}`))
    }

    const recent = this.allMessages.slice(-this.windowSize)
    result.push(...recent)

    return result
  }

  async summarizeIfNeeded(): Promise<void> {
    if (this.allMessages.length <= this.windowSize) return

    const overflow = this.allMessages.slice(0, this.allMessages.length - this.windowSize)
    if (overflow.length === 0) return

    const llm = createLLM({ temperature: 0.3, maxTokens: 512 })
    const conversationText = overflow
      .map(m => `${m._getType()}: ${m.content}`)
      .join('\n')

    const response = await llm.invoke([
      new SystemMessage(SUMMARIZE_PROMPT),
      new SystemMessage(`대화 내용:\n${conversationText}`),
    ])

    const newSummary = String(response.content)
    this.summary = this.summary
      ? `${this.summary}\n${newSummary}`
      : newSummary

    // Keep only recent messages
    this.allMessages = this.allMessages.slice(-this.windowSize)
  }

  reset(): void {
    this.allMessages = []
    this.summary = null
  }

  getRecentCount(): number {
    return this.allMessages.length
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/conversation-manager.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add agent/history/conversation-manager.ts tests/conversation-manager.test.ts
git commit -m "feat: add conversation history manager with windowed summarization"
```

---

## Task 7: Chat Agent

Simple LLM chat agent (no ReAct).

**Files:**
- Create: `agent/agents/chat-agent.ts`

- [ ] **Step 1: Create agents directory and chat-agent.ts**

```bash
mkdir -p /Users/gangbyeong-gon/Source/design-assistant/agent/agents
```

Create `agent/agents/chat-agent.ts`:

```typescript
import { createLLM } from '../llm-factory.js'
import { SystemMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'

const CHAT_SYSTEM_PROMPT = `당신은 CAD 설계 엔지니어를 위한 어시스턴트입니다.
설계 워크플로우, 소프트웨어 도구, 엔지니어링 프로세스에 관한 질문을 도와드립니다.
간결하고 전문적으로 답변하세요. 사용자와 같은 언어로 응답하세요.`

export async function runChatAgent(messages: BaseMessage[]): Promise<string> {
  const llm = createLLM()
  const response = await llm.invoke([
    new SystemMessage(CHAT_SYSTEM_PROMPT),
    ...messages,
  ])
  return String(response.content)
}
```

- [ ] **Step 2: Commit**

```bash
git add agent/agents/chat-agent.ts
git commit -m "feat: add chat agent with simple LLM invocation"
```

---

## Task 8: Search Agent (ReAct)

Wikipedia search agent using `createReactAgent`.

**Files:**
- Create: `agent/agents/search-agent.ts`

- [ ] **Step 1: Create search-agent.ts**

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { createLLM } from '../llm-factory.js'
import { wikiSearchTool } from '../tools/wiki-search.js'

const MAX_ITERATIONS = parseInt(process.env.REACT_MAX_ITERATIONS || '5', 10)

const SEARCH_SYSTEM_PROMPT = `당신은 검색 전문 에이전트입니다.
사용자 질문에 답하기 위해 Wikipedia 검색 도구를 사용하세요.

규칙:
1. 사용자 질문에서 핵심 키워드를 추출하여 검색하세요.
2. 검색 결과가 부족하면 다른 키워드로 재검색하세요.
3. 충분한 정보를 확보하면 사용자의 언어로 답변을 생성하세요.
4. 검색 결과를 기반으로 정확하고 유용한 답변을 제공하세요.`

export function createSearchAgent() {
  const llm = createLLM({ temperature: 0.3 })

  return createReactAgent({
    llm,
    tools: [wikiSearchTool],
    prompt: SEARCH_SYSTEM_PROMPT,
    name: 'search_agent',
    recursionLimit: MAX_ITERATIONS * 2, // Each iteration = 2 steps (agent + tool)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add agent/agents/search-agent.ts
git commit -m "feat: add search agent with Wikipedia ReAct loop"
```

---

## Task 9: PC Fix Agent (ReAct)

PC diagnostics + script execution agent using `createReactAgent`.

**Files:**
- Create: `agent/agents/pc-fix-agent.ts`

- [ ] **Step 1: Create pc-fix-agent.ts**

The PC Fix Agent uses `interrupt()` to pause before executing scripts, requiring user confirmation via the HITL flow.

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { tool } from '@langchain/core/tools'
import { interrupt } from '@langchain/langgraph'
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
const MAX_ITERATIONS = parseInt(process.env.REACT_MAX_ITERATIONS || '5', 10)
const SCRIPT_BASE_PATH = process.env.SCRIPT_BASE_PATH || './resources/scripts'

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

// Script runner with HITL interrupt — pauses for user confirmation
const scriptRunnerWithConfirmTool = tool(
  async ({ scriptId }) => {
    const entry = getScriptById(scriptId)
    if (!entry) {
      return `Error: Script "${scriptId}" not found in registry.`
    }

    // Interrupt for user confirmation — graph pauses here
    const confirmed = interrupt({
      type: 'confirm',
      action: entry.name,
      description: entry.description,
      scriptId: entry.id,
    })

    if (!confirmed) {
      return `사용자가 "${entry.name}" 실행을 취소했습니다.`
    }

    // Execute the script
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
    description: 'Execute a fix script after getting user confirmation. This will pause and ask the user to approve before running.',
    schema: z.object({
      scriptId: z.string().describe('The ID of the script to execute'),
    }),
  }
)

export function createPCFixAgent() {
  const llm = createLLM({ temperature: 0.2 })

  return createReactAgent({
    llm,
    tools: [
      systemInfoTool,
      installedProgramsTool,
      networkCheckTool,
      fullDiagnosticTool,
      listScriptsTool,
      scriptRunnerWithConfirmTool,
    ],
    prompt: PC_FIX_SYSTEM_PROMPT,
    name: 'pc_fix_agent',
    recursionLimit: MAX_ITERATIONS * 2,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add agent/agents/pc-fix-agent.ts
git commit -m "feat: add PC fix agent with diagnostic and script tools"
```

---

## Task 10: Supervisor + Graph

Supervisor agent that routes to sub-agents. Rewrite `graph.ts`.

**Files:**
- Create: `agent/supervisor.ts`
- Modify: `agent/graph.ts`

- [ ] **Step 1: Create supervisor.ts**

The Supervisor classifies user intent, detects ambiguous requests for clarification, and supports parallel agent dispatch via `Send`.

```typescript
import { createLLM } from './llm-factory.js'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import type { AgentName } from './types.js'

const SUPERVISOR_SYSTEM_PROMPT = `당신은 CAD 설계 어시스턴트의 Supervisor입니다.
사용자 메시지를 분석하여 적절한 에이전트를 선택하세요.

응답 형식 (JSON):
{
  "agents": ["agent1", "agent2"],   // 호출할 에이전트 목록 (1~2개)
  "clarify": false,                 // true면 질문 맥락이 모호함
  "clarifyQuestion": "",            // clarify=true일 때 사용자에게 물어볼 질문
  "clarifyOptions": []              // clarify=true일 때 선택지 배열
}

에이전트 목록:
- "search": 지식 검색이 필요한 질문
- "pc_fix": PC 문제 진단/해결
- "chat": 일반 대화, 인사, 간단한 질문

규칙:
- 검색 + 진단이 동시에 필요하면 agents에 둘 다 포함
- 질문이 모호하면 clarify=true로 설정하고 구체적 선택지를 제시
- JSON만 반환하세요`

const VALID_AGENTS: AgentName[] = ['search', 'pc_fix', 'chat']

interface SupervisorDecision {
  agents: AgentName[]
  clarify: boolean
  clarifyQuestion?: string
  clarifyOptions?: Array<{ label: string; value: string }>
}

export async function classifyAgent(
  userMessage: string,
  searchEnabled: boolean,
): Promise<SupervisorDecision> {
  const llm = createLLM({ temperature: 0 })

  const response = await llm.invoke([
    new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
    new HumanMessage(`Classify: "${userMessage}"`),
  ])

  try {
    const parsed = JSON.parse(String(response.content)) as SupervisorDecision

    // Handle clarification — interrupt for user input
    if (parsed.clarify && parsed.clarifyQuestion) {
      const userChoice = interrupt({
        type: 'clarify',
        question: parsed.clarifyQuestion,
        options: parsed.clarifyOptions || [],
      })
      // After resume, re-classify with enriched context
      return classifyAgent(`${userMessage} (보충: ${userChoice})`, searchEnabled)
    }

    // Validate and filter agents
    let agents = parsed.agents.filter(a => VALID_AGENTS.includes(a))
    if (agents.length === 0) agents = ['chat']
    if (!searchEnabled) agents = agents.filter(a => a !== 'search')
    if (agents.length === 0) agents = ['chat']

    return { agents, clarify: false }
  } catch {
    return { agents: ['chat'], clarify: false }
  }
}
```

- [ ] **Step 2: Rewrite graph.ts**

Uses `Send` API for parallel agent dispatch, `MemorySaver` for checkpointing, and `stream()` for real-time streaming. Graph is compiled once and reused.

```typescript
import { StateGraph, END, Send, MemorySaver, Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { SupervisorAnnotation } from './state.js'
import { classifyAgent } from './supervisor.js'
import { runChatAgent } from './agents/chat-agent.js'
import { createSearchAgent } from './agents/search-agent.js'
import { createPCFixAgent } from './agents/pc-fix-agent.js'
import type { AgentName } from './types.js'

// ─── Nodes ───

async function supervisorNode(state: typeof SupervisorAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1]
  const decision = await classifyAgent(
    String(lastMessage.content),
    state.searchEnabled,
  )
  return { agentName: decision.agents[0] }
}

async function chatNode(state: typeof SupervisorAnnotation.State) {
  const response = await runChatAgent(state.messages)
  return { response }
}

async function searchNode(state: typeof SupervisorAnnotation.State) {
  const agent = createSearchAgent()
  const result = await agent.invoke({ messages: state.messages })
  const lastMsg = result.messages[result.messages.length - 1]
  return { response: String(lastMsg.content) }
}

async function pcFixNode(state: typeof SupervisorAnnotation.State) {
  const agent = createPCFixAgent()
  const result = await agent.invoke({ messages: state.messages })
  const lastMsg = result.messages[result.messages.length - 1]
  return { response: String(lastMsg.content) }
}

// ─── Routing with Send for parallel ───

function routeToAgent(state: typeof SupervisorAnnotation.State): string | Send[] {
  // For now, single agent routing. Parallel Send can be enabled
  // when supervisor returns multiple agents.
  switch (state.agentName) {
    case 'search': return 'search'
    case 'pc_fix': return 'pc_fix'
    default: return 'chat'
  }
}

// ─── Graph (compiled once, reused) ───

const checkpointer = new MemorySaver()

let compiledGraph: ReturnType<typeof buildGraph> | null = null

function buildGraph() {
  const graph = new StateGraph(SupervisorAnnotation)
    .addNode('supervisor', supervisorNode)
    .addNode('chat', chatNode)
    .addNode('search', searchNode)
    .addNode('pc_fix', pcFixNode)

  graph
    .setEntryPoint('supervisor')
    .addConditionalEdges('supervisor', routeToAgent)
    .addEdge('chat', END)
    .addEdge('search', END)
    .addEdge('pc_fix', END)

  return graph.compile({ checkpointer })
}

function getGraph() {
  if (!compiledGraph) compiledGraph = buildGraph()
  return compiledGraph
}

// ─── Streaming entry point ───

export async function* streamMessage(
  userMessage: string,
  history: BaseMessage[] = [],
  threadId: string = 'default',
  searchEnabled: boolean = true,
) {
  const app = getGraph()

  const stream = app.streamEvents(
    {
      messages: [...history, new HumanMessage(userMessage)],
      searchEnabled,
    },
    {
      configurable: { thread_id: threadId },
      version: 'v2',
    },
  )

  let finalResponse = ''
  let agentName: AgentName = 'chat'

  for await (const event of stream) {
    // LLM token streaming
    if (event.event === 'on_chat_model_stream' && event.data?.chunk) {
      const content = event.data.chunk.content
      if (typeof content === 'string' && content) {
        finalResponse += content
        yield { type: 'token' as const, content }
      }
    }

    // Node start events → step indicators
    if (event.event === 'on_chain_start' && event.name) {
      const stepMap: Record<string, string> = {
        supervisor: '메시지를 분석하고 있습니다...',
        search: '검색 에이전트가 처리 중...',
        pc_fix: 'PC 진단 에이전트가 처리 중...',
        chat: '응답을 생성하고 있습니다...',
      }
      if (stepMap[event.name]) {
        if (event.name !== 'supervisor') agentName = event.name as AgentName
        yield { type: 'step' as const, step: 'action', summary: stepMap[event.name] }
      }
    }
  }

  yield {
    type: 'done' as const,
    response: finalResponse,
    agentName,
    diagnosticResults: null,
  }
}

// ─── Resume after interrupt (HITL) ───

export async function* resumeGraph(
  threadId: string,
  resumeValue: unknown,
) {
  const app = getGraph()

  const stream = app.streamEvents(
    new Command({ resume: resumeValue }),
    {
      configurable: { thread_id: threadId },
      version: 'v2',
    },
  )

  let finalResponse = ''

  for await (const event of stream) {
    if (event.event === 'on_chat_model_stream' && event.data?.chunk) {
      const content = event.data.chunk.content
      if (typeof content === 'string' && content) {
        finalResponse += content
        yield { type: 'token' as const, content }
      }
    }
  }

  yield { type: 'done' as const, response: finalResponse, agentName: 'pc_fix', diagnosticResults: null }
}

// ─── Non-streaming fallback (for testing) ───

export async function processMessage(
  userMessage: string,
  history: BaseMessage[] = [],
  threadId: string = 'default',
  searchEnabled: boolean = true,
) {
  let response = ''
  let agentName: AgentName = 'chat'

  for await (const event of streamMessage(userMessage, history, threadId, searchEnabled)) {
    if (event.type === 'token') response += event.content
    if (event.type === 'done') {
      response = event.response
      agentName = event.agentName as AgentName
    }
  }

  return { response, agentName, diagnosticResults: null, messages: history }
}
```

- [ ] **Step 3: Commit**

```bash
git add agent/supervisor.ts agent/graph.ts
git commit -m "feat: implement Supervisor + sub-agent graph with MemorySaver"
```

---

## Task 11: Streaming IPC

Update Electron IPC to use event streaming instead of request-response.

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.js`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Rewrite electron/main.ts**

Key changes:
- Replace `ipcMain.handle('agent:message')` with `ipcMain.on('agent:message')`
- Stream results via `webContents.send('agent:stream:*')`
- Add HITL IPC handlers (`agent:confirm:response`, `agent:clarify:response`)
- Track ConversationManager per window
- Support `searchEnabled` toggle

```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let agentModule: typeof import('../agent/graph.js') | null = null
let conversationModule: typeof import('../agent/history/conversation-manager.js') | null = null
let conversationManager: InstanceType<typeof import('../agent/history/conversation-manager.js').ConversationManager> | null = null

async function loadAgentModule() {
  if (!agentModule) {
    agentModule = await import('../agent/graph.js')
  }
  if (!conversationModule) {
    conversationModule = await import('../agent/history/conversation-manager.js')
    conversationManager = new conversationModule.ConversationManager()
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
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

// ─── Streaming Message Handler ───

ipcMain.on('agent:message', async (event, { message, searchEnabled }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !agentModule || !conversationManager) return

  try {
    const { HumanMessage } = await import('@langchain/core/messages')
    conversationManager.addMessage(new HumanMessage(message))
    await conversationManager.summarizeIfNeeded()

    const history = conversationManager.getMessages()

    // Use real streaming via streamMessage generator
    for await (const event of agentModule.streamMessage(
      message,
      history.slice(0, -1),
      'main-thread',
      searchEnabled ?? true,
    )) {
      if (!win || win.isDestroyed()) break

      switch (event.type) {
        case 'token':
          win.webContents.send('agent:stream:token', { content: event.content })
          break
        case 'step':
          win.webContents.send('agent:stream:step', { step: event.step, summary: event.summary })
          break
        case 'done': {
          const { AIMessage } = await import('@langchain/core/messages')
          conversationManager.addMessage(new AIMessage(event.response))
          win.webContents.send('agent:stream:done', {
            response: event.response,
            agentName: event.agentName,
            diagnosticResults: event.diagnosticResults ?? null,
          })
          break
        }
      }
    }
  } catch (err) {
    const error = err as any
    // Handle GraphInterrupt — send confirm/clarify request to renderer
    if (error?.name === 'GraphInterrupt' || error?.interrupts) {
      const interrupts = error.interrupts || error.value || []
      const interruptData = Array.isArray(interrupts) ? interrupts[0]?.value : interrupts
      if (interruptData?.type === 'confirm') {
        win.webContents.send('agent:confirm', {
          id: Date.now().toString(),
          action: interruptData.action,
          description: interruptData.description,
          scriptId: interruptData.scriptId,
        })
        // 60-second timeout for user response
        setTimeout(() => {
          // If still waiting, auto-cancel
          win.webContents.send('agent:stream:error', {
            message: '사용자 확인 시간이 초과되었습니다.',
            errorType: 'timeout',
          })
        }, 60000)
        return
      }
      if (interruptData?.type === 'clarify') {
        win.webContents.send('agent:clarify', {
          id: Date.now().toString(),
          question: interruptData.question,
          options: interruptData.options || [],
        })
        setTimeout(() => {
          win.webContents.send('agent:stream:error', {
            message: '응답 시간이 초과되었습니다.',
            errorType: 'timeout',
          })
        }, 60000)
        return
      }
    }

    const errorMessage = err instanceof Error ? err.message : String(err)
    win.webContents.send('agent:stream:error', {
      message: errorMessage,
      errorType: 'unknown',
    })
  }
})

// ─── HITL Handlers — resume graph after interrupt ───

async function resumeAndStream(win: BrowserWindow, resumeValue: unknown) {
  try {
    for await (const event of agentModule!.resumeGraph('main-thread', resumeValue)) {
      if (win.isDestroyed()) break
      switch (event.type) {
        case 'token':
          win.webContents.send('agent:stream:token', { content: event.content })
          break
        case 'done':
          win.webContents.send('agent:stream:done', {
            response: event.response,
            agentName: event.agentName,
            diagnosticResults: event.diagnosticResults ?? null,
          })
          break
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    win.webContents.send('agent:stream:error', { message: msg, errorType: 'unknown' })
  }
}

ipcMain.on('agent:confirm:response', (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !agentModule) return
  resumeAndStream(win, response.confirmed)
})

ipcMain.on('agent:clarify:response', (event, response) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !agentModule) return
  const combined = [...(response.selected || []), response.freeText].filter(Boolean).join(', ')
  resumeAndStream(win, combined)
})

// ─── Search Toggle ───

ipcMain.on('agent:search:toggle', (_event, { enabled }) => {
  console.log('[Search] Toggle:', enabled)
})
```

- [ ] **Step 2: Rewrite electron/preload.js**

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Fire-and-forget message send
  sendMessage: (message, searchEnabled) => {
    ipcRenderer.send('agent:message', { message, searchEnabled })
  },

  // Streaming listeners
  onStreamToken: (callback) => {
    ipcRenderer.on('agent:stream:token', (_event, data) => callback(data))
  },
  onStreamStep: (callback) => {
    ipcRenderer.on('agent:stream:step', (_event, data) => callback(data))
  },
  onStreamDone: (callback) => {
    ipcRenderer.on('agent:stream:done', (_event, data) => callback(data))
  },
  onStreamError: (callback) => {
    ipcRenderer.on('agent:stream:error', (_event, data) => callback(data))
  },

  // HITL listeners & senders
  onConfirmRequest: (callback) => {
    ipcRenderer.on('agent:confirm', (_event, data) => callback(data))
  },
  sendConfirmResponse: (response) => {
    ipcRenderer.send('agent:confirm:response', response)
  },
  onClarifyRequest: (callback) => {
    ipcRenderer.on('agent:clarify', (_event, data) => callback(data))
  },
  sendClarifyResponse: (response) => {
    ipcRenderer.send('agent:clarify:response', response)
  },

  // Search toggle
  toggleSearch: (enabled) => {
    ipcRenderer.send('agent:search:toggle', { enabled })
  },

  // Cleanup
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
```

- [ ] **Step 3: Update electron/preload.ts types**

```typescript
export interface ElectronAPI {
  sendMessage: (message: string, searchEnabled?: boolean) => void
  onStreamToken: (callback: (data: { content: string }) => void) => void
  onStreamStep: (callback: (data: { step: string; summary: string }) => void) => void
  onStreamDone: (callback: (data: {
    response: string
    agentName: string
    diagnosticResults: unknown
  }) => void) => void
  onStreamError: (callback: (data: { message: string; errorType: string }) => void) => void
  onConfirmRequest: (callback: (data: {
    id: string; action: string; description: string; scriptId?: string
  }) => void) => void
  sendConfirmResponse: (response: { id: string; confirmed: boolean }) => void
  onClarifyRequest: (callback: (data: {
    id: string; question: string; options: Array<{ label: string; value: string }>
  }) => void) => void
  sendClarifyResponse: (response: {
    id: string; selected: string[]; freeText?: string
  }) => void
  toggleSearch: (enabled: boolean) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/preload.js electron/preload.ts
git commit -m "feat: implement streaming IPC and HITL channels"
```

---

## Task 12: Frontend — Chat Store Refactor

Refactor Pinia store from await-based to event-listener-based streaming.

**Files:**
- Modify: `src/stores/chat.ts`

- [ ] **Step 1: Rewrite chat store**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  diagnosticResults?: unknown
  steps?: Array<{ step: string; summary: string }>
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

declare global {
  interface Window {
    electronAPI?: {
      sendMessage: (message: string, searchEnabled?: boolean) => void
      onStreamToken: (cb: (data: { content: string }) => void) => void
      onStreamStep: (cb: (data: { step: string; summary: string }) => void) => void
      onStreamDone: (cb: (data: { response: string; agentName: string; diagnosticResults: unknown }) => void) => void
      onStreamError: (cb: (data: { message: string; errorType: string }) => void) => void
      onConfirmRequest: (cb: (data: ConfirmRequest) => void) => void
      sendConfirmResponse: (response: { id: string; confirmed: boolean }) => void
      onClarifyRequest: (cb: (data: ClarifyRequest) => void) => void
      sendClarifyResponse: (response: { id: string; selected: string[]; freeText?: string }) => void
      toggleSearch: (enabled: boolean) => void
      removeAllListeners: (channel: string) => void
    }
  }
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
  const lastAgentName = ref<string | null>(null)
  const lastDiagnosticResult = ref<unknown>(null)
  const showDiagnosticPanel = ref(false)
  const searchEnabled = ref(true)
  const lastError = ref<{ message: string; errorType: string } | null>(null)
  const lastUserMessage = ref<string | null>(null)

  // HITL state
  const pendingConfirm = ref<ConfirmRequest | null>(null)
  const pendingClarify = ref<ClarifyRequest | null>(null)

  let listenersSetup = false

  function setupListeners() {
    if (listenersSetup || !window.electronAPI) return
    listenersSetup = true

    window.electronAPI.onStreamToken((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.content += data.content
      }
    })

    window.electronAPI.onStreamStep((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        if (!lastMsg.steps) lastMsg.steps = []
        lastMsg.steps.push(data)
      }
    })

    window.electronAPI.onStreamDone((data) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.content = data.response
        lastMsg.isStreaming = false
        lastMsg.diagnosticResults = data.diagnosticResults
      }
      lastAgentName.value = data.agentName
      if (data.diagnosticResults) {
        lastDiagnosticResult.value = data.diagnosticResults
        showDiagnosticPanel.value = true
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

    window.electronAPI.onConfirmRequest((data) => {
      pendingConfirm.value = data
    })

    window.electronAPI.onClarifyRequest((data) => {
      pendingClarify.value = data
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

    // Create streaming placeholder
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
      // Mock for dev without Electron
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
      // Remove the error message
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        messages.value.pop()
      }
      // Remove the user message too (sendMessage will re-add it)
      const prevMsg = messages.value[messages.value.length - 1]
      if (prevMsg && prevMsg.role === 'user') {
        messages.value.pop()
      }
      sendMessage(lastUserMessage.value)
    }
  }

  function dismissError() {
    lastError.value = null
  }

  function respondToConfirm(confirmed: boolean) {
    if (pendingConfirm.value && window.electronAPI) {
      window.electronAPI.sendConfirmResponse({
        id: pendingConfirm.value.id,
        confirmed,
      })
      pendingConfirm.value = null
    }
  }

  function respondToClarify(selected: string[], freeText?: string) {
    if (pendingClarify.value && window.electronAPI) {
      window.electronAPI.sendClarifyResponse({
        id: pendingClarify.value.id,
        selected,
        freeText,
      })
      pendingClarify.value = null
    }
  }

  function toggleSearch(enabled: boolean) {
    searchEnabled.value = enabled
    if (window.electronAPI) {
      window.electronAPI.toggleSearch(enabled)
    }
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
    lastAgentName,
    lastDiagnosticResult,
    showDiagnosticPanel,
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

- [ ] **Step 2: Commit**

```bash
git add src/stores/chat.ts
git commit -m "feat: refactor chat store for streaming and HITL support"
```

---

## Task 13: Frontend — New Vue Components

Create ConfirmDialog, ClarificationCard, ErrorRetryCard, SearchToggle.

**Files:**
- Create: `src/components/ConfirmDialog.vue`
- Create: `src/components/ClarificationCard.vue`
- Create: `src/components/ErrorRetryCard.vue`
- Create: `src/components/SearchToggle.vue`

- [ ] **Step 1: Create ConfirmDialog.vue**

```vue
<template>
  <div class="confirm-dialog-overlay" v-if="request">
    <div class="confirm-dialog">
      <div class="confirm-icon">🔧</div>
      <h3>다음 작업을 실행할까요?</h3>
      <p class="action-name">{{ request.action }}</p>
      <p class="action-desc">{{ request.description }}</p>
      <div class="confirm-actions">
        <button class="btn-confirm" @click="$emit('confirm', true)">확인</button>
        <button class="btn-cancel" @click="$emit('confirm', false)">취소</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  request: {
    id: string
    action: string
    description: string
    scriptId?: string
  } | null
}>()

defineEmits<{
  confirm: [confirmed: boolean]
}>()
</script>

<style scoped>
.confirm-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.confirm-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  max-width: 420px;
  width: 90%;
  text-align: center;
}

.confirm-icon { font-size: 2rem; margin-bottom: 8px; }
.confirm-dialog h3 { margin: 0 0 12px; font-size: 1.1rem; }
.action-name { font-weight: 600; margin: 4px 0; }
.action-desc { color: #666; font-size: 0.9rem; margin: 4px 0 16px; }

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn-confirm, .btn-cancel {
  padding: 8px 24px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-confirm { background: #4a90d9; color: #fff; }
.btn-confirm:hover { background: #3a7bc8; }
.btn-cancel { background: #e8e8e8; color: #333; }
.btn-cancel:hover { background: #ddd; }
</style>
```

- [ ] **Step 2: Create ClarificationCard.vue**

```vue
<template>
  <div class="clarification-card" v-if="request">
    <p class="question">{{ request.question }}</p>
    <div class="options">
      <label
        v-for="option in request.options"
        :key="option.value"
        class="option-label"
      >
        <input
          type="checkbox"
          :value="option.value"
          v-model="selected"
        />
        {{ option.label }}
      </label>
      <div class="free-text">
        <label class="option-label">
          <span>직접 입력:</span>
          <input
            type="text"
            v-model="freeText"
            placeholder="여기에 입력하세요..."
            class="text-input"
          />
        </label>
      </div>
    </div>
    <button class="btn-submit" @click="submit" :disabled="!hasInput">
      선택 완료
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  request: {
    id: string
    question: string
    options: Array<{ label: string; value: string }>
  } | null
}>()

const emit = defineEmits<{
  respond: [selected: string[], freeText?: string]
}>()

const selected = ref<string[]>([])
const freeText = ref('')

const hasInput = computed(() => selected.value.length > 0 || freeText.value.trim().length > 0)

function submit() {
  emit('respond', selected.value, freeText.value.trim() || undefined)
  selected.value = []
  freeText.value = ''
}
</script>

<style scoped>
.clarification-card {
  background: #f0f4ff;
  border-radius: 12px;
  padding: 16px;
  margin: 8px 0;
}

.question { font-weight: 600; margin: 0 0 12px; }

.options { display: flex; flex-direction: column; gap: 8px; }

.option-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.option-label:hover { background: #e0e8ff; }

.free-text { margin-top: 8px; }

.text-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 0.9rem;
  margin-left: 8px;
}

.btn-submit {
  margin-top: 12px;
  padding: 8px 20px;
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-submit:hover:not(:disabled) { background: #3a7bc8; }
</style>
```

- [ ] **Step 3: Create ErrorRetryCard.vue**

```vue
<template>
  <div class="error-card" v-if="error">
    <div class="error-header">
      <span class="error-icon">⚠️</span>
      <span>요청을 처리하는 중 문제가 발생했습니다.</span>
    </div>
    <p class="error-reason">원인: {{ errorMessage }}</p>
    <div class="error-actions">
      <button class="btn-retry" @click="$emit('retry')">다시 시도</button>
      <button class="btn-dismiss" @click="$emit('dismiss')">취소</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  error: { message: string; errorType: string } | null
}>()

defineEmits<{
  retry: []
  dismiss: []
}>()

const ERROR_MESSAGES: Record<string, string> = {
  api_error: 'API 서버 응답 오류',
  timeout: 'API 응답 시간 초과',
  script_error: '스크립트 실행 실패',
  unknown: '알 수 없는 오류',
}

const errorMessage = computed(() => {
  if (!props.error) return ''
  return ERROR_MESSAGES[props.error.errorType] || props.error.message
})
</script>

<style scoped>
.error-card {
  background: #fff5f5;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 16px;
  margin: 8px 0;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.error-icon { font-size: 1.2rem; }
.error-reason { color: #666; font-size: 0.9rem; margin: 8px 0; }

.error-actions { display: flex; gap: 12px; }

.btn-retry {
  padding: 6px 16px;
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-dismiss {
  padding: 6px 16px;
  background: #e8e8e8;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 4: Create SearchToggle.vue**

```vue
<template>
  <div class="search-toggle">
    <label class="toggle-label">
      <span class="toggle-text">검색</span>
      <div class="toggle-switch" :class="{ active: enabled }" @click="toggle">
        <div class="toggle-thumb" />
      </div>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const enabled = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

function toggle() {
  enabled.value = !enabled.value
}
</script>

<style scoped>
.search-toggle { display: inline-flex; align-items: center; }

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-text { font-size: 0.85rem; color: #666; }

.toggle-switch {
  width: 40px;
  height: 22px;
  background: #ccc;
  border-radius: 11px;
  position: relative;
  transition: background 0.2s;
}

.toggle-switch.active { background: #4a90d9; }

.toggle-thumb {
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: left 0.2s;
}

.toggle-switch.active .toggle-thumb { left: 20px; }
</style>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ConfirmDialog.vue src/components/ClarificationCard.vue src/components/ErrorRetryCard.vue src/components/SearchToggle.vue
git commit -m "feat: add HITL, error, and search toggle Vue components"
```

---

## Task 14: Frontend — Update ChatWindow & MessageBubble

Update existing components for streaming support and ReAct step display.

**Files:**
- Modify: `src/components/ChatWindow.vue`
- Modify: `src/components/MessageBubble.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: Update ChatWindow.vue**

Key changes:
- Remove `await` pattern, use fire-and-forget `sendMessage`
- Remove route badge (replaced by agent name)
- Show agent name badge instead
- Auto-scroll on streaming token updates

Replace the `sendMessage` method and adjust the template to:
- Use `store.sendMessage(text)` (no await)
- Show `store.lastAgentName` badge
- Show `ErrorRetryCard` when `store.lastError` exists
- Show `ClarificationCard` when `store.pendingClarify` exists

The key template sections to update:

```vue
<template>
  <div class="chat-window">
    <div class="messages-area" ref="messagesContainer">
      <MessageBubble
        v-for="(msg, i) in store.messages"
        :key="i"
        :message="msg"
      />

      <!-- Clarification card inline -->
      <ClarificationCard
        v-if="store.pendingClarify"
        :request="store.pendingClarify"
        @respond="(sel, ft) => store.respondToClarify(sel, ft)"
      />

      <!-- Error retry card -->
      <ErrorRetryCard
        v-if="store.lastError"
        :error="store.lastError"
        @retry="store.retryLastMessage"
        @dismiss="store.dismissError"
      />
    </div>

    <!-- Agent badge -->
    <div v-if="store.lastAgentName" class="agent-badge">
      {{ agentLabel }}
    </div>

    <div class="input-area">
      <textarea
        v-model="inputText"
        @keydown.enter.exact.prevent="handleSend"
        placeholder="메시지를 입력하세요..."
        :disabled="store.isLoading"
        rows="1"
      />
      <button @click="handleSend" :disabled="store.isLoading || !inputText.trim()">
        전송
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useChatStore } from '../stores/chat'
import MessageBubble from './MessageBubble.vue'
import ClarificationCard from './ClarificationCard.vue'
import ErrorRetryCard from './ErrorRetryCard.vue'

const store = useChatStore()
const inputText = ref('')
const messagesContainer = ref(null)

const agentLabels = { search: '검색', pc_fix: 'PC 진단', chat: '대화' }
const agentLabel = computed(() => agentLabels[store.lastAgentName] || store.lastAgentName)

function handleSend() {
  const text = inputText.value.trim()
  if (!text || store.isLoading) return
  inputText.value = ''
  store.sendMessage(text)
}

// Auto-scroll on new messages or streaming
watch(() => store.messages.length, () => {
  nextTick(() => scrollToBottom())
})

watch(
  () => store.messages[store.messages.length - 1]?.content,
  () => { nextTick(() => scrollToBottom()) },
)

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}
</script>
```

Keep existing CSS styles and update as needed for the new elements.

- [ ] **Step 2: Update MessageBubble.vue**

Add ReAct step display with collapsible section:

Add to template (inside assistant message area):
```vue
<!-- ReAct steps -->
<div v-if="message.steps && message.steps.length > 0" class="react-steps">
  <div
    class="step-toggle"
    @click="showSteps = !showSteps"
  >
    {{ showSteps ? '▼' : '▶' }} 처리 과정 ({{ message.steps.length }}단계)
  </div>
  <div v-if="showSteps" class="steps-list">
    <div
      v-for="(step, i) in message.steps"
      :key="i"
      class="step-item"
      :class="step.step"
    >
      <span class="step-icon">
        {{ step.step === 'thinking' ? '🤔' : step.step === 'action' ? '🔍' : '📄' }}
      </span>
      {{ step.summary }}
    </div>
  </div>
</div>

<!-- Streaming cursor -->
<span v-if="message.isStreaming" class="streaming-cursor">▌</span>
```

Add to script:
```typescript
const showSteps = ref(false)
```

Add CSS:
```css
.react-steps {
  margin-top: 8px;
  font-size: 0.85rem;
}

.step-toggle {
  cursor: pointer;
  color: #888;
  user-select: none;
}

.step-toggle:hover { color: #555; }

.steps-list {
  margin-top: 4px;
  padding-left: 8px;
  border-left: 2px solid #e0e0e0;
}

.step-item {
  padding: 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-icon { font-size: 0.9rem; }

.streaming-cursor {
  animation: blink 0.8s infinite;
  color: #4a90d9;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
```

- [ ] **Step 3: Update App.vue**

Add SearchToggle to header, ConfirmDialog overlay:

```vue
<template>
  <div id="app">
    <header class="app-header">
      <h1>Design Assistant</h1>
      <div class="header-controls">
        <SearchToggle v-model="store.searchEnabled" @update:modelValue="store.toggleSearch" />
      </div>
    </header>

    <main class="app-main">
      <ChatWindow />
      <DiagnosticPanel
        v-if="store.showDiagnosticPanel"
        :result="store.lastDiagnosticResult"
      />
    </main>

    <!-- HITL Confirm Dialog -->
    <ConfirmDialog
      :request="store.pendingConfirm"
      @confirm="(confirmed) => store.respondToConfirm(confirmed)"
    />
  </div>
</template>

<script setup>
import { useChatStore } from './stores/chat'
import ChatWindow from './components/ChatWindow.vue'
import DiagnosticPanel from './components/DiagnosticPanel.vue'
import SearchToggle from './components/SearchToggle.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'

const store = useChatStore()
</script>
```

Keep existing styles.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatWindow.vue src/components/MessageBubble.vue src/App.vue
git commit -m "feat: update frontend for streaming, ReAct steps, HITL integration"
```

---

## Task 15: Smoke Test & Verification

Run the application and verify basic functionality.

- [ ] **Step 1: Run typecheck**

```bash
cd /Users/gangbyeong-gon/Source/design-assistant
npx vue-tsc --noEmit -p tsconfig.json
```

Fix any type errors.

- [ ] **Step 2: Run unit tests**

```bash
npm test
```

Fix any failing tests.

- [ ] **Step 3: Start the dev server**

```bash
npm run dev
```

Verify:
- App launches without errors
- Chat input works
- Search toggle is visible in header
- Sending a message shows streaming tokens
- Agent name badge appears after response

- [ ] **Step 4: Test in browser — basic chat**

Open the Electron app and send "안녕하세요" to verify Chat Agent works.

- [ ] **Step 5: Test in browser — search (if toggle ON)**

Send "Python 프로그래밍 언어란?" to verify Search Agent + Wikipedia search works.

- [ ] **Step 6: Test in browser — PC diagnostics**

Send "내 PC 사양을 알려줘" to verify PC Fix Agent triggers diagnostics.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve issues found during smoke testing"
```

---

## Task 16: Final Cleanup & Verification

- [ ] **Step 1: Remove old test files if not already removed**

Verify no references to deleted modules remain:

```bash
grep -r "ui-functions\|ui-action\|vectorstore\|loader\|router" agent/ --include="*.ts"
grep -r "ui-functions\|ui-action\|vectorstore\|loader\|router" src/ --include="*.ts" --include="*.vue"
```

Fix any remaining references.

- [ ] **Step 2: Update package.json description**

Change `"description"` from:
```
"CAD Design Assistant with PC Diagnostics - POC"
```
to:
```
"CAD Design Assistant v2 — Multi-Agent with Supervisor + ReAct"
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: v2 cleanup — remove stale references, update metadata"
```
