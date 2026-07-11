// @ilaunchify/ai — narrow LLM helpers: the Mode 2 recipe parser + the
// co-creation brief-assist (V1.5, 2026-07-11).
//
// Server-only (constructs the Anthropic client from ANTHROPIC_API_KEY). Import
// from server actions / route handlers, never from a client component.

export { parseRecipe, MAX_INPUT_CHARS } from './recipe/parse'
export { assistBrief, MAX_ASSIST_INPUT_CHARS } from './brief/assist'
export type { BriefAssistInput, BriefAssistResult, BriefAssistSuggestion } from './brief/assist'
export { HAIKU_MODEL } from './client'
export { estimateCostUsd, type TokenUsage } from './telemetry'
export type {
  ParseRecipeInput,
  ParsedRecipeResult,
  ParsedLine,
  ParsedLineMatch,
  IngredientCandidate,
  IngredientSearchFn,
  IngredientSourceTag,
  ReviewReason,
} from './recipe/types'
