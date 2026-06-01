// Types for the AI recipe parser (Mode 2). See
// docs/builds/ingredients-ai-parser-slice-3.md +
// docs/builds/ai-recipe-parser-economics.md (source of truth on numbers).

export type IngredientSourceTag = 'USDA' | 'LIBRARY' | 'PARTNER_PRIVATE'

/** A candidate match for a single recipe line, retrieved BEFORE the LLM call. */
export interface IngredientCandidate {
  id: string
  name: string
  source: IngredientSourceTag
  labelDeclarationName?: string | null
  allergenFlags?: string[]
}

/** Injected retrieval fn so packages/ai never depends on apps/partner. */
export type IngredientSearchFn = (
  query: string,
  limit: number,
) => Promise<IngredientCandidate[]>

export interface ParseRecipeInput {
  rawText: string
  ingredientSearchFn: IngredientSearchFn
}

export type ReviewReason =
  | 'low-confidence'
  | 'multi-ingredient-blend'
  | 'banned'
  | 'generic-fda-name'
  | 'no-match'

export interface ParsedLineMatch {
  ingredientId: string
  name: string
  source: IngredientSourceTag
  /** 0–1. */
  confidence: number
  /** null = couldn't estimate. */
  estimatedWeightG: number | null
}

export interface ParsedLine {
  lineNumber: number
  rawText: string
  match: ParsedLineMatch | null
  alternates: Array<{
    ingredientId: string
    name: string
    source: string
    confidence: number
  }>
  needsReview: boolean
  reviewReason?: ReviewReason
  notes?: string
}

export interface ParsedRecipeResult {
  lines: ParsedLine[]
  promptTokens: number
  completionTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCostUsd: number
  modelUsed: string
}
