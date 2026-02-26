import fs from 'fs'
import net from 'net'
import { exec } from 'child_process'
import { promisify } from 'util'
import dns from 'dns'
import si from 'systeminformation'
import type {
  FilePathResult,
  NetworkResult,
  NetworkTarget,
  SystemInfo,
  InstalledProgram,
  DiagnosticResult,
} from '../types.js'

const execAsync = promisify(exec)
const dnsLookup = promisify(dns.lookup)

/**
 * systeminformation으로 HW/OS 정보 수집 (병렬)
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  const [osData, cpuData, memData, gpuData, diskData] = await Promise.all([
    si.osInfo(),
    si.cpu(),
    si.mem(),
    si.graphics(),
    si.fsSize(),
  ])

  const totalMem = memData.total
  // mem.active는 Linux/macOS 전용 — Windows에서 0 반환됨. mem.used/free 사용
  const usedMem = memData.used
  const freeMem = memData.free

  return {
    os: {
      platform: osData.platform,
      distro: osData.distro,
      release: osData.release,
      arch: osData.arch,
      hostname: osData.hostname,
      kernel: osData.kernel,
    },
    cpu: {
      manufacturer: cpuData.manufacturer,
      brand: cpuData.brand,
      speed: cpuData.speed,
      cores: cpuData.cores,
      physicalCores: cpuData.physicalCores,
    },
    memory: {
      totalGB: (totalMem / 1024 ** 3).toFixed(2),
      freeGB: (freeMem / 1024 ** 3).toFixed(2),
      usedGB: (usedMem / 1024 ** 3).toFixed(2),
      usedPercent: ((usedMem / totalMem) * 100).toFixed(1),
    },
    gpu: gpuData.controllers.map((c) => ({
      vendor: c.vendor,
      model: c.model,
      vramMB: c.vram ?? 0,
      driverVersion: c.driverVersion || undefined,
    })),
    disks: diskData.map((d) => ({
      fs: d.fs,
      type: d.type,
      mount: d.mount,
      totalGB: (d.size / 1024 ** 3).toFixed(2),
      usedGB: (d.used / 1024 ** 3).toFixed(2),
      freeGB: ((d.size - d.used) / 1024 ** 3).toFixed(2),
      usedPercent: ((d.use)).toFixed(1),
    })),
  }
}

/**
 * 설치 프로그램 범용 탐지
 * - Windows: PowerShell Get-ItemProperty (Uninstall + WOW6432Node), 이름으로 중복 제거
 * - macOS: ls /Applications/*.app
 */
export async function getInstalledPrograms(): Promise<InstalledProgram[]> {
  const isWindows = process.platform === 'win32'

  if (isWindows) {
    try {
      // 줄바꿈이 포함된 스크립트를 그대로 전달하기 위해 -EncodedCommand(UTF-16 LE Base64) 사용
      // -Command "..." 방식은 공백으로 줄바꿈을 치환 시 PowerShell 문장 구분자 오류 발생
      const script = [
        "$paths = @(",
        "  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
        "  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
        "  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
        ")",
        "$apps = $paths | ForEach-Object {",
        "  Get-ItemProperty $_ -ErrorAction SilentlyContinue",
        "} | Where-Object { $_.DisplayName } |",
        "  Select-Object DisplayName, DisplayVersion, InstallLocation |",
        "  Sort-Object DisplayName -Unique",
        "$apps | ConvertTo-Json -Compress",
      ].join('\n')
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      const { stdout } = await execAsync(
        `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
        { maxBuffer: 1024 * 1024 * 10 }
      )
      const raw: unknown = JSON.parse(stdout.trim())
      // ConvertTo-Json은 결과가 없으면 null 출력 → JSON.parse("null") = null
      if (!raw) return []
      const list = Array.isArray(raw) ? raw : [raw]
      const items: InstalledProgram[] = list
        .filter((item): item is Record<string, string> => !!item && typeof item === 'object')
        .map((item) => ({
          name: item['DisplayName'],
          version: item['DisplayVersion'] || undefined,
          installLocation: item['InstallLocation'] || undefined,
        }))
      return items
    } catch {
      return []
    }
  } else {
    // macOS: /Applications/*.app
    try {
      const { stdout } = await execAsync('ls /Applications')
      const apps = stdout
        .trim()
        .split('\n')
        .filter((name) => name.endsWith('.app'))
        .map((name) => ({ name: name.replace(/\.app$/, '') }))
      return apps
    } catch {
      return []
    }
  }
}

/**
 * 파일 경로 존재 여부 확인
 */
export async function checkFilePaths(
  paths: string[],
): Promise<Record<string, FilePathResult>> {
  const results: Record<string, FilePathResult> = {}
  for (const p of paths) {
    try {
      const stat = fs.existsSync(p) ? fs.statSync(p) : null
      results[p] = {
        exists: !!stat,
        isFile: stat?.isFile() ?? false,
        isDirectory: stat?.isDirectory() ?? false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results[p] = { exists: false, error: message }
    }
  }
  return results
}

/**
 * 네트워크 연결 확인 (병렬 실행)
 */
export async function checkNetwork(
  targets: NetworkTarget[],
): Promise<Record<string, NetworkResult>> {
  const results: Record<string, NetworkResult> = {}

  await Promise.all(targets.map(async (target) => {
    const { host, port } = typeof target === 'string'
      ? { host: target, port: undefined }
      : target

    try {
      await dnsLookup(host)
      results[host] = { reachable: true, dns: true }

      if (port) {
        const portReachable = await checkPort(host, port)
        results[host].port = { [port]: portReachable }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results[host] = { reachable: false, error: message }
    }
  }))

  return results
}

/**
 * TCP 포트 연결 확인
 */
async function checkPort(host: string, port: number, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeout)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('error', () => { socket.destroy(); resolve(false) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.connect(port, host)
  })
}

/**
 * 오케스트레이터: specificPaths가 있을 때만 filePaths 포함
 */
export async function runDiagnostics(
  userQuery = '',
  specificPaths?: string[],
): Promise<DiagnosticResult> {
  const networkTargets: NetworkTarget[] = [
    { host: '8.8.8.8' },
    { host: 'google.com' },
  ]

  const tasks: [
    Promise<SystemInfo>,
    Promise<InstalledProgram[]>,
    Promise<Record<string, NetworkResult>>,
    Promise<Record<string, FilePathResult>> | Promise<undefined>,
  ] = [
    getSystemInfo(),
    getInstalledPrograms(),
    checkNetwork(networkTargets),
    specificPaths ? checkFilePaths(specificPaths) : Promise.resolve(undefined),
  ]

  const [systemInfo, installedPrograms, networkResults, filePathResults] =
    await Promise.all(tasks)

  const result: DiagnosticResult = {
    timestamp: new Date().toISOString(),
    query: userQuery,
    system: systemInfo,
    installedPrograms,
    network: networkResults,
  }

  if (filePathResults) {
    result.filePaths = filePathResults
  }

  return result
}
