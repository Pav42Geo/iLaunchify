// @ilaunchify/ai — narrow LLM helpers. V1: the Mode 2 recipe parser only.
//
// Server-only (constructs the Anthropic client from ANTHROPIC_API_KEY). Import
// from server actions / route handlers, never from a client component.

export { parseRecipe, MAX_INPUT_CHARS } from './recipe/parse'
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
