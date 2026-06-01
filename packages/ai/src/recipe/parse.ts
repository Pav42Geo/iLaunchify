// parseRecipe — the Mode 2 entrypoint.
//
// Pipeline: normalize → size-cap → split lines → per-line retrieval (injected,
// top-5) → Haiku call with prompt caching → zod-validate → enrich matches from
// the candidate set → ParsedRecipeResult (with token counts + cost).
//
// Fail-soft: if the model returns unparseable output, every line comes back
// needsReview:'no-match' so the UI can still offer "switch to Search & build"
// instead of throwing the partner into an error state.

import { z } from 'zod'
import { getAnthropicClient, HAIKU_MODEL } from '../client'
import { SYSTEM_PROMPT, buildUserMessage, type PerLineCandidates } from '../prompts/recipe-parse'
import { normalizeRecipeText, splitIntoCandidateLines } from './normalize'
import { estimateCostUsd, type TokenUsage } from '../telemetry'
import type {
  IngredientCandidate,
  ParsedLine,
  ParsedRecipeResult,
  ParseRecipeInput,
  ReviewReason,
} from './types'

export const MAX_INPUT_CHARS = 10_000
const MAX_LINES = 60
const CANDIDATES_PER_LINE = 5

const REVIEW_REASONS: ReviewReason[] = [
  'low-confidence',
  'multi-ingredient-blend',
  'banned',
  'generic-fda-name',
  'no-match',
]

const RawLineSchema = z.object({
  lineNumber: z.number(),
  rawText: z.string().optional(),
  match: z
    .object({
      ingredientId: z.string(),
      confidence: z.number(),
      estimatedWeightG: z.number().nullable().optional(),
    })
    .nullable(),
  alternates: z
    .array(z.object({ ingredientId: z.string(), confidence: z.number() }))
    .optional()
    .default([]),
  needsReview: z.boolean().optional().default(false),
  reviewReason: z.string().optional(),
  notes: z.string().optional(),
})
const RawResultSchema = z.object({ lines: z.array(RawLineSchema) })

export async function parseRecipe(input: ParseRecipeInput): Promise<ParsedRecipeResult> {
  const normalized = normalizeRecipeText(input.rawText)
  if (normalized.length > MAX_INPUT_CHARS) {
    throw new Error('input-too-large')
  }

  const lines = splitIntoCandidateLines(normalized).slice(0, MAX_LINES)
  if (lines.length === 0) {
    return emptyResult()
  }

  // Per-line retrieval BEFORE the LLM call — top-5 candidates per line.
  const perLineCandidates: PerLineCandidates[] = await Promise.all(
    lines.map(async (line, idx) => ({
      lineNumber: idx + 1,
      line,
      candidates: await input.ingredientSearchFn(line, CANDIDATES_PER_LINE),
    })),
  )

  // id → candidate, so we can enrich the model's id-only matches with name +
  // source and reject any hallucinated id not in the candidate set.
  const candidateById = new Map<string, IngredientCandidate>()
  for (const { candidates } of perLineCandidates) {
    for (const c of candidates) candidateById.set(c.id, c)
  }

  const client = getAnthropicClient()
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildUserMessage(normalized, perLineCandidates),
            cache_control: { type: 'ephemeral' },
          },
        ],
      },
    ],
  })

  const usage = (response.usage ?? {}) as unknown as TokenUsage
  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')

  const parsedLines = mapModelOutput(text, perLineCandidates, candidateById)

  return {
    lines: parsedLines,
    promptTokens: usage.input_tokens ?? 0,
    completionTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    estimatedCostUsd: estimateCostUsd(usage),
    modelUsed: HAIKU_MODEL,
  }
}

/** Strip code fences + parse JSON; null on any failure. */
function safeParseJson(text: string): z.infer<typeof RawResultSchema> | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  try {
    const json = JSON.parse(cleaned)
    const result = RawResultSchema.safeParse(json)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function mapModelOutput(
  text: string,
  perLineCandidates: PerLineCandidates[],
  candidateById: Map<string, IngredientCandidate>,
): ParsedLine[] {
  const raw = safeParseJson(text)
  if (!raw) {
    // Fail-soft: surface every line as no-match so the partner can review or
    // fall back to Search & build, instead of throwing.
    return perLineCandidates.map(({ lineNumber, line }) => ({
      lineNumber,
      rawText: line,
      match: null,
      alternates: [],
      needsReview: true,
      reviewReason: 'no-match' as const,
      notes: 'The AI response could not be read. Review manually or switch to Search & build.',
    }))
  }

  const lineTextByNumber = new Map(perLineCandidates.map((p) => [p.lineNumber, p.line]))

  return raw.lines.map((rl) => {
    const rawText = rl.rawText ?? lineTextByNumber.get(rl.lineNumber) ?? ''

    // Resolve the match against the candidate set — reject hallucinated ids.
    let match: ParsedLine['match'] = null
    if (rl.match) {
      const cand = candidateById.get(rl.match.ingredientId)
      if (cand) {
        match = {
          ingredientId: cand.id,
          name: cand.name,
          source: cand.source,
          confidence: clamp01(rl.match.confidence),
          estimatedWeightG:
            rl.match.estimatedWeightG != null && rl.match.estimatedWeightG > 0
              ? rl.match.estimatedWeightG
              : null,
        }
      }
    }

    const alternates = rl.alternates
      .map((a) => {
        const cand = candidateById.get(a.ingredientId)
        return cand
          ? {
              ingredientId: cand.id,
              name: cand.name,
              source: cand.source,
              confidence: clamp01(a.confidence),
            }
          : null
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)

    const reviewReason = normalizeReviewReason(rl.reviewReason)
    // A hallucinated/absent match forces review even if the model said otherwise.
    const needsReview = rl.needsReview || match === null

    return {
      lineNumber: rl.lineNumber,
      rawText,
      match,
      alternates,
      needsReview,
      reviewReason: match === null && !reviewReason ? 'no-match' : reviewReason,
      notes: rl.notes,
    }
  })
}

function normalizeReviewReason(r: string | undefined): ReviewReason | undefined {
  if (r && (REVIEW_REASONS as string[]).includes(r)) return r as ReviewReason
  return undefined
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function emptyResult(): ParsedRecipeResult {
  return {
    lines: [],
    promptTokens: 0,
    completionTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCostUsd: 0,
    modelUsed: HAIKU_MODEL,
  }
}
