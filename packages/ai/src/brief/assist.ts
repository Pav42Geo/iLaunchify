// assistBrief — V1.5 AI brief-assist entrypoint (2026-07-11).
//
// Pipeline mirrors parseRecipe: size-cap → Haiku call with prompt caching →
// zod-validate → reject any claim outside the caller's allow-list (closed
// vocabulary — BRIEF_CLAIM_POOL feeds fit-scoring, so hallucinated claims
// must never leak into a brief) → result with token counts + cost.
//
// Fail-soft: unparseable model output returns ok:false — the Brief Builder
// simply keeps its manual flow; assist is sugar, never a dependency.

import { z } from 'zod'
import { getAnthropicClient, HAIKU_MODEL } from '../client'
import { BRIEF_ASSIST_SYSTEM_PROMPT, buildBriefAssistMessage } from '../prompts/brief-assist'
import { estimateCostUsd, type TokenUsage } from '../telemetry'

export const MAX_ASSIST_INPUT_CHARS = 2_000

export interface BriefAssistInput {
  /** The creator's rough idea text (title draft + key ingredients + anything typed). */
  idea: string
  nicheName: string
  categoryName: string
  /** Closed claim vocabulary — suggestions outside this list are dropped. */
  allowedClaims: readonly string[]
}

export interface BriefAssistSuggestion {
  title: string
  claims: string[]
  keyIngredients: string
  makerNotes: string
}

export type BriefAssistResult =
  | {
      ok: true
      suggestion: BriefAssistSuggestion
      /** Claims the model proposed but the allow-list rejected (telemetry). */
      rejectedClaims: string[]
      promptTokens: number
      completionTokens: number
      estimatedCostUsd: number
      modelUsed: string
    }
  | { ok: false; error: 'input-too-large' | 'input-empty' | 'unparseable' }

const RawSchema = z.object({
  title: z.string().default(''),
  claims: z.array(z.string()).default([]),
  keyIngredients: z.string().default(''),
  makerNotes: z.string().default(''),
})

export async function assistBrief(input: BriefAssistInput): Promise<BriefAssistResult> {
  const idea = input.idea.trim()
  if (!idea) return { ok: false, error: 'input-empty' }
  if (idea.length > MAX_ASSIST_INPUT_CHARS) return { ok: false, error: 'input-too-large' }

  const client = getAnthropicClient()
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: BRIEF_ASSIST_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildBriefAssistMessage({
              idea,
              nicheName: input.nicheName,
              categoryName: input.categoryName,
              allowedClaims: input.allowedClaims,
            }),
          },
        ],
      },
    ],
  })

  const usage = (response.usage ?? {}) as unknown as TokenUsage
  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')

  let raw: z.infer<typeof RawSchema>
  try {
    raw = RawSchema.parse(JSON.parse(text))
  } catch {
    return { ok: false, error: 'unparseable' }
  }

  // Closed-vocabulary guard — drop anything the allow-list doesn't contain.
  const allowed = new Set(input.allowedClaims)
  const claims = [...new Set(raw.claims)].filter((c) => allowed.has(c)).slice(0, 4)
  const rejectedClaims = raw.claims.filter((c) => !allowed.has(c))

  return {
    ok: true,
    suggestion: {
      title: raw.title.trim().slice(0, 60),
      claims,
      keyIngredients: raw.keyIngredients.trim().slice(0, 200),
      makerNotes: raw.makerNotes.trim().slice(0, 240),
    },
    rejectedClaims,
    promptTokens: usage.input_tokens ?? 0,
    completionTokens: usage.output_tokens ?? 0,
    estimatedCostUsd: estimateCostUsd(usage),
    modelUsed: HAIKU_MODEL,
  }
}
