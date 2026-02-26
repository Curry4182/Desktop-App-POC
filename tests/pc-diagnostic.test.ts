import { describe, it, expect } from 'vitest'
import {
  checkFilePaths,
  checkNetwork,
  getSystemInfo,
  getInstalledPrograms,
  runDiagnostics,
} from '../agent/tools/pc-diagnostic.js'

describe('PC 진단 도구', () => {
  describe('파일 경로 확인', () => {
    it('실제 경로는 exists=true를 반환해야 함', async () => {
      const results = await checkFilePaths(['/Users', '/tmp'])
      expect(results['/Users'].exists).toBe(true)
      expect(results['/tmp'].exists).toBe(true)
    })

    it('존재하지 않는 경로는 exists=false를 반환해야 함', async () => {
      const results = await checkFilePaths(['/nonexistent/path/xyz'])
      expect(results['/nonexistent/path/xyz'].exists).toBe(false)
    })

    it('빈 배열을 처리해야 함', async () => {
      const results = await checkFilePaths([])
      expect(Object.keys(results)).toHaveLength(0)
    })
  })

  describe('네트워크 연결 확인', () => {
    it('알려진 호스트의 DNS를 조회해야 함', async () => {
      const results = await checkNetwork(['google.com'])
      expect(results['google.com']).toBeDefined()
      expect(typeof results['google.com'].reachable).toBe('boolean')
    }, 10000)

    it('유효하지 않은 호스트는 unreachable을 반환해야 함', async () => {
      const results = await checkNetwork(['invalid.host.xyz.abc'])
      expect(results['invalid.host.xyz.abc'].reachable).toBe(false)
    }, 10000)
  })

  describe('시스템 정보 수집', () => {
    it('유효한 시스템 정보를 반환해야 함', async () => {
      const info = await getSystemInfo()
      expect(info.os.platform).toBeDefined()
      expect(info.os.hostname).toBeDefined()
      expect(info.cpu.cores).toBeGreaterThan(0)
      expect(info.cpu.brand).toBeDefined()
      expect(parseFloat(info.memory.totalGB)).toBeGreaterThan(0)
      expect(parseFloat(info.memory.usedPercent)).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(info.gpu)).toBe(true)
      expect(Array.isArray(info.disks)).toBe(true)
    }, 15000)

    it('디스크 정보가 포함되어야 함', async () => {
      const info = await getSystemInfo()
      expect(info.disks.length).toBeGreaterThan(0)
      const disk = info.disks[0]
      expect(disk.mount).toBeDefined()
      expect(parseFloat(disk.totalGB)).toBeGreaterThan(0)
      expect(parseFloat(disk.freeGB)).toBeGreaterThanOrEqual(0)
    }, 15000)
  })

  describe('설치 프로그램 탐지', () => {
    it('설치 프로그램 목록을 반환해야 함', async () => {
      const programs = await getInstalledPrograms()
      expect(Array.isArray(programs)).toBe(true)
      // macOS에서는 최소 몇 개 이상의 앱이 존재해야 함
      if (process.platform === 'darwin') {
        expect(programs.length).toBeGreaterThan(0)
        expect(programs[0].name).toBeDefined()
      }
    }, 15000)
  })

  describe('전체 진단 실행', () => {
    it('완전한 진단 구조를 반환해야 함', async () => {
      const result = await runDiagnostics('테스트 쿼리')
      expect(result.timestamp).toBeDefined()
      expect(result.query).toBe('테스트 쿼리')
      expect(result.system).toBeDefined()
      expect(result.system.os).toBeDefined()
      expect(result.system.cpu).toBeDefined()
      expect(result.system.memory).toBeDefined()
      expect(Array.isArray(result.system.gpu)).toBe(true)
      expect(Array.isArray(result.system.disks)).toBe(true)
      expect(Array.isArray(result.installedPrograms)).toBe(true)
      expect(result.network).toBeDefined()
      expect(result.filePaths).toBeUndefined()
    }, 20000)

    it('specificPaths가 있을 때 filePaths가 포함되어야 함', async () => {
      const result = await runDiagnostics('경로 테스트', ['/Users', '/nonexistent'])
      expect(result.filePaths).toBeDefined()
      expect(result.filePaths!['/Users'].exists).toBe(true)
      expect(result.filePaths!['/nonexistent'].exists).toBe(false)
    }, 20000)
  })
})
