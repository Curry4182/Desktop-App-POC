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

// ─── Agent Routing ───
export type AgentName = 'research' | 'pc_fix' | 'chat'

export type AgentRoute = AgentName | '__end__'

// ─── Custom Stream Events ───
export type CustomStreamEvent =
  | { type: 'search_start'; query: string }
  | { type: 'search_result'; titles: string[]; count: number }
  | { type: 'source_found'; title: string; url: string; snippet: string }
  | { type: 'research_step'; step: string }

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

// ─── Research Source ───
export interface ResearchSource {
  title: string
  content: string
  sourceType: 'wikipedia' | 'other'
  url?: string
  documentId?: string
  author?: string
  lastUpdated?: string
  metadata?: Record<string, unknown>
}
