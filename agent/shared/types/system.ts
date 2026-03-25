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

export interface InstalledProgram {
  name: string
  version?: string
  installLocation?: string
}

export interface FilePathResult {
  exists: boolean
  isFile?: boolean
  isDirectory?: boolean
  error?: string
}

export interface NetworkResult {
  reachable: boolean
  dns?: boolean
  port?: Record<number, boolean>
  error?: string
}

export type NetworkTarget = string | { host: string; port?: number }

export interface DiagnosticResult {
  timestamp: string
  query: string
  system: SystemInfo
  installedPrograms: InstalledProgram[]
  network: Record<string, NetworkResult>
  filePaths?: Record<string, FilePathResult>
}
