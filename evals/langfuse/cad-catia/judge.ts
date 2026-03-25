import 'dotenv/config'
import { ChatOpenAI } from '@langchain/openai'
import type { Evaluator, RunEvaluator } from '@langfuse/client'
import { z } from 'zod'
import type {
  CadCatiaExpectedOutput,
  CadCatiaEvalInput,
  CadCatiaEvalMetadata,
} from './types.js'

type JudgeDecision = {
  score: number
  passed: boolean
  reasoning: string
}

const judgeSchema = z.object({
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  reasoning: z.string(),
})

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required to run Langfuse evals.`)
  return value
}

function createJudgeModel() {
  requireEnv('OPENAI_API_KEY')

  const model = process.env.OPENAI_EVAL_MODEL
    || process.env.OPENAI_MODEL
    || 'gpt-5-mini'

  return new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model,
    temperature: 0,
    maxCompletionTokens: 900,
  } as any).withStructuredOutput(judgeSchema)
}

export function createCadCatiaJudgeEvaluator(): Evaluator<
  CadCatiaEvalInput,
  CadCatiaExpectedOutput,
  CadCatiaEvalMetadata
> {
  const judgeModel = createJudgeModel()

  return async ({ input, output, expectedOutput, metadata }) => {
    const decision: JudgeDecision = await judgeModel.invoke([
      [
        'system',
        `You are grading a chatbot response for a CAD/CATIA assistant.

Return a score between 0 and 1.
- 1.0 means the answer satisfies the request, keeps follow-up context correctly, and avoids clear factual mistakes.
- 0.0 means it fails badly, ignores context, or hallucinates.

Be strict about follow-up grounding.
If forbidden mentions appear as factual answers, score should be low.`,
      ],
      [
        'user',
        JSON.stringify({
          scenario: metadata?.scenario,
          turns: input.turns,
          expectedRubric: expectedOutput?.rubric,
          requiredMentions: expectedOutput?.requiredMentions ?? [],
          forbiddenMentions: expectedOutput?.forbiddenMentions ?? [],
          finalAnswer: output.finalAnswer,
        }, null, 2),
      ],
    ])

    return [
      {
        name: 'llm_judge_score',
        value: Number(decision.score.toFixed(4)),
        comment: decision.reasoning,
      },
      {
        name: 'llm_judge_pass',
        value: decision.passed ? 1 : 0,
        comment: decision.reasoning,
      },
    ]
  }
}

export function createCadCatiaRunEvaluator(): RunEvaluator<
  CadCatiaEvalInput,
  CadCatiaExpectedOutput,
  CadCatiaEvalMetadata
> {
  return async ({ itemResults }) => {
    const scoreValues = itemResults.flatMap((item) =>
      item.evaluations
        .filter((evaluation) => evaluation.name === 'llm_judge_score' && typeof evaluation.value === 'number')
        .map((evaluation) => Number(evaluation.value)),
    )

    const passValues = itemResults.flatMap((item) =>
      item.evaluations
        .filter((evaluation) => evaluation.name === 'llm_judge_pass' && typeof evaluation.value === 'number')
        .map((evaluation) => Number(evaluation.value)),
    )

    const averageScore = scoreValues.length > 0
      ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length
      : 0
    const passRate = passValues.length > 0
      ? passValues.reduce((sum, value) => sum + value, 0) / passValues.length
      : 0

    return [
      {
        name: 'average_llm_judge_score',
        value: Number(averageScore.toFixed(4)),
        comment: `Average of ${scoreValues.length} LLM judge scores.`,
      },
      {
        name: 'pass_rate',
        value: Number(passRate.toFixed(4)),
        comment: `${passValues.filter((value) => value >= 1).length}/${passValues.length} scenarios passed.`,
      },
    ]
  }
}
