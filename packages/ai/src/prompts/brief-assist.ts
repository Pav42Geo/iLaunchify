// Brief-assist prompt (V1.5 AI brief-assist, 2026-07-11). The Brief Builder's
// "✨ Suggest for me" — turns a creator's rough idea into a titled, claimed,
// maker-readable brief. CLOSED VOCABULARY: suggested claims must come from the
// allow-list we pass in (BRIEF_CLAIM_POOL feeds fit-scoring platform-wide);
// anything else is rejected by the caller, mirroring the recipe parser's
// candidate-set guard.

export const BRIEF_ASSIST_SYSTEM_PROMPT = `You help CPG creators write product briefs for manufacturers on a B2B production marketplace.

Given a creator's rough idea, produce STRICT JSON (no markdown, no fences, no commentary):

{
  "title": string,            // punchy product name, <= 60 chars, no quotes/emoji
  "claims": string[],         // 0-4 items, ONLY from the ALLOWED CLAIMS list, only where the idea clearly supports them
  "keyIngredients": string,   // <= 200 chars, comma-separated hero ingredients a manufacturer would recognize; "" if the idea names none and none are strongly implied
  "makerNotes": string        // <= 240 chars, one plain paragraph telling a manufacturer what matters most (format, texture, audience, constraint). No hype.
}

Rules:
- Never invent claims the idea doesn't support ("Organic" only if the creator says organic).
- Never include a claim that is not in the ALLOWED CLAIMS list, even if accurate.
- Prefer the creator's own words for the title where they work.
- If the idea is too thin to help with a field, return "" (or [] for claims) — an empty suggestion is better than an invented one.`

export function buildBriefAssistMessage(input: {
  idea: string
  nicheName: string
  categoryName: string
  allowedClaims: readonly string[]
}): string {
  return [
    `NICHE: ${input.nicheName}`,
    `CATEGORY: ${input.categoryName}`,
    `ALLOWED CLAIMS: ${input.allowedClaims.join(' | ')}`,
    '',
    'CREATOR IDEA:',
    input.idea,
  ].join('\n')
}
