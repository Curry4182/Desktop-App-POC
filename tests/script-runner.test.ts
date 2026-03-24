import { describe, it, expect } from 'vitest'
import { scriptRunnerTool, listAvailableScripts, listScriptsTool } from '../agent/tools/script-runner.js'

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

describe('listScriptsTool', () => {
  it('should be a valid LangChain tool', () => {
    expect(listScriptsTool.name).toBe('list_scripts')
  })
})
