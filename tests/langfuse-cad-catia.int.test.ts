import 'dotenv/config'
import { describe, expect, it } from 'vitest'
import { runCadCatiaExperiment } from '../evals/langfuse/cad-catia.js'

const hasRequiredEnv = Boolean(
  process.env.OPENAI_API_KEY
  && process.env.LANGFUSE_PUBLIC_KEY
  && process.env.LANGFUSE_SECRET_KEY,
)

describe.runIf(hasRequiredEnv)('Langfuse CAD/CATIA integration eval', () => {
  it('runs real API evaluation against a small CAD/CATIA slice', async () => {
    const result = await runCadCatiaExperiment({
      name: `design-assistant-cad-catia-int-${Date.now()}`,
      description: 'Small real-API smoke test for Langfuse CAD/CATIA eval.',
      maxItems: 2,
      maxConcurrency: 1,
    })

    expect(result.itemResults).toHaveLength(2)
    for (const item of result.itemResults) {
      expect(String(item.output.finalAnswer ?? '').trim().length).toBeGreaterThan(0)
      expect(item.evaluations.some((evaluation) => evaluation.name === 'llm_judge_score')).toBe(true)
    }

    const averageScore = result.runEvaluations.find((evaluation) => evaluation.name === 'average_llm_judge_score')
    expect(Number(averageScore?.value ?? 0)).toBeGreaterThan(0.3)
  })
})
