import { z } from 'zod'

export const MAX_RESEARCH_STEPS = 8

export const nextStepSchema = z.object({
  action: z.enum(['search', 'answer']),
  researchQuestion: z.string().min(1).describe('The next concrete research sub-question. Never ask meta-questions about what the user means.'),
  searchQuery: z.string().max(50).describe('English keyword-style search query, ideally 1-4 words. Use noun/name phrases, not full sentences. Use empty string when action is not "search".'),
  depth: z.enum(['normal', 'deep']).describe('Search depth. Use "normal" unless section-level detail is needed.'),
})

export const distillSchema = z.object({
  stepSummary: z.string().min(1).describe('Compact summary of what this search established for the user question.'),
  newFacts: z.array(z.object({
    label: z.string(),
    value: z.string(),
    sourceTitle: z.string().describe('Document title for this fact. Use empty string if unknown.'),
  })).max(4),
  enoughToAnswer: z.boolean(),
})

export const reviewSchema = z.object({
  isComplete: z.boolean(),
  reason: z.string().describe('Why the current material is or is not complete.'),
  missingAspect: z.string().describe('Short description of the most important missing part. Use empty string if complete.'),
  researchQuestion: z.string().describe('Next focused sub-question if more research is needed. Use empty string if complete.'),
  searchQuery: z.string().max(50).describe('English Wikipedia query for the missing aspect. Use empty string if complete.'),
  depth: z.enum(['normal', 'deep']).describe('Search depth for the missing aspect. Use "normal" if complete.'),
})

export type ResearchPlannerDecision = z.infer<typeof nextStepSchema>
export type ResearchDistillDecision = z.infer<typeof distillSchema>
export type ResearchReviewDecision = z.infer<typeof reviewSchema>
