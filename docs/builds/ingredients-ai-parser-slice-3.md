# Slice 3 — AI Recipe Parser (Mode 2, paste-only V1)

**Paste the prompt at the bottom into Claude Code. The economics doc at `docs/builds/ai-recipe-parser-economics.md` is the source of truth on pricing, caps, and cost protection — read it first.**

## Why this slice exists

The partner pastes their existing recipe or ingredient statement, an AI extracts each line, matches against USDA / Library / Partner-private, returns structured output with per-line confidence + estimated grams, and the partner reviews each match before any slot is written. The point is to compress "I have a spec sheet" → "I have a recipe in iLaunchify" from 15 minutes of manual slot-building to under 30 seconds of review.

This is the first piece of LLM functionality in the monorepo. Scope is deliberately tight: paste-text only, Haiku 4.5 only, paste flow only. PDF / PNG / photo are V1.1 / V1.2 (the chooser UI shows them as `disabled` with version badges).

Two days for an experienced contributor. New package. One additive migration (PlanFeature rows). One Anthropic API key in env.

## Prerequisites (must land first)

- **Slice 1** (`docs/builds/ingredients-prework-slice-1.md`) — banned-list save-time enforcement on `addIngredientSlot`. **Non-negotiable.** Mode 2 commits slots in bulk via `addIngredientSlot`; the ban check has to be on that path or banned ingredients will sneak in faster than admin can react.
- **Slice 2** (`docs/builds/ingredients-mode-chooser-slice-2.md`) — Mode chooser shell with the `recipeEntryMode` column. Slice 3 enables the AI_PARSER tile.
- **Anthropic API key** in env. Add to `.env.example`: `ANTHROPIC_API_KEY=`. Pavel sets the real value in `.env.local` and in Vercel / production env.

## Required reading FIRST

1. **`docs/builds/ai-recipe-parser-economics.md`** — the source of truth on tier caps (Maker none / Builder 1,000 / Agency 5,000 monthly text-parses), rate limits (10/min, 100/day), input cap (10KB), prompt caching strategy, cost-protection levers, and the §15 TL;DR block. **Cite this doc, don't re-derive its numbers.**
2. `.claude/memory/ilaunchify-recipe-builder-modes.md` — the 3-mode design lock + the tier-gate pattern.
3. `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/IngredientsCard.tsx` and `ModeChooser.tsx` (from Slice 2).
4. `apps/partner/src/app/(dashboard)/products/[id]/edit/card-actions.ts` — `addIngredientSlot` signature; you'll call it once per accepted line on commit.
5. `apps/partner/src/app/(dashboard)/products/[id]/edit/ingredient-actions.ts` — the existing `searchIngredients` action; your per-line retrieval calls into this.
6. `packages/auth/src/tiers.ts` — `hasFeature` and `getFeatureValue` helpers (from V1.5-T1).
7. `packages/plans/src/seed.ts` — where to add the new PlanFeature rows.
8. `packages/audit/src/types.ts` — add new audit action types.
9. `.claude/memory/ilaunchify-cockroachdb-no-db-text.md` + `ilaunchify-rsc-boundary-config.md` + `ilaunchify-migrate-dev-hangs-use-deploy.md`.

## What's in scope

1. **New `packages/ai` workspace package** — narrow, just-Anthropic, just-recipe-parsing.
2. **Server action** `parseRecipe(productTemplateId, rawText)` that gate-checks tier, rate-limits, normalizes input, runs per-line retrieval, calls Haiku with prompt caching, returns structured extraction (does NOT write slots).
3. **Client UI** for the AI mode: paste textarea + Extract button + review-extracted list with per-line Accept / Edit / Skip / Swap-match.
4. **Commit action** `commitParsedSlots(productTemplateId, acceptedLines)` that loops `addIngredientSlot` once per accepted line — reusing the existing slot-create action so banned-list + audit + reapproval logic all fire automatically.
5. **PlanFeature seed** — `ai-recipe-parser` (boolean) and `ai-recipe-parser-monthly-cap` (number) per tier.
6. **AuditLog actions** — `RECIPE_PARSE_RUN`, `RECIPE_PARSE_RATE_LIMITED`, `RECIPE_PARSE_FAILED`.
7. **Mode chooser** — enable the AI_PARSER tile (remove "Coming next" badge for Builder+ tiers, show upgrade-CTA on Maker).

## What's NOT in scope

- No PDF / PNG / file upload (V1.1).
- No photo / camera capture (V1.2).
- No vision LLM (V1.2).
- No `AiUsageCounter` model — count from AuditLog (V1.5 may upgrade per economics §8).
- No Sonnet fallback / re-parse escalation (V1.5+).
- No "I think this was wrong" feedback action (V1.1 per economics §14).
- No admin `/admin/ai-usage` surface yet (build with `/ship-admin-surface` after we have real usage data).
- No abuse-pattern cron (V1.1 — log raw events first, build the cron once we know the patterns).

## Architecture

```
Partner UI (client)
   │
   ▼ pastes text, clicks Extract
parseRecipe server action  ────────────────────────┐
   │                                                │
   ├─ authorize() — owner check                     │
   ├─ tier check via hasFeature('ai-recipe-parser') │
   ├─ rate check (minute/day/month via AuditLog)    │
   ├─ normalize input (strip whitespace, dedupe)    │
   ├─ size check (10KB cap)                         │
   ├─ split into candidate lines                    │
   ├─ for each line: searchIngredients(line) → top 5│
   ├─ build prompt with system + candidates + raw   │
   ├─ Anthropic Haiku call with cache_control       │
   ├─ parse structured JSON output                  │
   ├─ AuditLog RECIPE_PARSE_RUN with token counts   │
   └─ return ParsedRecipeResult to client           │
                                                    │
client renders review-extracted list                │
   │                                                │
   ▼ partner clicks "Add N to recipe"               │
commitParsedSlots server action                     │
   ├─ for each accepted line:                       │
   │    addIngredientSlot(...)  ←  re-uses Slice 1  │
   │    banned-list enforcement + audit             │
   └─ return commit summary                         │
```

## Implementation notes

### `packages/ai` — new workspace package

```
packages/ai/
├── package.json                  # deps: @anthropic-ai/sdk, zod
├── tsconfig.json
└── src/
    ├── index.ts                  # barrel
    ├── client.ts                 # Anthropic SDK init
    ├── prompts/
    │   └── recipe-parse.ts       # SYSTEM_PROMPT + buildUserMessage()
    ├── recipe/
    │   ├── normalize.ts          # stripWhitespace, dedupe, drop non-ingredient lines
    │   ├── retrieve.ts           # per-line search via callbacks (injected so we don't depend on apps/partner)
    │   ├── parse.ts              # main entrypoint: parseRecipe()
    │   └── types.ts              # ParsedLine, ParsedRecipeResult, ParseRecipeInput
    └── telemetry.ts              # cost calc from usage tokens, prompt-cache hit ratio
```

`package.json`:

```json
{
  "name": "@ilaunchify/ai",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.40.0",
    "zod": "^3.23.0"
  }
}
```

Update root `pnpm-workspace.yaml` if needed (likely already wildcards `packages/*`).

### Types

```ts
// packages/ai/src/recipe/types.ts
export interface ParseRecipeInput {
  rawText: string
  ingredientSearchFn: (query: string, limit: number) => Promise<IngredientCandidate[]>
}

export interface IngredientCandidate {
  id: string
  name: string
  source: 'USDA' | 'LIBRARY' | 'PARTNER_PRIVATE'
  labelDeclarationName?: string | null
  allergenFlags?: string[]
}

export interface ParsedLine {
  lineNumber: number
  rawText: string
  match: {
    ingredientId: string
    name: string
    source: 'USDA' | 'LIBRARY' | 'PARTNER_PRIVATE'
    confidence: number  // 0–1
    estimatedWeightG: number | null  // null = couldn't estimate
  } | null
  alternates: Array<{ ingredientId: string; name: string; source: string; confidence: number }>
  needsReview: boolean
  reviewReason?: 'low-confidence' | 'multi-ingredient-blend' | 'banned' | 'generic-fda-name' | 'no-match'
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
```

### System prompt

`packages/ai/src/prompts/recipe-parse.ts`:

```ts
export const SYSTEM_PROMPT = `
You are an FDA-aware ingredient extraction assistant for a CPG production marketplace.

The user will paste a recipe, an ingredient statement, or a label transcript. Your job:

1. Split the text into individual ingredient lines.
2. For each line, you'll receive 5 candidate matches from our ingredient database (USDA, our curated Library, or the partner's private feed). Pick the best match or set match=null.
3. Estimate grams per line if possible; otherwise return null. Default assumption: ingredients listed in descending order of weight; you may distribute weights heuristically. Mark estimatedWeightG conservatively.
4. Flag lines that need partner review:
   - "multi-ingredient-blend": line names multiple ingredients (e.g., "adaptogenic blend (rhodiola, ashwagandha, holy basil)")
   - "generic-fda-name": FDA-generic names like "Natural flavor", "Spices", "Color"
   - "low-confidence": confidence < 0.7 on the best match
   - "no-match": none of the candidates fit

Return STRICT JSON only. No prose, no markdown. Schema:

{
  "lines": [
    {
      "lineNumber": <int starting 1>,
      "rawText": "<original line>",
      "match": { "ingredientId": "<id>", "confidence": <0–1>, "estimatedWeightG": <number|null> } | null,
      "alternates": [{ "ingredientId": "<id>", "confidence": <0–1> }],
      "needsReview": <boolean>,
      "reviewReason": "<one of the flags above>",
      "notes": "<short helpful note for the partner|null>"
    }
  ]
}
`.trim()
```

User message builder:

```ts
export function buildUserMessage(rawText: string, perLineCandidates: Array<{ lineNumber: number; line: string; candidates: IngredientCandidate[] }>): string {
  const candidatesBlock = perLineCandidates
    .map(({ lineNumber, line, candidates }) => {
      const c = candidates
        .map((cand, i) => `  ${i + 1}. id=${cand.id} src=${cand.source} name="${cand.name}"${cand.labelDeclarationName ? ` (label: "${cand.labelDeclarationName}")` : ''}`)
        .join('\n')
      return `Line ${lineNumber}: "${line}"\nCandidates:\n${c}`
    })
    .join('\n\n')
  return `Candidates per line:\n\n${candidatesBlock}\n\n---\n\nRaw input:\n${rawText}`
}
```

### Anthropic call with caching

```ts
// packages/ai/src/recipe/parse.ts
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT, buildUserMessage } from '../prompts/recipe-parse'
import { normalizeRecipeText } from './normalize'
import type { ParseRecipeInput, ParsedRecipeResult } from './types'

const MODEL = 'claude-haiku-4-5-20251001'
const client = new Anthropic()  // reads ANTHROPIC_API_KEY from env

export async function parseRecipe(input: ParseRecipeInput): Promise<ParsedRecipeResult> {
  const normalized = normalizeRecipeText(input.rawText)
  if (normalized.length > 10_000) {
    throw new Error('input-too-large')
  }
  const lines = splitIntoCandidateLines(normalized)
  const perLineCandidates = await Promise.all(
    lines.map(async (line, idx) => ({
      lineNumber: idx + 1,
      line,
      candidates: await input.ingredientSearchFn(line, 5),
    }))
  )

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
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

  const text = response.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('')
  const parsed = safeParseJson(text)  // zod-validate against ParsedLine[] schema

  const usage = response.usage
  return {
    lines: parsed.lines,
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    estimatedCostUsd: estimateCost(usage, MODEL),
    modelUsed: MODEL,
  }
}
```

`safeParseJson` should use zod with a strict schema; on parse failure, return a `ParsedRecipeResult` with all lines flagged `needsReview: true, reviewReason: 'no-match'` and a top-level error note rather than throwing — the UX should still let the partner fall back to Search & build.

### Server action wiring

`apps/partner/src/app/(dashboard)/products/[id]/edit/recipe-parser-actions.ts`:

```ts
'use server'

import { authorize } from './_authorize'
import { hasFeature, getFeatureValue } from '@ilaunchify/auth/tiers'
import { parseRecipe } from '@ilaunchify/ai'
import { searchIngredients } from './ingredient-actions'
import { writeAuditLog } from '@ilaunchify/audit'
import { prisma } from '@ilaunchify/db'

const MINUTE_LIMIT = 10
const DAY_LIMIT = 100

export async function parseRecipeFromText(productTemplateId: string, rawText: string) {
  const { user, product, partnerService } = await authorize(productTemplateId)
  const creatorTier = user.creator?.subscriptionTier ?? 'maker'

  if (!hasFeature(creatorTier, 'ai-recipe-parser')) {
    return { ok: false as const, error: 'upgrade-required' }
  }

  const monthlyCap = getFeatureValue(creatorTier, 'ai-recipe-parser-monthly-cap')
  const [minuteCount, dayCount, monthCount] = await Promise.all([
    countParses(user.id, '1 minute'),
    countParses(user.id, '1 day'),
    countParsesThisMonth(user.id),
  ])
  if (minuteCount >= MINUTE_LIMIT) {
    await logRateLimit(user.id, productTemplateId, 'minute')
    return { ok: false as const, error: 'rate-limit-minute' }
  }
  if (dayCount >= DAY_LIMIT) {
    await logRateLimit(user.id, productTemplateId, 'day')
    return { ok: false as const, error: 'rate-limit-day' }
  }
  if (monthCount >= monthlyCap) {
    await logRateLimit(user.id, productTemplateId, 'month')
    return { ok: false as const, error: 'cap-reached', used: monthCount, cap: monthlyCap }
  }

  try {
    const result = await parseRecipe({
      rawText,
      ingredientSearchFn: (q, limit) =>
        searchIngredients({ q, limit, partnerServiceId: partnerService.id }).then(r => r.rows ?? []),
    })

    await writeAuditLog({
      actorUserId: user.id,
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'RECIPE_PARSE_RUN',
      payload: {
        lineCount: result.lines.length,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        cacheReadTokens: result.cacheReadTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        modelUsed: result.modelUsed,
      },
    })
    return { ok: true as const, result }
  } catch (err) {
    await writeAuditLog({
      actorUserId: user.id,
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'RECIPE_PARSE_FAILED',
      payload: { error: String(err) },
    })
    return { ok: false as const, error: 'parse-failed', detail: String(err) }
  }
}

async function countParses(userId: string, window: '1 minute' | '1 day') {
  const since = window === '1 minute'
    ? new Date(Date.now() - 60_000)
    : new Date(Date.now() - 86_400_000)
  return prisma.auditLog.count({
    where: { actorUserId: userId, action: 'RECIPE_PARSE_RUN', createdAt: { gte: since } },
  })
}

async function countParsesThisMonth(userId: string) {
  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return prisma.auditLog.count({
    where: { actorUserId: userId, action: 'RECIPE_PARSE_RUN', createdAt: { gte: startOfMonth } },
  })
}
```

### Commit action

```ts
export async function commitParsedSlots(
  productTemplateId: string,
  acceptedLines: Array<{ ingredientId: string; weightG: number; lineNumber: number }>
) {
  'use server'
  const { user } = await authorize(productTemplateId)

  const results = []
  for (const line of acceptedLines) {
    const res = await addIngredientSlot(productTemplateId, {
      baseIngredientId: line.ingredientId,
      weightG: line.weightG,
      allowReplacement: true,
    })
    results.push({ lineNumber: line.lineNumber, ok: res.ok, error: res.error })
  }

  // Stamp recipeEntryMode if null (Slice 2 wired this on slot add; this is belt-and-suspenders for the chooser race)
  await setRecipeEntryMode(productTemplateId, 'AI_PARSER')

  await writeAuditLog({
    actorUserId: user.id,
    entityType: 'ProductTemplate',
    entityId: productTemplateId,
    action: 'RECIPE_PARSE_COMMIT',
    payload: { committed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length },
  })

  return { ok: true, results }
}
```

Note: banned-list enforcement happens inside `addIngredientSlot` per Slice 1, so a banned line caught by the parser but missed at parse time still gets blocked at commit time. Belt-and-suspenders.

### PlanFeature seed update

`packages/plans/src/seed.ts` — add rows per tier:

```ts
const PLAN_FEATURES = [
  // ... existing
  { tier: 'maker',   key: 'ai-recipe-parser',                value: 'false', kind: 'boolean' },
  { tier: 'builder', key: 'ai-recipe-parser',                value: 'true',  kind: 'boolean' },
  { tier: 'agency',  key: 'ai-recipe-parser',                value: 'true',  kind: 'boolean' },
  { tier: 'maker',   key: 'ai-recipe-parser-monthly-cap',    value: '0',     kind: 'number' },
  { tier: 'builder', key: 'ai-recipe-parser-monthly-cap',    value: '1000',  kind: 'number' },
  { tier: 'agency',  key: 'ai-recipe-parser-monthly-cap',    value: '5000',  kind: 'number' },
]
```

Reseed: `pnpm --filter @ilaunchify/db prisma db seed`.

### AuditLog action types

Extend `packages/audit/src/types.ts`:

```ts
export const AUDIT_ACTIONS = [
  // ... existing
  'RECIPE_PARSE_RUN',
  'RECIPE_PARSE_FAILED',
  'RECIPE_PARSE_RATE_LIMITED',
  'RECIPE_PARSE_COMMIT',
  'RECIPE_ENTRY_MODE_SET',  // from Slice 2 — already added there
] as const
```

### Client UI

Two pieces — the input panel and the review panel. Drop both inside a new `AiParserPanel.tsx` mounted by `IngredientsCard.tsx` when `chooserMode === 'AI_PARSER'`.

Match the layout from the Cowork mockup:
- **Step 1 (Provide source):** Cream sub-card with paste textarea on the left, disabled-with-`v1.1` PDF drop zone and disabled-with-`v1.2` camera capture on the right. Black-pill `Extract` button.
- **Step 2 (Review extracted):** Card containing the count summary ("Review 11 lines from your spec sheet · 8 high-confidence · 2 to choose · 1 blocked") and a list of line-cards. Each card renders:
  - The raw quoted text
  - The matched ingredient (with source pill, confidence badge, estimated grams)
  - Three action buttons: Accept / Edit weight / Skip
  - Warning state if `needsReview === true` with the specific `reviewReason` rendering different actions (`multi-ingredient-blend` → Expand to N slots / Keep as private blend / Skip)
  - Block state if `reviewReason === 'banned'` with `Request exception / Replace / Skip`
- **Footer bar:** "Ready to write N slots · M lines still need attention" + Cancel + black-pill `Add N to recipe` button.

Don't write slots until the partner clicks `Add N to recipe`. All staging is client-side React state until that button fires `commitParsedSlots`.

### Mode chooser update

In `ModeChooser.tsx` (from Slice 2), remove the `disabled` and `badge="Coming next"` from the AI_PARSER tile if the partner's tier supports it:

```tsx
<ModeTile mode="AI_PARSER" icon={Sparkles} title="Parse with AI" sub="..." when="Fastest from spec sheet"
  disabled={!aiAvailable}
  badge={aiAvailable ? undefined : 'Upgrade to Builder'}
  onClick={aiAvailable ? () => onSelect('AI_PARSER') : openUpgrade}
/>
```

`aiAvailable` is derived server-side and passed as a prop from IngredientsCard. `openUpgrade` deep-links to `/settings/plan`.

Maker tier sees the tile with "Upgrade to Builder" badge — drives conversion.

## Environment + dependencies

Add to `.env.example`:

```
ANTHROPIC_API_KEY=
```

Pavel must set this in `.env.local` and in production env before the parse action can succeed. Add a clear error in `parseRecipe` if the key is missing: `throw new Error('ANTHROPIC_API_KEY not configured')`.

Add to `apps/partner/package.json` deps:

```json
"@ilaunchify/ai": "workspace:*"
```

Pavel will `pnpm install` after this lands.

## Rate-limit error UX

Each of the three error codes from `parseRecipeFromText` renders distinctly in the client:

| Error | Toast text | Action |
|---|---|---|
| `upgrade-required` | "AI parsing is on Builder ($49/mo). Save hours per recipe." | "Upgrade" → `/settings/plan` |
| `rate-limit-minute` | "Slow down — you've parsed 10 recipes in the last minute." | "Try again in 30s" |
| `rate-limit-day` | "You've hit your daily parse limit (100). Resets at midnight UTC." | "Switch to Search & build" |
| `cap-reached` | "You've used N of N monthly parses on the Builder tier. Resets at the start of next month." | "Talk to us" → support form |
| `parse-failed` | "The AI couldn't extract this recipe. Switch to Search & build." | "Switch to Search & build" |
| `input-too-large` | "Your input is over 10KB. Split it into smaller sections." | n/a |

## Telemetry

`parseRecipe` returns token counts + estimated cost. The audit log row captures these. In Pavel's `/admin/audit` you can query `where action = 'RECIPE_PARSE_RUN'` to see real cost over time. When usage stabilizes, build the `/admin/ai-usage` dashboard per economics §9 (separate slice).

## Verify before reporting done

```bash
pnpm install
pnpm --filter @ilaunchify/db prisma db seed
pnpm --filter @ilaunchify/ai typecheck
pnpm --filter @ilaunchify/partner typecheck
```

Manual smoke test:
1. Ensure `ANTHROPIC_API_KEY` is set in `.env.local`.
2. Log in as a Builder-tier partner. Create a DRAFT product. Open the editor.
3. Click "Parse with AI". Paste: `INGREDIENTS: Water, sugar, citric acid, natural flavor, sodium benzoate.`
4. Click Extract. Confirm 5 line-cards render with matches.
5. Click "Add 5 to recipe". Confirm slots appear in the ingredients list with the right ingredients + grams.
6. Confirm `recipeEntryMode = AI_PARSER` on the product row.
7. Confirm `RECIPE_PARSE_RUN` audit log row appears in `/admin/audit` with token counts.
8. Try to parse again 11 times in a row — confirm rate-limit-minute kicks in at attempt 11.
9. Log in as a Maker. Confirm the AI tile shows "Upgrade to Builder" badge and links to /settings/plan.

## Commit

```
/ship "Slice 3 Mode 2 AI Recipe Parser — paste-only V1 with tier gate + rate limits + Haiku prompt caching"
```

After commit, remind Pavel:

```
Pavel:
  1. Set ANTHROPIC_API_KEY in .env.local and in production env.
  2. pnpm install
  3. pnpm --filter @ilaunchify/db prisma db seed  (refresh PlanFeature rows)
  4. Restart next dev
```

## Paste-ready prompt for Claude Code

```
Ship Slice 3 — AI Recipe Parser (Mode 2, paste-only V1). Brief:
docs/builds/ingredients-ai-parser-slice-3.md. Economics + tier caps + rate
limits + cost-protection levers are LOCKED in
docs/builds/ai-recipe-parser-economics.md — that doc is the source of truth on
all the numbers.

Major pieces:

1. New packages/ai workspace package — narrow @anthropic-ai/sdk + zod. Exports
   parseRecipe(input) with prompt caching (cache_control: ephemeral) on the
   system prompt + per-line candidates block.

2. Per-line search retrieval BEFORE the LLM call — for each candidate line,
   call existing searchIngredients() to get top-5 candidates (USDA + Library +
   Partner-private), inject only those into the prompt. Do not inject the
   full USDA index.

3. parseRecipeFromText server action in apps/partner/.../recipe-parser-actions.ts
   that:
     - authorize() — ownership check
     - hasFeature('ai-recipe-parser') tier gate, getFeatureValue for monthly cap
     - rate checks 10/min + 100/day + monthly cap (count AuditLog
       RECIPE_PARSE_RUN rows for this user)
     - input size cap 10KB, normalize first
     - call parseRecipe from packages/ai
     - write RECIPE_PARSE_RUN audit row with token counts + estimated cost
     - return structured extraction (does NOT write slots)

4. commitParsedSlots server action that loops addIngredientSlot once per
   accepted line. Banned-list enforcement runs automatically inside
   addIngredientSlot per Slice 1.

5. AiParserPanel client component mounted by IngredientsCard when
   chooserMode === 'AI_PARSER'. Two steps: paste textarea + Extract button,
   then review-extracted list with per-line Accept/Edit/Skip/Swap-match,
   footer "Add N to recipe" button.

6. PlanFeature seed: maker false / 0, builder true / 1000, agency true / 5000
   for ai-recipe-parser + ai-recipe-parser-monthly-cap. Reseed after.

7. ModeChooser update: remove disabled + Coming-next from AI_PARSER tile when
   tier supports it. Maker sees "Upgrade to Builder" badge linking to
   /settings/plan.

8. Add ANTHROPIC_API_KEY to .env.example. Add new audit actions to
   packages/audit/src/types.ts.

NOT in scope: PDF/PNG/photo (V1.1/V1.2), vision LLM, Sonnet fallback,
AiUsageCounter model, /admin/ai-usage dashboard, abuse-pattern cron, "I think
this was wrong" feedback. All forward-pointers in the economics doc.

Verify: pnpm install && pnpm --filter @ilaunchify/db prisma db seed && pnpm
--filter @ilaunchify/ai typecheck && pnpm --filter @ilaunchify/partner
typecheck.

Then /ship "Slice 3 Mode 2 AI Recipe Parser — paste-only V1 with tier gate +
rate limits + Haiku prompt caching".

After commit, remind Pavel to set ANTHROPIC_API_KEY in .env.local + production
env, pnpm install, reseed, restart next dev.
```
