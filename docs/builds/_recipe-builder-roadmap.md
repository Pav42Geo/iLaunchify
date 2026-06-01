# Recipe Builder roadmap + Claude Code orchestration guide

Single-page reference. Read top-to-bottom in one sitting. Bookmark for the duration of the build cycle.

## The four slices at a glance

| # | Slice | Brief | Lift | Schema? | New deps? | Pavel housekeeping |
|---|---|---|---|---|---|---|
| 1 | Ingredients pre-work | `docs/builds/ingredients-prework-slice-1.md` | ~½ day | No | No | none (just typecheck) |
| 2 | Mode chooser shell | `docs/builds/ingredients-mode-chooser-slice-2.md` | ~½ day | Yes (additive enum) | No | prisma generate + restart next dev |
| 3 | AI Recipe Parser (Mode 2) | `docs/builds/ingredients-ai-parser-slice-3.md` | ~2 days | No (just PlanFeature reseed) | Yes (`@ilaunchify/ai`, `@anthropic-ai/sdk`) | `ANTHROPIC_API_KEY` in env + pnpm install + prisma db seed + restart |
| 4 | Declare panel (Mode 3) | `docs/builds/ingredients-declared-panel-slice-4.md` | ~2 days | Yes (additive enum + boolean) | No | prisma generate + prisma db seed + restart |

**Total: ~5 days of focused work for an experienced contributor. Each slice is independently shippable; nothing waits more than 24h on a previous slice's housekeeping.**

## Dependency graph

```
Slice 1 (pre-work) ──┐
                     ├──► Slice 3 (AI parser)
Slice 2 (chooser) ───┤
                     └──► Slice 4 (Declare panel)
```

Slice 1 and Slice 2 are independent. Either can ship first. Both must land before Slice 3 (AI parser uses banned-list enforcement from Slice 1 + chooser shell from Slice 2). Slice 4 only depends on Slice 2.

## Recommended ship order

1. **Slice 1** first — smallest, riskless, closes documented bugs.
2. **Slice 2** second — additive migration, low-risk, unlocks the chooser UI.
3. **Slice 3** third — biggest novel system, but everything else is in place.
4. **Slice 4** last — depends on Slice 2 only; you could ship it parallel with Slice 3 if you want two parallel sessions, but sequential is calmer.

## Source-of-truth docs you should NEVER skip

- **`docs/builds/ai-recipe-parser-economics.md`** — locked V1 numbers (Builder 1,000/mo, Agency 5,000/mo, 10/min, 100/day, 10KB cap), tier-gate pattern, prompt-caching strategy, cost-protection levers. Slice 3 reads this; never re-derive its numbers.
- **`docs/legal/FDA_REGULATORY_POSTURE.md` §5** — why Mode 3 needs the "Declared by manufacturer" disclosure. Non-negotiable.
- **`.claude/memory/ilaunchify-recipe-builder-modes.md`** — the 3-mode design lock. Mode 3 schema pattern (synthetic Whole Product ingredient) is here.
- **`.claude/memory/MEMORY.md` + `INDEX.md`** — auto-loaded by Claude Code. Make sure both reference `ilaunchify-recipe-builder-modes.md` before you start.

## Open Pavel decisions still on the table

These don't block shipping but should be locked before the slice that consumes them. Each is flagged inline in the relevant brief.

| Decision | Slice it affects | Default in brief | Pavel: confirm or override |
|---|---|---|---|
| Mode 3 tier gate: Builder+ or free-for-all? | Slice 4 | Builder+ (matches Mode 2 for parity) | edit PlanFeature seed if free-for-all |
| Maker AI tile visibility: show with upgrade CTA, or hide entirely? | Slice 3 | Show with "Upgrade to Builder" badge | hide if you prefer cleaner UI |
| Cap reset window: calendar month UTC or rolling 30 days? | Slice 3 | Calendar month UTC | edit `countParsesThisMonth` if rolling |
| Re-parse / feedback action: V1 or V1.1? | Slice 3 | V1.1 (after we have 100 real parses of data) | bump to V1 if you want immediately |

## How to drive Claude Code through this — exact paste sequence

### Setup once

Open a terminal in the repo root:

```bash
cd /Users/soundstation/Documents/CLAUDE/iLaunchify
claude
```

You should see CLAUDE.md auto-loaded. If you have not yet copied the auto-memory files into `.claude/memory/`, do that now per `docs/builds/_memory-to-add.md` (the file that surfaced when Cowork couldn't write into `.claude/`).

### Slice 1 — paste this

```
Ship Slice 1 of the Partner Ingredients pre-work — three changes in one PR.
Full brief at docs/builds/ingredients-prework-slice-1.md.

1. Banned-list save-time enforcement on addIngredientSlot + updateIngredientSlot
   (when baseIngredientId changes) + addReplacement. Reuse the existing
   isIngredientBanned() helper. Block with audit log + clear error, never mutate.

2. Picker empty-state staples panel — remove the q.length < 2 short-circuit
   in searchIngredients. Return recently-used (up to 8) + library staples
   (up to 12) when query is empty.

3. Recently-used recall — add getRecentlyUsedIngredients(partnerServiceId, 8)
   that queries IngredientUsage scoped to the calling partner, joins
   Ingredient, orders by lastUsedAt DESC.

Read the brief in full before touching code. No schema migration. No new
packages. Reapproval-marked behavior unchanged.

Verify: pnpm --filter @ilaunchify/partner typecheck.

Then /ship "Slice 1 ingredients pre-work — banned-list save-time enforcement
+ picker empty-state staples + recently-used".
```

**Wait for Claude Code to finish and ship. Read the diff. Manually smoke-test in dev.** Then move to Slice 2.

### Slice 2 — paste this

```
Ship Slice 2 — Mode chooser shell on the Partner IngredientsCard. Brief:
docs/builds/ingredients-mode-chooser-slice-2.md.

Three pieces in one PR:

1. Schema migration: ProductTemplate.recipeEntryMode (nullable) + new enum
   RecipeEntryMode { SEARCH_BUILD AI_PARSER DECLARED_PANEL }. Additive only.
   If prisma migrate dev hangs, hand-author SQL and use prisma migrate deploy.

2. ModeChooser client component — 3-tile chooser when recipe empty, collapsed
   pill when populated. AI_PARSER and DECLARED_PANEL render disabled with
   "Coming next" badges. Icons imported inside the client component.

3. setRecipeEntryMode server action that stamps mode if currently null (never
   overwrites). Also belt-and-suspenders stamp inside addIngredientSlot.
   Audit-log RECIPE_ENTRY_MODE_SET.

Reapproval-marked: mode set does NOT transition status.

Verify: pnpm --filter @ilaunchify/db prisma generate && pnpm --filter
@ilaunchify/partner typecheck.

Then /ship "Slice 2 ingredients mode chooser — 3-tile chooser +
recipeEntryMode + Mode 1 default wired".
```

**Pavel housekeeping after Slice 2 commit:**

```bash
pnpm --filter @ilaunchify/db prisma generate
# restart next dev (Ctrl+C then pnpm dev)
```

### Slice 3 — set env, then paste

Before pasting: set the Anthropic key.

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env.local
```

Then in Claude Code:

```
Ship Slice 3 — AI Recipe Parser (Mode 2, paste-only V1). Brief:
docs/builds/ingredients-ai-parser-slice-3.md. Economics + tier caps + rate
limits + cost-protection levers are LOCKED in
docs/builds/ai-recipe-parser-economics.md — that doc is the source of truth
on all the numbers. Do not re-derive them.

Major pieces:

1. New packages/ai workspace package — narrow @anthropic-ai/sdk + zod.
   Exports parseRecipe(input) with prompt caching on system prompt + per-line
   candidates block (cache_control: ephemeral).

2. Per-line search retrieval BEFORE the LLM call — top-5 candidates per
   line via existing searchIngredients. Never inject the full USDA index.

3. parseRecipeFromText server action with tier gate, three rate-limit
   windows (10/min, 100/day, monthly cap from PlanFeature), input size cap,
   normalize first, audit-log RECIPE_PARSE_RUN with token counts + cost.

4. commitParsedSlots server action that loops addIngredientSlot per accepted
   line. Banned-list enforcement automatic via Slice 1.

5. AiParserPanel client component — paste textarea + Extract button, then
   review-extracted list with per-line Accept/Edit/Skip/Swap-match, footer
   "Add N to recipe" button.

6. PlanFeature seed: maker false / 0, builder true / 1000, agency true / 5000
   for ai-recipe-parser + ai-recipe-parser-monthly-cap.

7. ModeChooser update: enable AI_PARSER tile for Builder+. Maker sees
   "Upgrade to Builder" badge linking to /settings/plan.

8. Add ANTHROPIC_API_KEY to .env.example. Add new audit actions.

NOT in scope: PDF/PNG/photo, vision LLM, Sonnet fallback, AiUsageCounter,
/admin/ai-usage dashboard, abuse-pattern cron, "I think this was wrong"
feedback.

Verify: pnpm install && pnpm --filter @ilaunchify/db prisma db seed && pnpm
--filter @ilaunchify/ai typecheck && pnpm --filter @ilaunchify/partner
typecheck.

Then /ship "Slice 3 Mode 2 AI Recipe Parser — paste-only V1 with tier gate
+ rate limits + Haiku prompt caching".
```

**Pavel housekeeping after Slice 3 commit:**

```bash
pnpm install                                       # picks up @ilaunchify/ai + @anthropic-ai/sdk
pnpm --filter @ilaunchify/db prisma db seed        # refreshes PlanFeature rows
# restart next dev
# in another terminal: tail -f / verify a real parse end-to-end
```

### Slice 4 — paste this

```
Ship Slice 4 — Mode 3 Declare panel. Brief:
docs/builds/ingredients-declared-panel-slice-4.md. Pattern locked: synthetic
Whole Product PARTNER_PRIVATE ingredient + ProductTemplate.nutrientSource
enum.

Pieces:

1. Schema migration: ProductTemplate.nutrientSource (enum COMPUTED|DECLARED,
   default COMPUTED) + Ingredient.isDeclaredPanelSynthetic (boolean, default
   false). Confirm ProductTemplate has servingSize, servingsPerContainer,
   ingredientStatement, netQuantity — add in same migration if missing.

2. declareNutritionPanel server action: tier-gate via
   hasFeature('declare-nutrition-panel'), upsert synthetic ingredient,
   replace all existing slots with one synthetic slot, set
   nutrientSource=DECLARED + recipeEntryMode=DECLARED_PANEL, transition
   PUBLISHED → PENDING_EDIT_REVIEW, audit DECLARE_NUTRITION_PANEL.

3. Compliance service patch: branch on nutrientSource. When DECLARED, return
   synthetic ingredient's nutritionPer100g directly, skip summation, set
   declaredByManufacturer flag.

4. NutritionFactsRenderer: italic "Declared by manufacturer" caption when
   declaredByManufacturer is true.

5. Public detail page: pink-tinted disclosure banner above panel when
   nutrientSource = DECLARED.

6. DeclaredPanelPanel client component: two-column form (nutrient grid +
   ingredient statement + allergens + net qty) on left, live label preview
   on right. Save triggers slot-replacement confirmation modal if existing
   slots.

7. searchIngredients filter: exclude isDeclaredPanelSynthetic=true.

8. PlanFeature seed: declare-nutrition-panel false / true / true per
   maker/builder/agency (Builder+ default per brief — Pavel-confirmed).

9. ModeChooser: enable DECLARED_PANEL tile for Builder+.

10. Audit: DECLARE_NUTRITION_PANEL action type.

Reapproval-marked: save transitions PUBLISHED → PENDING_EDIT_REVIEW.

Verify: pnpm --filter @ilaunchify/db prisma generate && pnpm --filter
@ilaunchify/db prisma db seed && pnpm --filter @ilaunchify/partner
typecheck && pnpm --filter @ilaunchify/marketing typecheck && pnpm --filter
@ilaunchify/ui typecheck.

Then /ship "Slice 4 Mode 3 Declare panel — nutrientSource enum + synthetic
Whole Product ingredient + public disclosure + Declared by manufacturer
caption".
```

**Pavel housekeeping after Slice 4 commit:**

```bash
pnpm --filter @ilaunchify/db prisma generate
pnpm --filter @ilaunchify/db prisma db seed
# restart next dev
```

## What to do if a slice fails midway

Claude Code agents can fail, lose context, or get stuck. Two patterns:

**If the agent reports the work as done but something is broken:** read the diff. The agent's summary describes what it intended, not necessarily what shipped. Verify with the smoke test in the brief. If broken, paste a follow-up: "X is broken in {file}:{line}. The brief at docs/builds/{slice}.md says it should {behavior}. Fix it."

**If the agent fails mid-flight (socket drop, context window, infinite loop):** stop it. Read git status to see what changed. Either:
- Roll back with `git restore .` and re-paste the slice prompt
- Or keep the partial work and tell a fresh agent: "Resume Slice N — I see {file} has the X piece but Y and Z aren't done. Continue from there."

## Forward-pointers — what comes after the four slices

These are V1.1 / V1.2 follow-ups. Don't ship them in this cycle.

- **Mode 2 V1.1:** PDF/PNG upload via R2 + Tesseract.js OCR feeding the same Haiku flow. ~1 day. New slice brief when partners ask for it.
- **Mode 2 V1.2:** Photo capture + vision LLM (Haiku 4.5 vision). Separate counter (100/mo Builder, 500/mo Agency per economics doc). ~1-2 days.
- **`/admin/ai-usage` dashboard:** built with `/ship-admin-surface ai-usage` once Slice 3 has been live for 2+ weeks and there's real telemetry to surface. ~1 day.
- **`AiUsageCounter` model:** when counting AuditLog rows for the cap check gets slow. Migration + counter increment inside the parse transaction. ~½ day.
- **Re-parse / feedback action:** "I think the AI got this wrong" button + admin review queue for quality improvement. V1.1. ~½ day.
- **Abuse-pattern cron:** flags partners hitting rate limits 3+ times in 7 days, identical-input bursts, bot cadence. ~½ day.
- **Mode 4 (future):** AI-suggested recipe from natural-language goal ("make me a low-sugar mango energy drink at 80 cal/serving"). Deferred to V2 — explicitly out of V1 scope.

## Telemetry to watch after each slice ships

| Slice | Watch for | Where |
|---|---|---|
| 1 | `INGREDIENT_BAN_BLOCK` audit entries | `/admin/audit?action=INGREDIENT_BAN_BLOCK` |
| 2 | `recipeEntryMode` distribution across templates | Prisma Studio or a small admin query |
| 3 | `RECIPE_PARSE_RUN` count + average token usage + average cost per parse | `/admin/audit?action=RECIPE_PARSE_RUN`; total cost = sum of payload.estimatedCostUsd |
| 3 | `RECIPE_PARSE_RATE_LIMITED` events — if any partner hits this 3+ times in 7d, reach out | same audit query |
| 4 | `DECLARE_NUTRITION_PANEL` events — these are high-value partners | same audit query |

A weekly `/morning briefing` style report would surface these — worth a `/scheduled-tasks` entry on Pavel's calendar once Slice 3 is live.

## Decision log

Anything Pavel locks during the build cycle goes here, dated, so future-Pavel doesn't have to re-derive.

- **2026-06-01** — 3-mode design locked. Synthetic Whole Product ingredient pattern locked for Mode 3.
- **2026-06-01** — AI parser gated to Builder+. Mode 3 tier gate recommended Builder+ but TBD.
- **2026-06-01** — V1 caps locked: Builder 1,000 text-parses/mo, Agency 5,000. Rate limits 10/min, 100/day. Input cap 10KB.
- **2026-06-01** — V1 paste-only. PDF/PNG = V1.1. Photo + vision LLM = V1.2.
- **2026-06-01** — Cap reset window: calendar month UTC.
- **2026-06-01** — V1 = count AuditLog rows for cap check. V1.5 = `AiUsageCounter` model when needed.

- **2026-06-01 (Slice 1)** — Audit action for slot/replacement banned-blocks reuses the EXISTING `INGREDIENT_BANNED_BLOCK` (the name `createPartnerPrivateIngredient` already writes), NOT the roadmap telemetry's `INGREDIENT_BAN_BLOCK`. One consistent action name across all ban paths beats matching the doc. **Telemetry query in §"Telemetry to watch" should read `action=INGREDIENT_BANNED_BLOCK`.**
- **2026-06-01 (Slice 1)** — `IngredientUsage` is scoped by `partnerId` (not partnerServiceId/userId). `getRecentlyUsedIngredients(partnerId, limit)` ordered by `lastUsedAt DESC`. Kept INTERNAL (not exported) — in a 'use server' file an export is a client RPC endpoint, and the helper takes a partnerId with no auth; `searchIngredients` authorizes before calling it.
- **2026-06-01 (Slice 1)** — `updateIngredientSlot` got NO ban check: it can't change `baseIngredientId` (only weight/replace-toggle/label), so there's no ingredient-introduction path to gate. The gate lives on `addIngredientSlot` + `addReplacement`.
- **2026-06-01 (Slice 1)** — Skipped the unit test from the brief: `apps/partner` has no test runner/script and no existing tests for these server actions (DB-integration, not unit-testable without a harness). Relied on typecheck + the brief's manual smoke test. Revisit when a partner test harness exists.
- **2026-06-01 (Slice 1)** — Empty-state picker already existed; this slice refined it to recent (≤8) + library staples (≤12) under two client subheaders, with a cold-seed USDA fallback when no LIBRARY rows.

- **2026-06-01 (Slice 2)** — `migrate dev` hangs locally as expected → hand-authored `20260601200000_add_recipe_entry_mode/migration.sql` (CREATE TYPE + ALTER TABLE) + `migrate deploy` + `prisma generate`. Pavel still needs `prisma generate` + `next dev` restart on his machine.
- **2026-06-01 (Slice 2)** — Adapted the brief's pseudocode to the real codebase: `authorize()` returns `{ user, partner, template }` (not `product`) — extended its select with `recipeEntryMode`; audit via `logAuditAs(user, …)` (not `writeAuditLog`); the belt-and-suspenders SEARCH_BUILD stamp lives INSIDE `addIngredientSlot`'s existing `$transaction` (atomic with the slot insert), no audit on that path (only `setRecipeEntryMode` writes `RECIPE_ENTRY_MODE_SET`).
- **2026-06-01 (Slice 2)** — `ModeChooser` is gated behind `isDraft` (matches the add-slot UI gate) — a non-draft template shows no chooser. Collapsed formula `!chooserExpanded && !isEmpty` per brief: tiles stay visible until the recipe has ≥1 slot, then it's a pill.

- **2026-06-01 (Slice 3) — GATE AUDIENCE RESOLVED.** The brief + economics doc gate Mode 2 on CREATOR Builder+ tiers, but it lives in the PARTNER builder (partner users have no CreatorProfile → `getCreatorTier` returns maker → blocks everyone) and partner tiers are CLAUDE.md-locked "no behavioral binding." **Pavel decision: gate by PARTNER plan feature, Trusted+** — `ai_recipe_parser` boolean + `ai_recipe_parser_monthly_cap`: verified off/0, trusted on/1000, premier on/5000. This intentionally unlocks partner-tier behavioral binding for this one feature. Rate limits 10/min + 100/day for all who have it.
- **2026-06-01 (Slice 3)** — The brief's helper API doesn't exist: `hasFeature`/`getFeatureValue` from `@ilaunchify/auth/tiers` were never built. Real API is `@ilaunchify/plans`: `hasFeature(planCode, featureCode)` + `getFeatureLimit(planCode, featureCode)` (intValue) + `partnerTierToPlanCode(tier)`. The cited memory `.claude/memory/ilaunchify-recipe-builder-modes.md` **does not exist** in the repo.
- **2026-06-01 (Slice 3)** — `AuditLog` columns are `actorId` + `at` (NOT `actorUserId`/`createdAt` as the brief pseudocode assumed). Rate-limit counts use those.
- **2026-06-01 (Slice 3)** — `commitParsedSlots` calls `setRecipeEntryMode('AI_PARSER')` BEFORE the addIngredientSlot loop (brief had it after). Slice 2's `addIngredientSlot` stamps SEARCH_BUILD when recipeEntryMode is null, so stamping after the loop would mis-record an AI-built recipe as SEARCH_BUILD.
- **2026-06-01 (Slice 3)** — **Reseed for this feature is `pnpm --filter @ilaunchify/db run seed:subscription-plans`, NOT the generic `prisma db seed`** (the generic seed doesn't include subscription plans). After reseed, restart `next dev` — `@ilaunchify/plans` holds an in-memory plan cache.
- **2026-06-01 (Slice 3)** — No self-serve partner-tier upgrade exists, so the locked AI tile shows an info-only "Trusted+" badge + tooltip (not an "Upgrade to Builder" deep-link, which only made sense for the creator model).
- **2026-06-01 (Slice 3)** — `@anthropic-ai/sdk ^0.40.0`, model `claude-haiku-4-5-20251001`, cost $1/MTok input + $5/MTok output (cache 1.25×/0.1×). Economics §13: VERIFY exact Haiku 4.5 pricing on console.anthropic.com before production. AiParserPanel multi-reason actions simplified to Accept/edit-weight/Skip for V1 (no "expand blend to N slots"); banned lines are caught at commit by addIngredientSlot, not at parse.

Append new decisions here as they're made.
