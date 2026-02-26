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
// UI 액션
// ──────────────────────────────────────────────
export type UIActionName =
  | 'openDiagnosticPanel'
  | 'closeDiagnosticPanel'
  | 'clearChat'
  | 'startDiagnostics'
  | 'exportReport'
  | 'scrollToTop'

export interface UIAction {
  action: UIActionName
  params?: Record<string, unknown>
}

// ──────────────────────────────────────────────
// LLM 팩토리 옵션
// ──────────────────────────────────────────────
export interface LLMOptions {
  temperature?: number
  maxTokens?: number
}

// ──────────────────────────────────────────────
// LangGraph 상태
// ──────────────────────────────────────────────
export type RouteType = 'rag' | 'diagnostic' | 'ui_action' | 'chat'

export interface AgentState {
  messages: BaseMessage[]
  route?: RouteType
  ragContext?: string
  diagnosticResult?: DiagnosticResult
  uiAction?: UIAction
  response?: string
}
