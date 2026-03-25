import 'dotenv/config'
import {
  formatCadCatiaExperimentSummary,
  runCadCatiaExperiment,
  runCadCatiaModeComparison,
} from '../../evals/langfuse/cad-catia.js'

function parseMaxItems() {
  const index = process.argv.findIndex((arg) => arg === '--max-items')
  if (index === -1) return undefined

  const raw = process.argv[index + 1]
  if (!raw) return undefined

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseMode() {
  const index = process.argv.findIndex((arg) => arg === '--mode')
  if (index === -1) return undefined

  const raw = process.argv[index + 1]
  if (raw === 'workflow' || raw === 'agentic') return raw
  return undefined
}

function parseStartIndex() {
  const index = process.argv.findIndex((arg) => arg === '--start-index')
  if (index === -1) return undefined

  const raw = process.argv[index + 1]
  if (!raw) return undefined

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function main() {
  const maxItems = parseMaxItems()
  const researchMode = parseMode()
  const startIndex = parseStartIndex()

  if (process.argv.includes('--compare')) {
    const result = await runCadCatiaModeComparison({ maxItems, startIndex })
    console.log('[workflow]')
    console.log(formatCadCatiaExperimentSummary(result.workflow))
    console.log('')
    console.log('[agentic]')
    console.log(formatCadCatiaExperimentSummary(result.agentic))
    return
  }

  const result = await runCadCatiaExperiment({
    name: `design-assistant-cad-catia-${new Date().toISOString()}`,
    maxItems,
    researchMode,
    startIndex,
  })

  console.log(formatCadCatiaExperimentSummary(result))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
