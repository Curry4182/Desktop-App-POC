import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { MemorySaver } from '@langchain/langgraph'
import { LangfuseClient, type ExperimentResult } from '@langfuse/client'
import { createAgentRuntime, createDefaultGraphDependencies } from '../../../agent/graph.js'
import type {
  CadCatiaEvalInput,
  CadCatiaExpectedOutput,
  CadCatiaEvalItem,
  CadCatiaEvalMetadata,
  CadCatiaEvalOutput,
  RunCadCatiaExperimentOptions,
} from './types.js'
import { cadCatiaDataset } from './dataset.js'
import { createCadCatiaJudgeEvaluator, createCadCatiaRunEvaluator } from './judge.js'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required to run Langfuse evals.`)
  return value
}

function createLangfuseClient() {
  return new LangfuseClient({
    publicKey: requireEnv('LANGFUSE_PUBLIC_KEY'),
    secretKey: requireEnv('LANGFUSE_SECRET_KEY'),
    baseUrl: process.env.LANGFUSE_BASE_URL,
  })
}

async function collectAssistantReply(
  runtime: ReturnType<typeof createAgentRuntime>,
  threadId: string,
  userMessage: string,
  searchEnabled: boolean,
) {
  let content = ''
  let tokenUsage: CadCatiaEvalOutput['tokenUsage'] = {}

  for await (const chunk of runtime.streamGraph({ userMessage, threadId, searchEnabled })) {
    if (chunk.type === 'token') {
      content += chunk.content
      continue
    }

    if (chunk.type === 'custom' && chunk.data?.type === 'answer_token') {
      content += String(chunk.data.content ?? '')
      continue
    }

    if (chunk.type === 'interrupt') {
      throw new Error(`Unexpected interrupt during eval scenario "${threadId}": ${JSON.stringify(chunk.data)}`)
    }

    if (chunk.type === 'done') {
      tokenUsage = chunk.tokenUsage ?? {}
    }
  }

  return {
    content: content.trim(),
    tokenUsage,
  }
}

export async function runCadCatiaScenario(
  input: CadCatiaEvalInput,
  options: Pick<RunCadCatiaExperimentOptions, 'researchMode'> = {},
): Promise<CadCatiaEvalOutput> {
  const threadId = `langfuse-${input.id}-${randomUUID()}`
  const runtime = createAgentRuntime({
    checkpointer: new MemorySaver(),
    deps: createDefaultGraphDependencies({
      researchMode: options.researchMode,
    }),
  })

  const transcript: CadCatiaEvalOutput['transcript'] = []
  let lastTokenUsage: CadCatiaEvalOutput['tokenUsage'] = {}

  for (const turn of input.turns) {
    transcript.push({ role: 'user', content: turn })
    const reply = await collectAssistantReply(
      runtime,
      threadId,
      turn,
      input.searchEnabled ?? true,
    )
    transcript.push({ role: 'assistant', content: reply.content })
    lastTokenUsage = reply.tokenUsage
  }

  return {
    finalAnswer: transcript.filter((entry) => entry.role === 'assistant').at(-1)?.content ?? '',
    transcript,
    tokenUsage: lastTokenUsage,
  }
}

export async function runCadCatiaExperiment(
  options: RunCadCatiaExperimentOptions = {},
): Promise<ExperimentResult<CadCatiaEvalInput, CadCatiaExpectedOutput, CadCatiaEvalMetadata>> {
  const langfuse = createLangfuseClient()
  const startIndex = options.startIndex ?? 0
  const sliced = cadCatiaDataset.slice(startIndex)
  const data = typeof options.maxItems === 'number'
    ? sliced.slice(0, options.maxItems)
    : sliced

  try {
    return await langfuse.experiment.run({
      name: options.name ?? 'design-assistant-cad-catia',
      description: options.description ?? 'CAD/CATIA follow-up and factual retrieval regression suite.',
      metadata: {
        suite: 'cad-catia',
        researchMode: options.researchMode ?? 'workflow',
        modelProvider: process.env.LLM_PROVIDER ?? 'openai',
        appModel: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'unknown',
        judgeModel: process.env.OPENAI_EVAL_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-5-mini',
      },
      data,
      maxConcurrency: options.maxConcurrency ?? 1,
      task: async (item) => runCadCatiaScenario(
        item.input as CadCatiaEvalInput,
        { researchMode: options.researchMode },
      ),
      evaluators: [createCadCatiaJudgeEvaluator()],
      runEvaluators: [createCadCatiaRunEvaluator()],
    })
  } finally {
    await langfuse.shutdown()
  }
}

export function formatCadCatiaExperimentSummary(
  result: ExperimentResult<CadCatiaEvalInput, CadCatiaExpectedOutput, CadCatiaEvalMetadata>,
) {
  const lines = [
    `Experiment: ${result.runName}`,
    `Items: ${result.itemResults.length}`,
  ]

  for (const evaluation of result.runEvaluations) {
    lines.push(`${evaluation.name}: ${evaluation.value}${evaluation.comment ? ` (${evaluation.comment})` : ''}`)
  }

  for (const item of result.itemResults) {
    const scenario = ((item.item as CadCatiaEvalItem).metadata as CadCatiaEvalMetadata | undefined)?.scenario
      ?? (item.input as CadCatiaEvalInput | undefined)?.id
      ?? 'unknown'
    const score = item.evaluations.find((evaluation) => evaluation.name === 'llm_judge_score')
    lines.push(`- ${scenario}: score=${score?.value ?? 'n/a'}`)
  }

  if (result.datasetRunUrl) {
    lines.push(`Langfuse URL: ${result.datasetRunUrl}`)
  }

  return lines.join('\n')
}

export async function runCadCatiaModeComparison(
  options: Omit<RunCadCatiaExperimentOptions, 'researchMode' | 'name' | 'description'> = {},
) {
  const workflow = await runCadCatiaExperiment({
    ...options,
    researchMode: 'workflow',
    name: `design-assistant-cad-catia-workflow-${new Date().toISOString()}`,
    description: 'Workflow-style research evaluation for CAD/CATIA dataset.',
  })

  const agentic = await runCadCatiaExperiment({
    ...options,
    researchMode: 'agentic',
    name: `design-assistant-cad-catia-agentic-${new Date().toISOString()}`,
    description: 'Agentic research evaluation for CAD/CATIA dataset.',
  })

  return { workflow, agentic }
}
