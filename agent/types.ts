import type { BaseMessage } from '@langchain/core/messages'

// ──────────────────────────────────────────────
// 시스템 정보 (systeminformation 기반)
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

// ──────────────────────────────────────────────
// 네트워크 체크 타겟
// ──────────────────────────────────────────────
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

// ─── Research Result ───
export interface ResearchSource {
  title: string
  content: string
  sourceType: 'wikipedia' | 'internal_api' | 'other'
  url?: string               // Wikipedia 등 웹 소스용
  documentId?: string         // 자체 API 문서 ID용
  author?: string
  lastUpdated?: string
  metadata?: Record<string, unknown>  // 자체 API 메타데이터 확장용
}

export interface ResearchResult {
  query: string
  sources: ResearchSource[]
  summary: string
}

// ─── Agent State ───
export type AgentName = 'research' | 'pc_fix' | 'chat'

export interface SupervisorState {
  messages: BaseMessage[]
  agentName: AgentName | null
  response: string | null
  diagnosticResults: DiagnosticResult | null
  searchEnabled: boolean
  summary: string | null
}
