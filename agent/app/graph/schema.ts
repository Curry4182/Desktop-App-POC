import { z } from 'zod'

export const routeSchema = z.object({
  next: z.enum(['assistant', 'research_init']),
})

export const interpretSchema = z.object({
  rewrittenQuestion: z.string().describe('Standalone rewrite of the latest user request in the same language.'),
  needsClarification: z.boolean(),
  question: z.string().describe('Clarification question to show in UI. Use empty string when no clarification is needed.'),
  options: z.array(z.string()).max(5).describe('Disambiguation options. Use [] when no clarification is needed.'),
})

export type RouteDecision = z.infer<typeof routeSchema>
export type InterpretDecision = z.infer<typeof interpretSchema>
