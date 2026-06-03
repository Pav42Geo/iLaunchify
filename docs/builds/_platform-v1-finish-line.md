# Platform V1 finish-line punch list

The execution order between current state and **"first creator transacts with first partner end-to-end."** Read this top-to-bottom in one sitting. Use as the running checklist for the next ~2 weeks. Decision log lives at the bottom — append as you make calls.

## The nine items at a glance

| # | Item | Lift | Brief / source | Pavel housekeeping |
|---|---|---|---|---|
| P1 | Banned-ingredient runtime enforcement + BE severity bump | ~½ day | `docs/builds/ingredients-prework-slice-1.md` + below | typecheck |
| P2 | Marketing copy refresh PR — strip fabricated traction | ~½ day | `docs/marketing/landing_copy_refresh.md` | typecheck + restart |
| P3 | Marketplace `creatorPrice` real formula | ~2 days | below | depends on migration backlog drain first |
| P4 | Legal pages on marketing site | ~½ day | `docs/legal/*.docx` → markdown | typecheck + restart |
| P5 | Stripe webhook end-to-end verification | ~½ day (longer if broken) | below | `stripe` CLI in test mode |
| P6 | Sentry + structured logging across the four apps | ~1 day | below | env vars in production |
| P7 | Production infra audit — DNS, Resend, R2, Cockroach | ~1-3 days | below ([VERIFY]-heavy) | infra setup |
| P8 | Migration backlog drain | ~½ day | tasks #168-#173, #471, #490, #500, #531, #536, #542, #552, #553, #578, #579, #582, #584 | Pavel only |
| P9 | End-to-end smoke test + production cutover | ~1 day | below | dev → staging → production |

**Total: ~7-10 days of focused work over ~2 weeks (with buffer for surprises in P7).** This is what gets you to "ready to invite beta cohort 1."

## The honest answer to "are we almost done with V1?"

No. We are roughly **2 weeks of focused work** from V1-launchable. What's already shipped is the substrate — ~590 tasks, four apps, mature schema, locked design, locked taxonomy, full partner editor, full creator app, full admin v2, Stripe Connect wired, multi-partner workflow shipped. What's missing is the **closing of the loop**: real prices, real legal surfaces, real observability, real production environment, and the closing of three FDA-flagged contradictions between contract and code.

This punch list closes that loop. After it ships, the platform can actually run a beta cohort. Until it ships, demoing the platform to a creator or partner is unsafe — fake prices, misrepresented contracts, no monitoring, no legal surface.

## Dependency graph

```
P1 (banned + BE) ─┐
P2 (mkt copy)   ─┤  ← all independent, parallel-ship safe
P4 (legal pages)─┤
P6 (Sentry)     ─┘

P8 (migrations) ──► P3 (creatorPrice formula) ──► P9 (smoke + cutover)
                                                  ▲
P5 (Stripe E2E) ────────────────────────────────► │
P7 (infra audit) ──► production setup ──────────► │
```

P1, P2, P4, P6 are independent and can ship in parallel — multiple Claude Code sessions or just back-to-back, depending on your tolerance for context switching.

P3 (the marketplace pricing formula — single biggest V1-unblock) waits on P8 (you have to run the pending migrations first because `ProductTemplatePricingTier` data depends on schema that hasn't been migrated).

P9 (smoke + cutover) waits on basically everything.

## Recommended ship order (2-week sprint)

**Week 1**
- **Day 1 (Mon):** P1 + P2 — ship both as one bundled commit OR two PRs back-to-back. Both small, both close legal exposure (P1 closes a contract contradiction, P2 removes fabricated traction numbers). High-leverage starts.
- **Day 2 (Tue):** P4 (legal pages) + P6 start (Sentry wiring).
- **Day 3 (Wed):** P8 (migration backlog drain — Pavel-only morning) + start P3 (creatorPrice formula in afternoon).
- **Day 4 (Thu):** P3 finish.
- **Day 5 (Fri):** P5 (Stripe E2E) + P6 finish.

**Week 2**
- **Day 6-7 (Mon-Tue):** P7 (production infra audit + setup). Heavy [VERIFY] block — first action is surfacing current state, second action is filling gaps.
- **Day 8 (Wed):** Pre-cutover smoke test on staging.
- **Day 9-10 (Thu-Fri):** P9 (production cutover + final verification + beta cohort 1 invite). Tighten everything that breaks under real load.

If something blows up (P7 likely candidate — production infra often has surprises), shift everything right by a day or two. Don't shortcut.

## Source-of-truth docs you should NEVER skip

- **`docs/LAUNCH_READINESS.md`** — the audit. Sections 3 (V1-blocking), 4 (gaps nobody noticed), 6 (prioritized punch list). This punch list is the executable version of that doc.
- **`docs/legal/FDA_REGULATORY_POSTURE.md`** — the three contradictions between contract and code (P1 closes one of them).
- **`docs/marketing/POSITIONING.md` + `landing_copy_refresh.md`** — P2 reads the refresh doc verbatim.
- **`docs/legal/Terms_of_Service.docx` + `Privacy_Policy.docx` + `Creator_Agreement.docx` + `Partner_Agreement.docx`** — P4 converts these to markdown pages.
- **`docs/beta/BETA_PROGRAM_PLAN.md`** — what happens after V1 ships.
- **`.claude/memory/MEMORY.md`** — auto-loaded by Claude Code with everything else.

## Open Pavel decisions still on the table

Make these before the relevant item ships. Each has a sensible default and an alternative.

| Decision | Affects | Default | Alternative |
|---|---|---|---|
| Production hosting platform | P7 | Vercel for marketing + 3 apps, Railway for compliance Python service | AWS / Render / self-hosted — confirm before P7 |
| Sentry vs Datadog vs Bugsnag | P6 | Sentry (cheapest free tier, best Next.js integration) | Datadog if you already have it |
| Production Cockroach: Serverless or Dedicated? | P7 | Serverless (cheaper, fine for early beta) | Dedicated when scale demands |
| Legal pages: ship the draft .docx-converted markdown publicly with disclaimer, or wait for lawyer redline? | P4 | Ship with disclaimer (beta cohort is friends-and-family; redline before public launch) | Block on lawyer if you're risk-averse |
| Beta cohort timing — week 3 or week 4? | After P9 | Week 3 (move fast) | Week 4 (extra buffer for surprises) |
| Bioengineered scan severity at WARNING — block export, or just warn? | P1 | Warn + require separate ack (matches at-your-own-risk pattern) | Hard block if BE-flagged |

## Per-item briefs + paste-ready Claude Code prompts

Each item below is independently executable. Paste the prompt into Claude Code, wait for the slice to ship, verify, move on.

### P1 — Banned-ingredient runtime enforcement + BE severity bump

Same brief as Slice 1 of the Recipe Builder line — `docs/builds/ingredients-prework-slice-1.md`. Plus a small additional change: flip the bioengineered disclosure severity in `compliance.ts` line ~339 from INFO to WARNING when a product is BE-flagged, and add a separate ack on the ExportModal.

**Why V1-blocking:** the Creator Agreement §3 currently claims banned-list enforcement exists as a tool, but the code only enforces at private-ingredient-create time, not at slot-add time. This is a contractual misrepresentation that goes live the moment a creator signs the agreement. Bioengineered severity at INFO is too quiet for the disclosure to actually be visible to the partner during design.

**Paste this into Claude Code:**

```
Ship P1 — Banned-ingredient runtime enforcement + BE severity bump. Two
changes in one PR. This is V1-blocking per docs/LAUNCH_READINESS.md and
docs/legal/FDA_REGULATORY_POSTURE.md §5.

Part A — Slice 1 of the Recipe Builder pre-work. Full brief at
docs/builds/ingredients-prework-slice-1.md. Three sub-changes:

1. Banned-list save-time enforcement on addIngredientSlot +
   updateIngredientSlot (when baseIngredientId changes) + addReplacement
   in apps/partner/.../card-actions.ts. Reuse the existing
   isIngredientBanned() helper from ingredient-actions.ts.
2. Picker empty-state staples panel — remove the q.length < 2
   short-circuit in searchIngredients.
3. Recently-used recall — getRecentlyUsedIngredients() scoped to the
   calling partner via IngredientUsage.

Part B — bioengineered severity bump. In packages/ui/src/canvas/
compliance.ts (~line 339), flip the bioengineered disclosure issue
severity from INFO to WARNING when the product is BE-flagged. Then in
the ExportModal flow, add a separate ack checkbox for the BE warning
that's distinct from the existing at-your-own-risk ack.

NOT in scope: any other compliance scan changes. No schema.

Verify: pnpm --filter @ilaunchify/partner typecheck && pnpm --filter
@ilaunchify/ui typecheck.

Then /ship "P1 FDA briefing fixes — banned-ingredient runtime enforcement
+ picker staples + bioengineered severity bump".
```

### P2 — Marketing copy refresh PR

Ship the 42 `[CURRENT]→[PROPOSED]` blocks at `docs/marketing/landing_copy_refresh.md`. Strips the fabricated traction numbers (1,247 launches, 312 partners, $4.2M paid, two named testimonials) that are live in production right now. Removes "Premier partner gets X" language across /pricing, /how-it-works, /contact-sales.

**Why V1-blocking:** a journalist or beta candidate landing on the home page today reads obviously false metrics. Material misrepresentation, not just polish.

**Paste this into Claude Code:**

```
Ship P2 — Marketing copy refresh. Apply the 42 [CURRENT]→[PROPOSED]
blocks in docs/marketing/landing_copy_refresh.md to apps/marketing/.
Affects: home (/), /business, /pricing, /how-it-works, /marketplace
hero, /contact-sales, LandingFooter, LandingHeader.

Critical removals: 1,247 launches, 312 partners, $4.2M paid, all named
testimonials, every "Premier partner gets X" mention.

No new components. No new routes. Pure text swaps + small markup tweaks
where the proposed block restructures the section.

The doc tells you what to swap, where, and why. Read it section by
section, apply in order, don't improvise.

Verify: pnpm --filter @ilaunchify/marketing typecheck.

Then /ship "P2 marketing copy refresh — strip fabricated traction +
remove Premier-partner language".
```

### P3 — Marketplace creatorPrice real formula

The single biggest V1-blocker. The PricingTierModal currently shows synthetic prices computed by `buildSamplePricingRows()` in `apps/marketing/src/lib/pricing-tier-data.ts`. Real prices need to consume `ProductTemplatePricingTier` rows + `lookupFeeRate(creatorTier)` from `packages/plans` + a shipping estimate.

**Why V1-blocking:** without this, a real creator literally cannot see a real price. Cannot transact.

**Depends on:** P8 (migration backlog drain). The `ProductTemplatePricingTier` schema is in migration `20260601...` and depends on Pavel running it locally first.

**Paste this into Claude Code (AFTER P8 has drained):**

```
Ship P3 — Marketplace creatorPrice real formula. Single biggest V1-
blocker per docs/LAUNCH_READINESS.md §3. PricingTierModal is currently
showing synthetic prices from buildSamplePricingRows() — replace with a
real per-tier computation.

Build:

1. New server action computeCreatorPriceMatrix(productId, viewerTier)
   in apps/marketing/src/lib/pricing-server.ts (or similar location).
   For each MOQ tier on ProductTemplatePricingTier:
     manufacturerPerUnit = ProductTemplatePricingTier.perUnitCostCents
     platformFee = lookupFeeRate(viewerTier, productCategory) (from
       packages/plans)
     shippingEstimate = estimateShipping (placeholder for now —
       use a simple per-unit constant, real estimateShipping is
       wired in apps/creator already, port the function if cheap)
     accessoryFees = 0 (V1)
     packagingFee = 0 (V1 default packaging)
     creatorPrice = manufacturerPerUnit + platformFee + shippingEstimate

   Return rows shaped as [{ minQty, maxQty, perUnitCents, leadTimeDays,
   breakdown: { manufacturer, platformFee, shipping, total } }].

2. Rewire PricingTierModal in apps/marketing/.../PricingTierModal.tsx to
   consume the server action via React Server Component pattern. Drop
   buildSamplePricingRows entirely.

3. When viewer is signed out, render at Maker tier with a "Sign in for
   your tier" hint below the matrix (we want them to upgrade
   conversion-wise).

4. Grep apps/ for hardcoded percentages — 15, 12, 9 — that should be
   reading from lookupFeeRate. Replace each with the helper call. Memory
   note ilaunchify-marketplace-decisions-2026-06-01 has the breakdown.

5. Add the breakdown to the modal UI — partner can see "Manufacturer
   $1.20 + Platform fee $0.15 + Shipping $0.08 = $1.43/unit". Trust
   through transparency.

Reapproval-marked: no — read-only price computation, no mutations.

Verify: pnpm --filter @ilaunchify/marketing typecheck && pnpm --filter
@ilaunchify/plans typecheck.

Then /ship "P3 marketplace creatorPrice real formula — consumes
ProductTemplatePricingTier + lookupFeeRate + breakdown UI".
```

### P4 — Legal pages on marketing site

Convert the four .docx drafts at `docs/legal/` to markdown, render as routes on `apps/marketing/src/app/legal/[slug]/page.tsx`, add footer links via `LandingFooter`. Each page carries the existing "DRAFT FOR LAWYER REVIEW — NOT LEGAL ADVICE" preamble — partners and creators in the beta will see this disclaimer.

**Why V1-blocking:** no /terms or /privacy = can't legally onboard a first user. Even a beta with friends-and-family needs minimal legal surface.

**Decision in §Open decisions:** ship with the disclaimer publicly, or block on lawyer redline first? Default in this brief: ship with disclaimer.

**Paste this into Claude Code:**

```
Ship P4 — Legal pages on marketing site. Convert the four .docx drafts
at docs/legal/Terms_of_Service.docx, Privacy_Policy.docx,
Creator_Agreement.docx, Partner_Agreement.docx to markdown content and
render at /terms, /privacy, /creator-agreement, /partner-agreement
routes on apps/marketing.

Steps:

1. Extract text from each .docx — use mammoth or python-docx if needed.
   Save as static markdown at apps/marketing/content/legal/{slug}.md.
   Preserve the DRAFT FOR LAWYER REVIEW preamble at the top of every
   page — this is intentional and stays.

2. Build apps/marketing/src/app/legal/[slug]/page.tsx as a server
   component that:
   - reads the markdown content
   - parses with marked or remark
   - renders inside a centered prose layout (max-w-3xl)
   - sets <metadata> title + description
   - adds a "Last updated" date showing the .md file's git mtime or a
     hardcoded recent date

3. Update LandingFooter to add the four links under a "Legal" group:
   Terms · Privacy · Creator agreement · Partner agreement.

4. Add a small "DRAFT" badge on each page header above the title so the
   disclaimer is unmissable even to a fast scroller.

5. Set robots noindex on these pages for V1 — we don't want SEO
   crawling the draft text. (Add <meta name="robots" content="noindex">
   in the layout for /legal/*.)

NOT in scope: no Cookie banner (separate slice). No legal-acceptance
gate on signup (V1.1).

Verify: pnpm --filter @ilaunchify/marketing typecheck.

Then /ship "P4 legal pages — /terms /privacy /creator-agreement
/partner-agreement rendered from .docx drafts, footer wired, noindex".
```

### P5 — Stripe webhook end-to-end verification

Not a build — a verification. The audit flagged this as never having been run via `stripe trigger` in test mode. Webhooks are coded; the question is whether the loop actually closes.

**Paste this into Claude Code:**

```
P5 — Stripe webhook end-to-end verification. NOT a build, a test pass.
The audit at docs/LAUNCH_READINESS.md flagged this as never run.

Pre-req: Stripe CLI installed (brew install stripe/stripe-cli/stripe).

Steps:

1. Read apps/marketing/src/app/api/webhooks/stripe/route.ts (or wherever
   the Stripe webhook handler lives). List every event type it handles.

2. Start stripe listen pointed at localhost: stripe listen --forward-to
   localhost:3000/api/webhooks/stripe. Capture the webhook signing
   secret it prints; set STRIPE_WEBHOOK_SECRET in .env.local.

3. For each event type the handler claims to handle, run stripe trigger
   <event>. Watch the handler logs. Confirm:
   - the signature verification passes
   - the handler executes without errors
   - the downstream effect happens (Order spawned for
     checkout.session.completed, ProductionSubscription advanced for
     invoice.payment_succeeded, etc.)

4. Focus events for V1:
   - checkout.session.completed → Order spawn per G5
   - invoice.payment_succeeded → ProductionSubscription Order spawn
     per G6.d
   - customer.subscription.updated → tier sync per V1.5-T4
   - charge.refunded → refund flow

5. For each event that fails or has unexpected behavior, file a
   follow-up task. Don't try to fix mid-verification — log what's
   broken, finish the pass, then triage.

6. Write a short report: which events work, which don't, what needs
   fixing.

Verify: stripe trigger runs without errors AND the database shows the
expected downstream rows.

Then /ship "P5 Stripe webhook E2E verification — <N> events verified,
<M> issues filed".
```

### P6 — Sentry + structured logging across the four apps

The audit flagged this as missing. Beta without observability is flying blind. Sentry is the recommended default.

**Paste this into Claude Code:**

```
Ship P6 — Sentry + structured logging across all four apps. Audit
flagged observability as missing per docs/LAUNCH_READINESS.md §4.

Build:

1. Install @sentry/nextjs in each of apps/marketing, apps/creator,
   apps/partner, apps/admin. Run sentry-wizard in each (or hand-wire
   if you prefer control).

2. Add SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT to
   .env.example. Different DSN per app so we can scope alerts.

3. Wire Sentry beforeSend to:
   - drop noisy expected errors (auth redirects, 404s)
   - scrub PII from event payloads (email, name fields → redacted)
   - tag every event with the app name (marketing/creator/partner/admin)

4. Configure Performance monitoring with 0.2 sample rate (cheap, gives
   visibility into request-flow latency).

5. Add structured logging via @ilaunchify/logger (new package). Wraps
   pino with default tags: app, requestId, actorUserId. Replace
   scattered console.log calls in server actions with logger.info /
   logger.error. Don't aggressively migrate everything — just the hot
   paths (auth, checkout, webhooks, parse, slot CRUD, dispatch).

6. Add a /api/health endpoint to each app that returns { ok: true,
   version: package.json version, dbReachable: <ping result> }. For
   uptime monitoring.

NOT in scope: external uptime monitor setup (P7 — that's an infra
choice).

Verify: pnpm --filter @ilaunchify/<each-app> typecheck. Trigger a test
error in each app, confirm it appears in Sentry.

Then /ship "P6 Sentry + structured logging across all four apps +
/api/health endpoints".
```

### P7 — Production infra audit

This is the [VERIFY]-heavy block. First action is surfacing current state, second action is filling gaps. Don't paste a build prompt for this until you've spent 30 minutes auditing what's actually deployed.

**The audit questions (do these first, in any order):**

```
Pavel — answer these before P7 can ship. Open each tab and check.

1. apps/marketing, apps/creator, apps/partner, apps/admin — are any
   of these deployed to a production URL today? If yes, where? Vercel?
   Railway? Render? Self-hosted? List each URL + platform.

2. CockroachDB — is there a production cluster, or only the local
   docker-compose dev cluster? If production exists: serverless or
   dedicated, what region, who pays the bill, what's the backup
   config?

3. R2 storage — is there a production bucket, or only the dev key?
   Region? Who owns the Cloudflare account?

4. Resend — is there a production sender domain verified (e.g.,
   no-reply@ilaunchify.com), or only the dev test sender?

5. Domain — is ilaunchify.com pointed at anything? DNS managed where?
   Wildcard cert?

6. Email — does iLaunchify have a hello@ or support@ address that
   routes to your inbox? Required for the Creator Agreement and the
   beta onboarding scripts.

7. Stripe — test mode keys in dev. Are production-mode keys provisioned?
   Webhook endpoint URL configured in the Stripe dashboard for
   production?

8. GitHub Actions — are CI checks running on push? What's failing
   today that needs unblocking before deploy?

9. compliance Python service — where does it run in production?
   Containerized? Same host as Next.js? Lambda?

10. Has anyone outside Pavel ever logged into the staging or production
    environment? Need at least one trusted second person before going
    live.
```

After you have answers, the P7 build prompt becomes specific — "stand up X, configure Y, point Z at W." Until then, surfacing current state IS the work.

### P8 — Migration backlog drain (Pavel-only)

Two-week-deferred migrations have piled up. Drain them in one session.

**Paste this into Claude Code:**

```
P8 — Drain the migration backlog. Pavel-only morning. Brief: this is a
single Claude Code session against the local dev environment to apply
every pending migration in order, regenerate the Prisma client between
each, and verify nothing is broken downstream.

Steps:

1. git status — confirm clean tree. If dirty, commit or stash first.
2. git pull — latest changes.
3. docker ps | grep cockroach — confirm local Cockroach is running.
   If not, docker compose -f docker-compose.dev.yml up -d cockroach
   and wait ~5s.
4. pnpm install — picks up any new deps (recharts, fabric on creator,
   @ilaunchify/marketplace on partner+admin, etc.).
5. pnpm --filter @ilaunchify/db prisma migrate dev — apply all
   pending migrations. List them as they apply. Tasks #168-#173, #471,
   #490, #500, #531, #536, #542, #552, #553, #578, #579, #582, #584
   should all clear.
6. pnpm --filter @ilaunchify/db prisma generate — regenerate Prisma
   client.
7. pnpm --filter @ilaunchify/db prisma db seed — reseed locked
   taxonomies (niches, categories, lifestyle tags, niche rules,
   substrates, packaging materials, finish types, brand identity
   library, etc.).
8. pnpm typecheck workspace-wide — confirm no Property does not exist
   on PrismaClient errors remain.
9. pnpm dev — restart all apps.
10. Manual smoke test:
    - Sign in as a dev creator. Visit /products. Confirm no errors.
    - Sign in as a dev partner. Visit /products/[id]/edit on a
      template with the new niche relations. Confirm IngredientsCard +
      NichesAndTagsCard render.
    - Visit /admin/niches, /admin/lifestyle-tags, /admin/niches/audit,
      /admin/products. Confirm all four v2 surfaces render.
    - Visit a marketplace product detail page. Confirm niche chips +
      lifestyle tag chips render.

Report what migrated cleanly, what surprised you, what failed (if
anything).
```

### P9 — Production cutover + final smoke test

This is the actual go-live. Depends on every other item. Don't paste this prompt until P1-P7 are all shipped and P8 has drained cleanly.

**Paste this into Claude Code (when ready):**

```
P9 — Production cutover. Final smoke test then promote dev → staging
→ production. All P1-P7 must have shipped, P8 drained, infra answers
in place.

Steps:

1. Confirm staging environment exists and mirrors production
   structure. If no staging, this is your first stop.

2. Deploy current main to staging. Run pnpm prisma migrate deploy
   against staging Cockroach. Confirm staging /api/health returns ok
   for each app.

3. End-to-end smoke test against staging:
   a. Sign up as creator — onboarding stepper, brand quickstart.
   b. Pick a starter product. Customize it (recipe + label).
   c. Place a checkout draft for production. Confirm Stripe checkout
      session creates.
   d. Pay with Stripe test card 4242 4242 4242 4242.
   e. Webhook fires → Order spawns → Dispatch created.
   f. Sign in as partner. Accept dispatch.
   g. Mark shipped. Confirm creator-side timeline updates.
   h. Sign in as admin. Confirm /admin/audit shows the entire flow.

4. If any step fails on staging, file a P9.X follow-up. Do NOT promote
   to production until staging is green end-to-end.

5. Production cutover sequence:
   a. Set DNS to point ilaunchify.com at the marketing app.
   b. Apply prisma migrate deploy against production Cockroach.
   c. Promote all four apps to production.
   d. Switch Stripe to live mode (rotate keys, update webhook URL).
   e. Switch Resend to production sender.
   f. Smoke test against production with a real (small) transaction
      from your own account.

6. Send the beta cohort 1 invite per docs/beta/BETA_PROGRAM_PLAN.md.

Then /ship "P9 V1 production cutover — staging smoke test green,
production live, beta cohort 1 invited".
```

## Pavel-side housekeeping cadence

Between items:

| After | Run |
|---|---|
| P1 ship | `pnpm --filter @ilaunchify/partner typecheck` |
| P2 ship | restart `next dev` if it's running (cache the marketing app) |
| P3 ship | `pnpm --filter @ilaunchify/marketing typecheck` + restart |
| P4 ship | `pnpm --filter @ilaunchify/marketing typecheck` |
| P5 ship | document the verification report |
| P6 ship | confirm Sentry events appearing in the Sentry dashboard for each app |
| P7 ship | depends on what you set up — re-deploy probably |
| P8 ship | restart `next dev` (memory `ilaunchify-dev-prisma-restart`) |
| P9 ship | open champagne |

## What's V1.1 / V1.5 / V2 — DON'T ship in V1

So you can stop worrying about them during this sprint:

**V1.1 (post-launch, first weeks after beta starts):**
- Recipe Builder Slice 2 (Mode chooser shell)
- Recipe Builder Slice 3 (AI Recipe Parser) — paste-only first
- Recipe Builder Slice 4 (Mode 3 Declare panel)
- `/admin/beta` dashboard + BetaCohort + BetaParticipant migration
- Cookie consent banner
- USDA "search wider" live API fallback (task #142)
- Repair the marketing copy v2 (niche-page SEO depth)
- BannedWordsHint banner on Studio (task #166 outstanding piece)

**V1.5 (after first 100 transactions of real signal):**
- `/admin/ai-usage` dashboard
- AiUsageCounter model
- Re-parse / feedback action for the AI parser
- Mode 2 V1.1: PDF/PNG upload via R2 + Tesseract.js OCR
- Lawyer redline applied to legal docs + drop the DRAFT badge
- Self-serve creator support ticketing
- Promoter / referral system (memory `ilaunchify-marketplace-decisions-2026-06-01.md` is silent on this — Pavel decision)

**V2 (when beta validates and the moat work starts):**
- Mode 2 V1.2: photo + vision LLM
- Mode 4: AI-suggested recipe from natural-language goal
- Pooling + buffer inventory (the orchestration moat)
- Multi-tenant / white-label
- USDA FDC full import pipeline (task #137)
- AI Template Agent for the Design Studio (task #149)

Each is captured in its own brief or memory file; nothing falls through cracks.

## Telemetry to watch as V1 goes live

| Item | Watch | Where |
|---|---|---|
| P1 | `INGREDIENT_BAN_BLOCK` events — should be near-zero in beta | `/admin/audit?action=INGREDIENT_BAN_BLOCK` |
| P3 | PricingTierModal opens vs Start-Launching clicks (conversion proxy) | analytics |
| P5 | Webhook event counts vs Order counts (should match 1:1) | Stripe dashboard + `/admin/orders` |
| P6 | Sentry error rate per app | Sentry dashboard |
| P9 | Time-to-first-shipment per beta creator | `docs/beta/BETA_PROGRAM_PLAN.md` §8 metrics |

A weekly `/morning briefing` style scheduled task once V1 is live — surfaces these in one report. Add via `mcp__scheduled-tasks__create_scheduled_task` once Sentry + analytics are wired.

## Risk register for V1 cutover

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Stripe webhook silently drops events in production | Med | High | P5 verification + Sentry capture of every webhook handler error |
| First creator hits an unhandled edge case in checkout | High | Med | Founder white-glove per BETA_PROGRAM_PLAN §6 — you ARE in the conversation |
| Cockroach production cluster runs out of free-tier hours | Med | High | Monitor billing alerts — switch to dedicated if hit |
| Partner accepts a dispatch then disappears | Med | High | acceptDeadlineAt + auto-cancel executor already shipped (#101) |
| Compliance scan misses an FDA-violating label | Low | High | At-your-own-risk ack already shipped (DS-69), Creator Agreement §3 allocates liability — counsel confirmed pre-cutover |
| Banned ingredient slips past the new runtime enforcement | Low | Med | P1 + admin gets `INGREDIENT_BAN_BLOCK` audit visibility for review |
| A V1-blocking bug reveals itself in production after P9 | Med | High | Have rollback plan: revert the four apps to last-known-green deploy, keep DB forward |

## Decision log

Append as you go.

- **2026-06-01** — Punch list defined: 9 items, ~2 weeks. P1-P9 numbered. Recipe Builder Slices 2-4 explicitly deferred to V1.1.
- **2026-06-01** — Legal pages ship with DRAFT disclaimer publicly (Pavel-default; revisit before public-public launch).
- **2026-06-01** — Beta cohort 1 timing: aim for end of week 2 post-cutover (Pavel can move to week 3 if anything slips).
- **2026-06-01** — Production hosting: Pavel decision pending — default assumption is Vercel + Railway hybrid.
- **2026-06-01** — Observability stack: Pavel decision pending — default assumption is Sentry.

Append new decisions chronologically here.

- **2026-06-03 — P6 leftovers SHIPPED.** Sentry instrumentation + `/healthz` routes already existed; closed the two gaps. (1) `@ilaunchify/logger` — a ZERO-DEP structured-JSON logger (`appLogger(app).child({requestId, actorUserId})` + info/warn/error). Deliberately NOT pino: pino's worker-thread transports don't run cleanly across Next's edge/node/RSC runtimes and we don't need its throughput at V1; the call shape matches pino so it's a one-file swap later if a transport is needed. Wired into the Stripe webhook hot path (`packages/payments/webhook-handlers.ts`) as the canonical example; broader hot-path migration (auth/checkout/parse/slot/dispatch) is a follow-up per the brief's "don't aggressively migrate." (2) `/healthz` enriched in all 4 apps → `{ ok, service, version, dbReachable, time }` with a real `prisma SELECT 1` ping and **503 when the DB is unreachable** (so uptime monitors distinguish app-up from DB-down). Note: route is `/healthz`, not the brief's `/api/health`. Remaining P6 (Sentry DSNs/PII-scrub/perf-sampling config) is env/dashboard work = Pavel.

- **2026-06-02 — P3 SHIPPED (blocker was stale).** `ProductTemplatePricingTier` is migrated + `prisma migrate status` = up to date, so P3 was NOT blocked on P8. Built `getCreatorPricingMatrix(slug, viewerTier, fallback)` in `apps/marketing/src/lib/pricing.ts`: creator per-unit price = manufacturer unit cost (band) + tier-discounted platform fee from `lookupFeeRate` (the seeded FeeRule table — source of truth, NOT a hardcoded %). `PricingTierRow.perUnitCents` is now ALL-IN (manufacturer + fee); added `manufacturerCents`/`platformFeeCents`/`feePercent` for the breakdown. Viewer tier = `getCreatorTier(session.user.id)` signed-in / `'maker'` signed-out. `PricingTierModal` shows the breakdown + "Priced at your <tier>" / "Sign in for your tier" hint + "production shipping estimated at checkout" note. Production shipping EXCLUDED from the unit price (destination/qty-dependent).
- **2026-06-02 — ⚠️ SEED vs COPY MISMATCH (Pavel to reconcile):** the seed `production_order_subtotal` fee for `creator_agency` is **8%**, but the marketing pricing copy (the comparison table, hero, FAQ — incl. the P2 refresh) says **9% on Agency**. The dynamic P3 breakdown now shows the REAL seed rate (8%). Fix one of the two: bump the seed to 9% (+ reseed `seed:subscription-plans`) OR change the static copy to 8%. (Maker 15 / Builder 12 match; only Agency disagrees.)
- **2026-06-02 — SHIPPING STRATEGY (Pavel-decided):** iLaunchify only prices/manages the **production-delivery leg** (partner → creator's address / connected WAREHOUSE 3PL). End-buyer DTC stays on the creator's own channel (Shopify/TikTok). V1 = **partner-managed carriers**: partners ship on their own accounts + freight discounts and fill `Dispatch.trackingCarrier`/`trackingNumber` (already in schema); `estimateShipping`'s rate-card gives the checkout estimate; reconcile estimate-vs-actual later. Platform-managed label-buying (Shippo/EasyPost, central rates + margin) = V1.5+ upgrade (the existing code marker already says this). Marketplace price therefore excludes shipping ("estimated at checkout").

- **2026-06-02 — P2 SHIPPED.** Applied all 42 [CURRENT]→[PROPOSED] blocks from `docs/marketing/landing_copy_refresh.md` across home / business / pricing / how-it-works / marketplace / contact-sales / LandingFooter / LandingHeader. Recommended options taken for the decision points: testimonials (home + business) REPLACED with the Pavel thesis/ops-philosophy quotes (not flag-hidden); pricing AI rows DELETED (Option B); Premier-partner comparison row + Agency-card "Premier-partner access" both removed; how-it-works partner tiers rewritten to the 3 locked facts (commission/storage/SLA). Also removed "Premier-partner access" from `PricingCards.tsx` (not in the doc's enumerated blocks but explicitly in the PR's stated goal). Marketing typecheck green.
- **2026-06-02 — P2 GAPS the copy-refresh doc didn't cover (left as-is per "don't improvise", flagged for Pavel):** (1) `business/page.tsx` `PARTNER_TYPES` still shows fabricated active counts (128 / 94 / 52 / 38) via `PartnerTypeCard activeCount`. (2) `business/page.tsx`'s own `Footer` copyright still reads "Built on the iLaunchify design system" (the doc's 7a only targeted the shared `LandingFooter`). Both are the same class of issue P2 fixes — recommend a tiny follow-up swap (zero the active counts or make them honest; align the business footer line).
- **2026-06-02 — Status delta vs this list:** Recipe Builder Slices 1–4 ALL shipped this session (the doc deferred 2–4 to V1.1 at lines 533–534 — now stale). P1 Part A (banned enforcement) shipped in Slice 1; P1 Part B (BE severity INFO→WARNING + export ack) still needs confirming. P4 legal routes still absent (footer already links /terms /privacy /creator-agreement /partner-agreement → currently 404). P6 Sentry instrumentation present in creator/admin/partner (no `@ilaunchify/logger`). P3 partial (real DB pricing tiers wired; full lookupFeeRate + breakdown UI TBD).
