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
  })
}
