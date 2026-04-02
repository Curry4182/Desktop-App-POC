/**
 * 등록된 수정 스크립트 관리 및 실행 모듈.
 *
 * resources/scripts/registry.json에 등록된 .bat/.cmd 스크립트를
 * 조회하고 실행하는 기능을 제공한다.
 * Electron 패키징 시 resourcesPath를 우선 참조하고,
 * 개발 환경에서는 프로젝트 내 resources/scripts를 사용한다.
 *
 * 보안: 임의 명령 실행은 불가하며, registry.json에 등록된 스크립트만 실행 가능.
 * run_script 도구는 humanInTheLoopMiddleware로 사용자 승인을 거친다.
 */
import { exec } from 'child_process'
import { tool } from '@langchain/core/tools'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import type { ScriptEntry, ScriptRegistry } from '../shared/types/scripts.js'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 스크립트 기본 경로를 결정한다.
 * 우선순위: 환경변수 → Electron resourcesPath → 프로젝트 내 resources/scripts
 */
function resolveDefaultScriptBasePath() {
  if (process.env.SCRIPT_BASE_PATH) {
    return process.env.SCRIPT_BASE_PATH
  }

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const packagedPath = resourcesPath ? path.join(resourcesPath, 'scripts') : null

  if (packagedPath && fs.existsSync(path.join(packagedPath, 'registry.json'))) {
    return packagedPath
  }

  return path.resolve(__dirname, '../../resources/scripts')
}

export const SCRIPT_BASE_PATH = resolveDefaultScriptBasePath()

export function loadScriptRegistry(): ScriptRegistry {
  const registryPath = path.join(SCRIPT_BASE_PATH, 'registry.json')
  const raw = fs.readFileSync(registryPath, 'utf-8')
  return JSON.parse(raw) as ScriptRegistry
}

export function getCurrentPlatform(): ScriptEntry['platform'] | null {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    default:
      return null
  }
}

export function listAvailableScripts(): ScriptEntry[] {
  const currentPlatform = getCurrentPlatform()
  const scripts = loadScriptRegistry().scripts
  if (!currentPlatform) return scripts
  return scripts.filter((script) => script.platform === currentPlatform)
}

export function getScriptById(scriptId: string): ScriptEntry | undefined {
  return listAvailableScripts().find((script) => script.id === scriptId)
}

export function formatScriptMetadata(scriptId: string) {
  const entry = getScriptById(scriptId)
  if (!entry) return null

  return [
    `이름: ${entry.name}`,
    `설명: ${entry.description}`,
    `카테고리: ${entry.category}`,
    `증상: ${entry.symptoms.join(', ')}`,
    `파일: ${entry.file}`,
    entry.requiresAdmin ? '⚠️ 관리자 권한 필요' : null,
  ].filter(Boolean).join('\n')
}

export function resolveScriptPath(entry: ScriptEntry) {
  return path.join(SCRIPT_BASE_PATH, entry.file)
}

export function scriptExists(entry: ScriptEntry) {
  return fs.existsSync(resolveScriptPath(entry))
}

export function buildScriptCommand(entry: ScriptEntry) {
  const scriptPath = resolveScriptPath(entry)
  const ext = path.extname(entry.file).toLowerCase()

  if (ext === '.bat' || ext === '.cmd') {
    return `cmd /c "${scriptPath}"`
  }
  return null
}

export async function executeRegisteredScript(scriptId: string) {
  const entry = getScriptById(scriptId)
  if (!entry) {
    return `Error: Script "${scriptId}" not found in registry. Available: ${listAvailableScripts().map((script) => script.id).join(', ')}`
  }

  const scriptPath = resolveScriptPath(entry)
  if (!scriptExists(entry)) {
    return `Error: Script file "${entry.file}" does not exist at ${scriptPath}`
  }

  const command = buildScriptCommand(entry)
  if (!command) {
    return `Error: Unsupported script type for this environment: ${path.extname(entry.file).toLowerCase()}. Use .bat or .cmd scripts on Windows.`
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
}

export const scriptRunnerTool = tool(
  async ({ scriptId }) => executeRegisteredScript(scriptId),
  {
    name: 'run_script',
    description: 'Execute a pre-defined fix script by its ID. Only scripts registered in registry.json can be run. Use list_scripts first to see available options.',
    schema: z.object({
      scriptId: z.string().describe('The ID of the script to execute (from registry.json)'),
    }),
  },
)

export const listScriptsTool = tool(
  async () => {
    const scripts = listAvailableScripts()
    return JSON.stringify(
      scripts.map(({ id, name, description, symptoms, category, requiresAdmin }) => ({
        id, name, description, symptoms, category,
        ...(requiresAdmin ? { requiresAdmin } : {}),
      })),
      null, 2,
    )
  },
  {
    name: 'list_scripts',
    description: 'List all available fix scripts with their IDs, descriptions, and symptom mappings.',
    schema: z.object({}),
  },
)
