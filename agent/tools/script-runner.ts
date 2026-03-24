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
