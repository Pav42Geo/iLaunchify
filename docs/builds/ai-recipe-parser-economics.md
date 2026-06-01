# AI Recipe Parser — economics, pricing & cost protection (V1 locked)

Reference document for Mode 2 of the Partner Product Builder's Ingredients card. Locks the pricing model, the per-tier quotas, the engineering cost-protection levers, and the implementation pattern. The future Mode 2 build brief reads this as the source of truth on anything money-related.

## Executive summary

Cost per parse is ~$0.01 average, ~$0.02 worst case at current Claude Haiku 4.5 pricing. Against the Builder ($49/mo) and Agency ($199/mo) tier prices, you cannot lose money on this feature at any reasonable usage. The real risk isn't per-parse cost — it's a single partner pointing automation at the endpoint.

**Pricing model: include in Builder+ tier subscription, soft monthly caps, hard rate limits.** No per-parse charge, no quota overages, no credit system. Pay-per-parse pricing complexity destroys the moment of value the feature is supposed to deliver.

**V1 numbers locked:**
- Maker: not available
- Builder: 1,000 text-parses/month, 10/min, 100/day
- Agency: 5,000 text-parses/month, 10/min, 100/day
- Input cap: 10KB raw text
- Vision mode (V1.2): Builder 100/mo, Agency 500/mo — separate counter

## The math

A typical recipe parse looks like:

**Input (prompt):**
- System prompt with parsing instructions: ~800 tokens
- Per-line search candidates (top-5 USDA/Library/Private matches per line × ~10 lines × ~30 tokens each): ~1,500 tokens
- Raw text the partner pasted: ~200 tokens

**Total input: ~2,500 tokens average. Complex supplement label with 20+ ingredients: ~6,000-8,000 tokens.**

**Output (structured JSON, line text + matched ingredient ID + confidence + estimated grams):**
- ~70 tokens per line × 10 lines = ~700 tokens average
- Complex label: ~2,000 tokens

| Parse type | Input tokens | Output tokens | Input $ | Output $ | **Total** |
|---|---|---|---|---|---|
| Typical recipe | 2,500 | 700 | $0.0025 | $0.0035 | **~$0.006** |
| Heavy supplement | 7,000 | 2,000 | $0.007 | $0.010 | **~$0.017** |

At Claude Haiku 4.5 pricing — estimate of ~$1.00 input / $5.00 output per million tokens, based on the historical Haiku pattern. **The Mode 2 slice author must verify exact 4.5 pricing on console.anthropic.com before going to production**; if it materially changed, re-run the sensitivity analysis in §13.

**Round figure: ~1¢ per parse average, ~2¢ worst case.** With prompt caching (§7 below), drop another 30-40% on repeat parses within the cache window.

## Usage profiles

Estimated partner behavior:

| Profile | Parses/month | Raw API cost/mo |
|---|---|---|
| New partner, first month | 5-30 | $0.05-0.30 |
| Active partner, steady state | 20-50 | $0.20-0.50 |
| Power partner (agency, multi-brand) | 100-300 | $1-3 |
| Heavy single-partner workflow | 500-1,000 | $5-10 |
| Abuse attempt | 1,000+ | $10+ |

Against subscription revenue: at any of the realistic profiles you're 95-99% margin on the AI feature. Even at the abuse threshold a Builder partner generating $10 of API cost on a $49 subscription is still ~80% margin on this single feature — and that's the point at which the soft cap kicks in to talk to them.

## The three pricing models considered

### A — Included in Builder+ tier, soft cap (RECOMMENDED)

Build it into the subscription. Monthly soft cap per tier. Admin alert at 80%. Hard stop with "talk to us" link at 100%.

**Pros:** Predictable revenue, predictable cost, zero billing complexity, instant value at moment of use, simple message ("Your tier includes AI parsing"), drives Maker → Builder upgrades.

**Cons:** Need a counter + monthly reset. Need monitoring. Risk on rogue partner is real but bounded.

### B — Quota model with overages

Builder gets 100 parses/mo included, Agency gets 500. Overages metered at $0.05-$0.10 per parse (5-10x markup).

**Pros:** Explicit cost cap. Generates incremental revenue from heavy users.

**Cons:** Stripe metered billing complexity. Every parse becomes a billing event. Partners hesitate before each parse ("will I go over?"). Marginal revenue at the overage tier is small ($0.05 × 1,000 parses = $50/mo extra) for the operational burden.

### C — Pay-per-parse always

$0.10-0.25 per parse, no inclusion. Simple but creates friction on every use.

**Pros:** Pure cost recovery. No quota engineering.

**Cons:** Kills the feature's promise. "Fastest from spec sheet" doesn't survive "we charge you 15¢ each time."

## Recommendation locked — Model A

Reasoning:
1. Cost-per-parse is negligible against subscription revenue. 95-99% feature-margin floor across realistic usage.
2. Pricing complexity destroys the moment of value. A partner who has to estimate "how many parses do I need?" before trying the feature won't try the feature.
3. Subscription = predictable cost + predictable revenue + simple message.
4. The real cost protection isn't per-parse pricing — it's the soft cap + engineering levers in §7.
5. Free Mode 1 + AI in Builder+ is a sharper upgrade incentive than a 100-parse quota everyone constantly hits.

## Specific numbers locked for V1

### Per-tier feature gates

Add these to the `PlanFeature` seed in `packages/plans/src/seed.ts`:

| Feature key | Maker | Builder | Agency |
|---|---|---|---|
| `ai-recipe-parser` (boolean) | false | true | true |
| `ai-recipe-parser-monthly-cap` (number) | 0 | 1000 | 5000 |
| `ai-recipe-parser-vision` (boolean) | false | true | true |
| `ai-recipe-parser-vision-monthly-cap` (number) | 0 | 100 | 500 |

### Rate limits (both tiers, same)

| Window | Limit | Behavior at limit |
|---|---|---|
| 1 minute | 10 parses | Returns `{ ok: false, error: 'rate-limit-minute' }` with retry-after seconds |
| 1 day | 100 parses | Returns `{ ok: false, error: 'rate-limit-day' }` |
| 1 month | tier cap | Returns `{ ok: false, error: 'cap-reached' }` with "Contact us to extend" CTA |

### Input cap

10KB raw text after normalization. Reject earlier inputs with a clear "split your recipe into sections" message. (Avoids tokens-from-a-single-bot-paste runaway.)

### Cache TTL

5 minutes on the system prompt + USDA candidate retrieval block. Drops repeat-parse cost 30-40% with zero UX impact.

### Counter reset

Monthly cap resets at the start of each calendar month UTC. Day/minute caps are rolling windows.

## Engineering cost-protection levers (all mandatory)

These are independent of pricing model and all required for V1 ship.

### §7.1 — Prompt caching

Use Anthropic's native `cache_control` on:
1. The system prompt with parsing instructions
2. The per-line search candidate block

```ts
const response = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  system: [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: candidatesBlock,
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: rawRecipeText },
      ],
    },
  ],
  // ...
})
```

Five-minute TTL by default. For sequential parses against the same template (re-running after partner edits), this is a 30-40% cost saving.

### §7.2 — Per-partner rate limits

Three windows: 10/minute, 100/day, monthly tier cap. Implement as a `getParseCount(partnerServiceId, since)` query against `AuditLog` (V1 — see §8 for V1.5 dedicated counter). Three-level check before any LLM call.

On limit hit:
- Friendly toast: "You've hit your hourly / daily / monthly parse limit. Switch to Search & build mode, or upgrade for a higher cap."
- AuditLog row `RECIPE_PARSE_RATE_LIMITED` with the window that triggered.
- Admin alert if a partner hits the minute or day limit more than 3 times in a week (signal of either heavy legit usage worth talking to, or automation).

### §7.3 — Input size cap

Reject inputs > 10KB raw text after whitespace normalization. Surfaces as "Your recipe is unusually long — split it into sections and parse each separately." Also a UX clarity win.

### §7.4 — Pre-parse normalization

Before sending to the model:
- Strip whitespace, normalize line endings
- Lowercase headers (`INGREDIENTS:`, `Ingredients`, `INGREDIENT STATEMENT:`) and drop them
- Dedupe identical lines
- Drop obvious non-ingredient lines (regex match for `Manufactured by`, `Distributed by`, `Net weight`, `Best by`, etc.)

Cuts tokens 10-20% on average. Zero UX impact.

### §7.5 — Model fallback hierarchy

V1 always uses Haiku. The "I think the AI got this wrong" re-parse button does **not** escalate to Sonnet in V1 — it just re-runs Haiku with a slight prompt variation. Escalation is V1.5+ territory and meters separately. Almost no parse genuinely needs Sonnet.

### §7.6 — Per-line retrieval BEFORE the LLM call

This is the load-bearing engineering decision and is already in the architecture plan. For each line in the input text, do a fuzzy ingredient search against USDA + Library + Partner-private, take top-5 candidates per line, inject only those candidates into the prompt. Without this you'd be either (a) injecting the entire USDA index (50-100x more tokens, slow, expensive) or (b) accepting wrong matches because the model can't match against ingredients it doesn't see.

### §7.7 — Abuse pattern detection

Daily admin report (cron) surfacing partners who:
- Hit the daily rate limit ≥ 3 times in 7 days
- Submitted identical inputs ≥ 50 times in 24h
- Have bot-cadence timestamps (parses every 4-7 seconds for an extended window)

Flagged partners get a soft block on parse (with an "admin will reach out" message) until admin reviews. AuditLog entry per detection.

## §8 — Implementation notes

### Counter strategy

**V1: count AuditLog rows.** Each parse writes one `RECIPE_PARSE_RUN` AuditLog entry. The cap-check query is `count where action = 'RECIPE_PARSE_RUN' and actorUserId in partner-users and createdAt >= startOfMonthUtc`. Slow at high volume but fine for V1.

**V1.5: dedicated counter.** When AuditLog query gets slow, add an `AiUsageCounter` model:

```prisma
model AiUsageCounter {
  id                String   @id @default(uuid())
  partnerServiceId  String
  periodStart       DateTime
  periodEnd         DateTime
  kind              AiUsageKind  // RECIPE_PARSE_TEXT | RECIPE_PARSE_VISION
  count             Int      @default(0)
  partnerService    PartnerService @relation(fields: [partnerServiceId], references: [id])
  @@unique([partnerServiceId, periodStart, kind])
  @@index([partnerServiceId, kind])
}
enum AiUsageKind { RECIPE_PARSE_TEXT RECIPE_PARSE_VISION }
```

Increment atomically inside the parse transaction.

### Tier gate pattern

```ts
import { hasFeature, getFeatureValue } from '@ilaunchify/auth/tiers'

export async function parseRecipe(input: ParseRecipeInput) {
  'use server'
  const { user, partnerService } = await authorize(input.productTemplateId)
  const creatorTier = user.creator?.subscriptionTier ?? 'maker'

  if (!hasFeature(creatorTier, 'ai-recipe-parser')) {
    return { ok: false, error: 'upgrade-required' as const }
  }

  const monthlyCap = getFeatureValue(creatorTier, 'ai-recipe-parser-monthly-cap')
  const usedThisMonth = await countParsesThisMonth(partnerService.id)
  if (usedThisMonth >= monthlyCap) {
    return { ok: false, error: 'cap-reached' as const, used: usedThisMonth, cap: monthlyCap }
  }

  // ... rate limit checks (minute, day)
  // ... normalize input, check size
  // ... per-line search retrieval
  // ... call Anthropic with cache_control
  // ... write AuditLog RECIPE_PARSE_RUN
  // ... return structured extraction
}
```

### AuditLog entries to write

| Action | When |
|---|---|
| `RECIPE_PARSE_RUN` | Every successful parse, payload includes line count, token usage from API response, cost estimate, model used |
| `RECIPE_PARSE_RATE_LIMITED` | Each rate-limit hit, payload includes which window (minute/day/month) |
| `RECIPE_PARSE_ABUSE_FLAGGED` | When abuse detection trips, payload includes the trigger reason |
| `RECIPE_PARSE_OVERRIDE_GRANTED` | When admin manually extends a partner's cap |
| `INGREDIENT_BAN_BLOCK` | If a parsed line resolves to a banned ingredient (reuses Slice 1 pre-work) |

### Where things live

| Concern | File path |
|---|---|
| Server action | `apps/partner/src/app/(dashboard)/products/[id]/edit/recipe-parser-actions.ts` |
| Tier-gate helper extension | `packages/auth/src/tiers.ts` (`getFeatureValue` already exists per V1.5-T1) |
| Plan feature seed | `packages/plans/src/seed.ts` |
| Anthropic SDK client | `packages/ai/src/anthropic.ts` (NEW package — wraps the SDK with cache_control defaults + structured-output parser + cost telemetry) |
| Pre-parse normalization | `packages/ai/src/recipe/normalize.ts` |
| Per-line search retrieval | `packages/ai/src/recipe/retrieve.ts` (calls into the existing `searchIngredients` from ingredient-actions.ts) |
| Abuse pattern cron | `apps/admin/src/app/api/cron/ai-abuse/route.ts` |

The new `packages/ai` package is the first place an AI SDK lands in the monorepo. Keep it narrow — just Anthropic, just for recipe parsing in V1. Don't generalize prematurely.

## §9 — Monitoring & alerting

A new `/admin/ai-usage` v2 surface (built with `/ship-admin-surface ai-usage` once Mode 2 ships):

**KPI strip:**
1. Total parses this month (with % vs last month)
2. Estimated API spend this month
3. Active partners using AI (count + % of Builder+ base)
4. Cap-hit events this week
5. Abuse-flagged partners (count)

**Filters:** date range, tier, partner.

**Table columns:** Partner · Tier · Parses month-to-date · Cap · % used · Last parse · Rate-limit hits · Status.

**Row actions:** Open partner detail · Adjust cap (admin override, writes `RECIPE_PARSE_OVERRIDE_GRANTED`) · Flag for review.

**Alerts (Slack or email to ops@):**
- A partner crosses 80% of monthly cap → "FYI, talk to them about upgrading"
- A partner hits minute or day rate limit ≥ 3× in a week → "Investigate usage pattern"
- Total platform spend on AI > $X for the day → "Spike alert"
- Abuse detection trips → "Review and decide"

## §10 — Graceful degradation at cap

When a partner hits monthly cap:
- The mode chooser shows "Parse with AI" tile as disabled with a small "Cap reached — talk to us" link
- The IngredientsCard offers Mode 1 (Search & build) and Mode 3 (Declare panel) unchanged
- A toast appears once per session explaining the cap
- The cap resets at the start of the next calendar month UTC
- A "Need more?" link opens a Calendly or admin-contact form

Critically: the partner is never billed extra. The model is "subscription = predictable cost." Surprise bills kill trust.

## §11 — Vision mode (V1.2) forward-pointer

When V1.2 ships image-based parsing (Haiku 4.5 vision):
- Add ~1,500-3,000 tokens per image to input → ~$0.015-$0.030 per image
- Total per vision parse: ~$0.03-$0.05 (10x text-paste cost, still trivial per parse)
- Use the separate counter (`RECIPE_PARSE_VISION`) and separate cap
- Image storage: R2 with the existing presigned URL pattern (a new key namespace: `recipe-source/{productTemplateId}/{uuid}.{ext}`)
- Delete images from R2 30 days after the parse (no reason to retain)

Vision quota is intentionally lower than text quota — 100/mo Builder, 500/mo Agency — to prevent a single partner running OCR on a stack of supplier PDFs from draining 10x normal usage in one workflow. Same engineering levers apply (cache, normalize, abuse detection).

## §12 — Sensitivity to Anthropic pricing changes

Anthropic adjusts pricing periodically. Recompute the table in §2 against the live `console.anthropic.com` numbers when the Mode 2 slice author starts work. The pricing model and caps in this doc are robust as long as Haiku stays roughly in the $1-3 input / $5-15 output per-million-tokens band. If Haiku doubles in price overnight:

- Cost per parse: ~$0.02 typical
- Heavy partner (300 parses/mo): $6 cost vs $49 subscription = 88% margin still
- Cap hit (1,000 parses): $20 cost vs $49 subscription = 59% margin still acceptable for V1

Below 50% margin floor on the feature → revisit pricing model. Above → stay as-is.

## §13 — What changes if usage explodes

Two scenarios worth pre-thinking:

**Scenario 1: feature lands harder than expected.** 80% of Builder partners use it, average 50 parses/mo. At 100 Builder partners × 50 parses × $0.01 = $50/mo API spend total. Trivial. No action needed beyond celebrating.

**Scenario 2: a single Agency power partner pushes 2,000 parses/mo against the 5,000 cap.** $20/mo API cost vs $199 subscription = 90% margin. Still fine. The cap exists to catch the truly anomalous case, not to throttle real users.

**Scenario 3: real abuse — 50K parses in a month from one account.** Daily rate limit (100) caps that at 3,000/month max in normal operation. To exceed, the partner would have to have multiple accounts or bypass the limit. Abuse detection (§7.7) should catch it first. If not, $500/mo API cost vs $199 subscription = unprofitable on that account → admin force-disables the feature for that partner and reaches out.

## §14 — Open questions for Pavel

1. **Should the parse button be visible on Maker tier with an upgrade-prompt CTA, or hidden entirely?** Recommendation: visible-with-upgrade-prompt. Same pattern as the existing tier-gated buttons in the Studio. Drives Maker → Builder conversion.
2. **Cap reset window — calendar month UTC, or rolling 30 days?** Recommendation: calendar month UTC. Cleaner mental model for partners and matches Stripe billing cycle.
3. **Should the AI parser have its own "I think this was wrong, try again" feedback action that admin sees?** Recommendation: yes, V1.1. Single Re-parse button + an optional "what was wrong?" textarea. Feeds a quality-improvement loop. Don't ship in V1; ship after we have 100 parses of real partner data.
4. **What does the Maker upgrade CTA say?** Recommendation: "AI parsing is on Builder ($49/mo). Save hours per recipe." with the existing `/settings/plan` deep-link from V1.5-T6.

## §15 — TL;DR for the build brief

When you write the Mode 2 slice brief, paste this section into it verbatim:

```
Pricing & cost protection rules for AI Recipe Parser (locked):

- Maker: feature hidden / shows upgrade CTA only.
- Builder ($49): 1,000 text-parses/month included.
- Agency ($199): 5,000 text-parses/month included.
- Rate limits both tiers: 10/min, 100/day. Hard.
- Input cap: 10KB raw text after normalization.
- Caching: prompt + candidate block, 5-min TTL, cache_control: 'ephemeral'.
- Model: Claude Haiku 4.5 (claude-haiku-4-5-20251001) only. No Sonnet escalation in V1.
- Counter: V1 = count AuditLog RECIPE_PARSE_RUN rows. V1.5 = AiUsageCounter model.
- At cap: graceful degradation, no extra billing, Mode 1+3 still work, "talk to us" link.
- AuditLog every parse, every rate-limit hit, every override.
- Per-line search retrieval before the LLM call — DON'T inject the full USDA index.

Vision mode (V1.2) — separate counter, 100 (Builder) / 500 (Agency) per month.
```

This document is the source of truth. Anything contradicting it is wrong.
