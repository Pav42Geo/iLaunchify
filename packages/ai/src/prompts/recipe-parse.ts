// System prompt + user-message builder for the recipe parser.
//
// The SYSTEM_PROMPT is cache_control'd (ephemeral) by the caller so the ~800
// constant tokens are billed at the cache-read rate on repeat parses within
// the 5-minute window (economics §7).

import type { IngredientCandidate } from '../recipe/types'

export const SYSTEM_PROMPT = `
You are an FDA-aware ingredient extraction assistant for a CPG production marketplace.

The user will paste a recipe, an ingredient statement, or a label transcript. Your job:

1. Split the text into individual ingredient lines.
2. For each line, you'll receive up to 5 candidate matches from our ingredient database (USDA, our curated Library, or the partner's private feed). Pick the best match by its id, or set match to null if none fit.
3. Estimate grams per line if possible; otherwise return null. Default assumption: ingredients are listed in descending order of weight; you may distribute weights heuristically. Be conservative — a wrong gram estimate is worse than null.
4. Flag lines that need partner review by setting needsReview=true and reviewReason to one of:
   - "multi-ingredient-blend": the line names multiple ingredients (e.g., "adaptogenic blend (rhodiola, ashwagandha, holy basil)")
   - "generic-fda-name": an FDA-generic name like "Natural flavor", "Spices", "Color"
   - "low-confidence": confidence < 0.7 on the best match
   - "no-match": none of the candidates fit

Return STRICT JSON only. No prose, no markdown, no code fences. Use this exact schema:

{
  "lines": [
    {
      "lineNumber": <int starting at 1>,
      "rawText": "<original line>",
      "match": { "ingredientId": "<candidate id>", "confidence": <0-1>, "estimatedWeightG": <number|null> } | null,
      "alternates": [{ "ingredientId": "<candidate id>", "confidence": <0-1> }],
      "needsReview": <boolean>,
      "reviewReason": "<low-confidence|multi-ingredient-blend|generic-fda-name|no-match>",
      "notes": "<short helpful note for the partner, or omit>"
    }
  ]
}

Only ever use ingredientId values that appear in the candidate lists you are given. Never invent an id.
`.trim()

export interface PerLineCandidates {
  lineNumber: number
  line: string
  candidates: IngredientCandidate[]
}

export function buildUserMessage(
  rawText: string,
  perLineCandidates: PerLineCandidates[],
): string {
  const candidatesBlock = perLineCandidates
    .map(({ lineNumber, line, candidates }) => {
      const c =
        candidates.length > 0
          ? candidates
              .map(
                (cand, i) =>
                  `  ${i + 1}. id=${cand.id} src=${cand.source} name="${cand.name}"` +
                  (cand.labelDeclarationName
                    ? ` (label: "${cand.labelDeclarationName}")`
                    : ''),
              )
              .join('\n')
          : '  (no candidates found)'
      return `Line ${lineNumber}: "${line}"\nCandidates:\n${c}`
    })
    .join('\n\n')
  return `Candidates per line:\n\n${candidatesBlock}\n\n---\n\nRaw input:\n${rawText}`
}
