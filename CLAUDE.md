# iLaunchify — Claude project anchor

This file loads into every Claude Code session in this repo. Keep it tight — under 200 lines. Detailed specs live in `docs/` and decision history lives in `.claude/memory/`.

## What iLaunchify is

A **B2B production marketplace** for CPG creators. Creators design CPG products in our Design Studio → Partners (manufacturers, printers, co-packers, warehouses) produce + fulfill → end buyers are channels the creator already owns (Shopify, TikTok Shop, etc.). **End buyers never touch iLaunchify.** Do not build a consumer storefront.

The platform's core thesis (Pavel 2026-05-26): we are an **orchestration platform**, not a matching marketplace. We decompose each order into a workflow graph across multiple partner types and hide the orchestration. V1 ships Mode 1 (direct routing); V2 ships pooling + buffer inventory (the moat).

## Architecture

Four-app Next.js 15 monorepo, App Router, React 19, strict TypeScript with `noUncheckedIndexedAccess`:

- `apps/marketing` · port **3010** · public surfaces (landing, /pricing, /marketplace, /launch/[niche], product detail, /business)
- `apps/creator` · port **3000** · authenticated creator app (dashboard, /products, /brands, /orders, /settings, Design Studio, checkout)
- `apps/partner` · port **3002** · authenticated partner app (onboarding, /products editor, /orders dispatches, /certifications, /packaging)
- `apps/admin` · port **3003** · ops console (every list + detail page)

Cross-app links require `marketingUrl()` / `creatorUrl()` / `partnerUrl()` helpers + plain `<a href>` — `<Link href="/pricing">` from inside creator 404s.

**Shared packages:**
- `packages/db` — Prisma schema + CockroachDB + seed scripts
- `packages/ui` — shared primitives, fonts, theme.css, tailwind preset
- `packages/auth` — Auth.js v5, tier helpers, role gates
- `packages/audit` — AuditLog writer + entity types
- `packages/plans` — Tier / plan / fee lookups
- `packages/payments` — Stripe Connect + Subscriptions
- `packages/marketplace` — `suggestNiches()` engine + `recordNicheAssignment()`
- `packages/notifications` — dispatcher + Resend
- `packages/orders` — order routing + manifest generation + FC selection (fc-selector V1 nearest, fc-scorer V1.5 weighted + balancing band)
- `packages/shipping` — logistics substrate (built 2026-07-02): shipment classifier, carrier eligibility + rate shop, EasyPost gateway (DI'd http — tests network-free), dispatch doc gates, receiving checklists, cold-pack + storage-accrual math, channel-inbound gates. Prisma-free by design; pure suites run in run-vitest-suites.mjs.
- `services/compliance` — FDA rule packs + label validator (Python/FastAPI service: nutrition calculation, compliance rule evaluation, label PDF rendering) · `packages/compliance-client` — typed TS client to it

## Database

CockroachDB Serverless via Prisma. Schema at `packages/db/prisma/schema.prisma`.

**Critical conventions:**
- Migrations are additive. Never `DROP TABLE` or `DROP COLUMN` without a Pavel decision.
- Cockroach rejects `@db.Text` — use bare `String` (it's already unbounded) or `@db.String(N)` for caps. `prisma generate` fails with P1012 otherwise.
- `id` is `String @id @default(uuid())` not `cuid()` and not autoincrement (no sequential hotspots). **FREEZE decision 2026-07-11 (audit H3):** NEW models MUST use `uuid()` — enforced by `check:invariants` (`no new cuid() id`, model-name baseline). The 136 pre-existing `cuid()` models are **accepted as-is**; backfill the hot ones (`AuditLog`/`Order`/`Notification`) only if CockroachDB range/hotspot metrics actually warrant it (own migration project, Pavel-greenlit).
- Every mutating action writes an `AuditLog` row via `packages/audit`. Every product/partner state change goes through an FSM helper, never inline `prisma.update`.
- After running `prisma migrate dev`, the Prisma client can go stale in THREE layers (2026-06-05, cost a debugging session): process memory, `node_modules`, and the `.next` webpack cache (because `@ilaunchify/db` is in `transpilePackages`, the old client gets BUNDLED into `.next`). "Property X does not exist" at typecheck or `prisma.<model> is undefined` at runtime after a successful migrate = stale client. Full incantation: `pnpm db:generate` → `rm -rf apps/*/.next` → restart `next dev`.

## Design system (LOCKED 2026-05-27)

- **Pink** `#FF2E63` brand color
- **Black pill** primary CTA (white text)
- **Neon green** `#B5FF3D` accent on **dark surfaces only**
- **Pink-700** accent on light surfaces
- **Hero band** `var(--bg-hero)` = `#FFFFFF` card white — admin v2 header bands + panel headers, reading via their hairline `border-ink-200`. **Changed 2026-06-25** from cream `#F3EFE8`/`bg-cream` (briefly `#F7F8FA` gray, too close to the shell); all admin bands now use `bg-[var(--bg-hero)]`. One-line token swap. (Marketing landing keeps its own cream.)
- **Inter** body, **Bricolage Grotesque** display, **Fraunces** italic emphasis
- Dark hero / light explainer / dark CTA section pattern

Tokens live in `packages/ui/src/tokens` and `packages/ui/src/theme.css`. Tailwind preset at `packages/ui/tailwind.preset.ts`.

**Before building ANY UI, read `AGENTS.md` (repo root) + `packages/ui/registry.json`** — the component registry + UI laws. Reuse a component if it covers ~80% of the need; don't invent one. Hex/palette hygiene enforced by `pnpm check:colors` (see `docs/DESIGN_TOKEN_HYGIENE.md`).

## Admin v2 surface pattern (LOCKED 2026-05-31)

Every admin list page follows this chrome — **no exceptions, no shadcn Card, no @ilaunchify/ui Card**:

1. `bg-[var(--bg-hero)]` (#FFFFFF card white, hairline border) rounded-3xl hero band with title + subtitle
2. 5-card KPI strip (KpiWidget)
3. URL-driven filter chip rows (status chips, type chips, dropdowns)
4. Sortable plain `<table>` with focus-visible:ring-pink-500 on headers
5. RowActionsMenu (3-dot) per row — actions deep-link to detail pages, never inline-mutate
6. Prev/Next paginator at 50/page

Canonical references: `apps/admin/src/app/(dashboard)/audit/page.tsx`, `partners/page.tsx`, `products/page.tsx`. Memory file `.claude/memory/ilaunchify-admin-surface-pattern.md` has the full spec. Use the `v2-admin-surface-builder` subagent.

## Marketplace taxonomy (LOCKED — read before touching)

4 orthogonal layers, all wired:
- **Layer 1 — Creator Niches** · 8 locked, many-to-many · `packages/db/prisma/seed-niches.ts` is capped. Slugs MUST match `apps/marketing/src/lib/niches.ts`. NEVER seed beyond 8.
- **Layer 2 — Product Categories** · 13 locked, exactly-one · `seed-categories-locked.ts`
- **Layer 3 — Manufacturing Formats** · format-specific options · partner-facing filter
- **Layer 4 — Lifestyle Tags** · 30 admin-curated, many-to-many · 3 groups (Lifestyle / Audience / Trend)

Niche assignment: deterministic rule engine in `packages/marketplace/suggestNiches.ts` → manufacturer accepts/edits in the partner editor → admin overrides on review. Every change writes a `NicheAssignmentAudit` row.

Use the `marketplace-taxonomy-guardian` subagent before adding any new taxonomy row.

## Leads ARE early-stage Partners

`/admin/leads` and `/admin/partners` query the same `Partner` table. Lead = Partner row in LEAD / INVITED / IN_PROGRESS status. There is no `Lead` model; never propose one. Notes stored on `Partner.leadNotes` JSON.

## Tiers

- Creator: `maker | builder | agency` (not Master) — `packages/auth/tiers.ts`. **Paid subscription.**
- Partner: `VERIFIED | TRUSTED | PREMIER` — **EARNED via the Merit Engine, not purchased** (decision C, docs/PARTNER_TIER_VS_MERIT.md; supersedes the old "no behavioral binding" note). The badge now binds to the production fee (Verified 4.5% / Trusted 2.5% / Premier 0%, admin-tunable in the Merit console) and, going forward, to perks. The Merit Engine is the single decider of `Partner.tier`; the `/tiers` hand-set is an audited admin override, and the partner `SubscriptionPlan` rows are the earned perk ladder (their price/FeeRule are NOT the live source). Never sell a partner badge.

## Fee model (RECONCILED 2026-07-09 — read before touching any money path)

**Two independent fees on two parties, two SSOTs. Never conflate them, never hardcode a fee.**

- **Creator production fee** = the creator's subscription-tier rate: **Maker 15% / Builder 12% / Agency 8%**, charged as the Stripe application fee at checkout. Admin-editable in **Tiers & Plans** (`FeeRule`). SSOT = `@ilaunchify/plans` `resolveCreatorFeeBps` — every charge path resolves it here; nothing else recomputes a platform fee. Fee base = production subtotal + FC labeling (shipping excluded). Snapshotted onto `Order.platformFeeBps/Cents/Source`.
- **Manufacturer merit fee** = **Verified 4.5% / Trusted 2.5% / Premier 0%**, **withheld from the MANUFACTURER's payout** (it "eats the manufacturer"), NOT added to the creator's charge. SSOT = `MeritPolicy` + badge via `@ilaunchify/orders` `resolveManufacturerMeritFeeBps`. **Shadow-inert until `MeritPolicy.enabled`.** Snapshotted at routing onto `OrderDispatch.meritFeeBps/Cents`, netted at payout on `Transfer.meritFeeCents`.
- **FEE-BASE RULE (LOCKED 2026-07-15, Pavel). Encode the RULE, not the list:**
  > A component belongs in the creator fee base **if and only if a partner/creator both SETS its price AND KEEPS the proceeds.**

  This is the rule that predicts every real marketplace (Etsy/eBay/Amazon include shipping because *sellers* set and pocket it; **Faire**, the closest B2B analogue, commissions order-subtotal ONLY and reimburses shipping at cost; POD suppliers take 0% and go cost-plus). Consequences here:
  - **IN the base:** the whole production subtotal, i.e. manufacturing + print + packaging + **decoration + component upgrades + finishes** + (as they land) **tooling/plates, rush uplift, prepress/art-fix, Pantone match, proofs, additional-version fees** + FC labeling. All are partner-set and creator-paid, so all are in.
  - **OUT of the base:** shipping/freight. It fails BOTH limbs: **we** quote it from the carrier (EasyPost) and **we** keep the margin (`firstLegMarginBps`), so a partner cannot shift production price into it to dodge the fee. Charging the fee on it would tax our own markup (double-dip). Tax: never.
  - **THE LIVE RISK this rule exists to catch:** any NEW partner-priced, creator-paid line item added OUTSIDE the production subtotal is a fee-arbitrage vector (quote a low unit price + a fat setup fee, and the take rate silently shrinks). Before adding any such field, re-derive it against the rule. "Shipping excluded" is a fact about today's architecture, NOT a permanent exemption: if a partner ever gains the ability to set a creator-facing price on it, it moves INTO the base.
- **RETIRED:** the flat 5% `OrderSettings.productionFeeBps` as the creator-fee source (column kept, deprecated). A `check:invariants` rule now warns on any new hardcoded platform-fee constant outside `@ilaunchify/plans`.
- Full model + ready-to-apply patches: `docs/FEE_MODEL_RECONCILIATION_SPEC_2026-07-09.md` (+ `FEE_CREATOR_CHECKOUT_PATCH` / `FEE_SHIPDISPATCH_MERIT_PATCH`). Origin: `AUDIT_2026-07-09_CONSISTENCY.md`.

## Public partner profile / Front Face (LOCKED 2026-07-15, do not re-derive)

The public **Front Face** (`/partners/[slug]`) is the manufacturer's public "Manufactured by [X]" identity. Eligibility is narrow and non-negotiable:

- **Only open-market MANUFACTURING or COPACKING partners** with a FULL-disclosure nameable service and published content get one. `participationMode=PUBLIC` is REQUIRED.
- **Private / invited-only partners get NO public profile** (route `notFound`; PDP shows name without a link, or generic "Manufacturer"). Invited-only means a private operator (curated cohort, or a co-partner nominated `PRIVATE_TO_INVITER`) that is invisible to the open market, so a public marketing page would contradict it.
- **Pure printers (LABEL_PRINTING) and warehouses (WAREHOUSE) NEVER get a Front Face** (only MFR/COPACK are nameable; printers keep PDP provider cards).
- **This is NOT tied to rotation.** Manufacturing is OWNER-PINNED and manufacturers/co-packers are never rotated. Only printers rotate (marketplace print rotation); warehouses use a separate FC-selection cycle (product temp-class / location / capacity). So "open market" for a manufacturer means discoverable + nominatable, never "in a rotation lottery."
- **Admin governs live/offline on top** via the Partner Access console `PUBLIC_PROFILE` lever (master `publicProfilesEnabled` + per-partner DENY, default ON so admin only SUBTRACTS). When admin turns it off, the partner stops seeing it on their own `/profile` page too.

SSOT: resolver `@ilaunchify/auth` `resolvePartnerOpportunity('PUBLIC_PROFILE', …)` + reader `@ilaunchify/db` `getPartnerProfile`. Do not add a partner self-serve "go-live" toggle, and do not decouple the profile from `participationMode` (that was tried and reverted). See `.claude/memory/ilaunchify-public-partner-profile-disclosure.md` + `ilaunchify-partner-access-console.md`.

## Print rotation ≠ FC selection (LOCKED 2026-07-15, distinct concepts, distinct words)

- **Printers ROTATE.** A fair-share lottery across an interchangeable pool (top-N, split modes, new-provider ramp, sticky). Controlled by `PartnerService.excludeFromAutoRotation`, whose SOLE writer is the Partner Access `PRINT_ROTATION` lever. `PrintAwardLog` records awards.
- **Manufacturers / co-packers are OWNER-PINNED** to `ProductTemplate.manufacturerServiceId` — never rotated, never shopped. The Manufacturers tab only arbitrates multi-manufacturer templates.
- **Warehouses / FCs are SELECTED per order by FIT** (temp-class / hazmat / location / capacity / SLA / cost), with an OPTIONAL "balancing" band to spread among near-equal facilities. This is NOT rotation. FCs have **NO kill switch** — to pull one, Pause its service or set a blackout window (both honored by the selector). Do NOT reintroduce an FC `excludeFromAutoRotation` toggle, and do NOT call FC selection "rotation" in code or UI. Use *selection / assignment / balancing*.

## Gotchas

1. **Legacy FOD frontend squats port 3000** — Pavel's Mac runs an old `ilaunchify-frontend` Docker container on 3000. ANY localhost:3000 weirdness → check `docker ps | grep frontend` FIRST.
2. **Stale Prisma client after migrate (3 layers: memory, node_modules, `.next` cache)** — `pnpm db:generate` → `rm -rf apps/*/.next` → restart. See Database section.
3. **Cross-app links** — see Architecture section.
4. **No `@db.Text`** on CockroachDB.
5. **No function-shaped props across RSC boundary** — Next 15 / React 19 rejects passing Lucide icon refs from server → client. Import icons inside the client component instead.

## Multi-agent collaboration (Cowork + Code share one working tree)

Two agents edit this repo in parallel (Cowork via desktop, Code via CLI). Git has **no file-level lock** — whoever holds *uncommitted* edits when the other commits or `git reset`s gets clobbered. Rules to avoid collisions:

1. **Single writer per file.** Only one agent edits a given file during a session. Before the other agent touches a "hot" file, the current owner commits/stashes it (clean working tree for that path) and verbally hands it off. Announce ownership; don't assume.
2. **Commit immediately after each change.** Never leave edits sitting uncommitted while the other agent is active — that's when work is lost. (Cowork's sandbox can't write `.git`; the human runs the `git add … && git commit && git push` Cowork hands them, promptly.)
3. **No repo-wide destructive ops while the other is active** — no `git reset --hard`, `git checkout .`, or rebases that wipe uncommitted work across the tree.
4. **`.git/index.lock` "Operation not permitted"** = the other agent's git is mid-operation. Wait for it to finish; only `rm -f .git/index.lock` when **no** agent is running a git command (deleting it mid-op corrupts the commit).
5. **Hot zones today:** partner New-Product builder (`apps/partner/src/app/(dashboard)/products/new/*`) and the Design Studio canvas. Treat these as single-writer by default. See `.claude/memory/ilaunchify-two-agent-hot-file-collisions.md`.

## Commands

```bash
pnpm dev                  # start all apps
pnpm db:push              # APPLY SCHEMA CHANGES — this repo uses `prisma db push`, NOT migrate.
                          # (migrate dev sees the pushed-but-unmigrated DB as drift and tries to RESET. Don't.)
pnpm db:generate          # regenerate the Prisma client (DO THIS after every db:push)
pnpm db:seed              # reseed
pnpm typecheck            # workspace-wide tsc
pnpm lint                 # workspace-wide eslint
```

After `db:push` + `db:generate`, also `rm -rf apps/*/.next` and restart `next dev` — the old client gets bundled into `.next` (see Database §stale-client gotcha).

## Memory + decision history

Persistent decisions live in `.claude/memory/*.md`. Index at `.claude/memory/INDEX.md`. Read it when starting work on an unfamiliar surface.

Larger specs in `docs/`:
- `CO_CREATION_MARKETPLACE_SPEC.md` — **NEW (2026-07-09)** creator-originated products: two-door Brief Builder → manufacturer Opportunity Pool (Express-Interest, no recipe) → Shortlist & Selection → on-platform Collaboration Room (structured recipe/label/packaging objects + approvals + milestone escrow). **Start-here for the co-creation build is §0.** UX contract = branded prototype `iLaunchify-cocreation-demo.html` (repo root) + `design/co-creation-demo.html`; rationale/research = `design/co-creation-strategy-brief.html`.
- `PLATFORM_SPEC.md` — tiers, fees, FSMs
- `MARKETPLACE_DESIGN.md` — 4-layer taxonomy detail
- `PRODUCTION_ORCHESTRATION.md` — multi-partner workflow graph
- `LOGISTICS_AND_FULFILLMENT.md` — LOCKED L1–L9 + BUILT L0–L4a (2026-07-02) · 4 ship-to types (incl. HOLD_AT_MANUFACTURER + CHANNEL_INBOUND), FC network + scorer, EasyPost rail, channel gates. Everything admin-gated via LogisticsSetting (admin → Logistics → Gates); temp class + hazmat are HARD filters, never weights. SP-API/ShipBob/insurance blocked on external accounts. FNSKU-in-dieline = Studio = Code's zone (HANDOFF-TO-CODE-fnsku-in-dieline.md).
- `COPACK_SERVICE_SPEC_2026-07-15.md` (NEW): Co-packer Service Builder + co-pack monetization. **§0 is the start-here:** co-packing has NO price model at all (no offering table, no `PriceLine.kind`, no writer for `coPackerServiceId`); a co-pack leg earns a flat 7% of the creator's unit price. Forces `MULTI_COMPONENT_DISPATCH.md` C1 (which gates `createDispatches`). A co-packer sells OPERATIONS, not a thing, so the unit varies per op and the cost driver is CHANGEOVER (which is where MOQ comes from: derive the floor, never ask them to type it). Prototype = `design/copacker-service-builder-prototype.html`. Multi-service is already law: `@@unique([partnerId, type])` allows all 4, and a co-packer's press is excluded from the public print pool by `isPublicPrintPoolEligible` (rotation.ts:299).
- `PRINT_PROVIDER_SELECTION.md` — Printify-model provider cards + selection binding (PS-1→PS-3d BUILT 2026-07-06: sourcing signal, capability model §7, honey-problem application point §8, pinned picks + reroute gate, FC finalize-labeling, per-hop shipping) · §10 Print Coverage + Capability RFQ specced · §5 rotation superseded by SMART_ROTATION_ENGINE.md
- `SMART_ROTATION_ENGINE.md` — admin-controlled auto-rotation (RotationPolicy: top-N by Bayesian rating, EQUAL/RANDOM/WEIGHTED_EXACT/BEST_ONLY, new-provider ramp, floor, location bias, sticky reorders, kill switch, PrintAwardLog) · SR-1 pure engine BUILT 2026-07-06, `enabled=false` until flipped; execution checklist in §3
- `FEEDBACK_MODULE.md` + `FEEDBACK_AND_RATINGS_CHECKLIST.md` — thumbs feedback rail, partner ratings (Bayesian, pink stars), verified creator reviews · Stages 1–7 BUILT 2026-07-06
- `MULTI_PARTNER_APPROVAL_WORKFLOW.md` — H1 spec
- `MANUFACTURER_PRODUCT_BUILDER.md` — partner editor card spec
- `DESIGN_SYSTEM.md` — full tokens + components
- `SECURITY_ARCHITECTURE.md` — LOCKED 2026-06-05 · threat model + Tier 0/1/2 plan. Tenant isolation is threat #1; new server actions use centralized ownership guards (`packages/auth`), never ad-hoc checks.
- `PARTNER_ONBOARDING_STRATEGY_2026-07.md` — onboarding redesign + Activation Setup (§5B service-composed post-approval stepper) + nomination model (§6, Option A + §6.5 controls) + private/public access switch (§7) + admin templates (§11). Decisions D1–D9. **UI = `design/partner-onboarding-mockup.html` (approved baseline).**
- `AUTH_ENTRANCE_SECURITY_2026-07.md` — 3-entrance auth hardening: invite-only + Turnstile + passkeys; admin 2FA spec §4B (TOTP-first, build now). Decisions S1–S5.
- `BUILD_CHECKLIST_ONBOARDING_2026-07.md` — living build tracker for all the above (P0–P3). Check items off as built.
- `legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md` Addendum 2026-07-07 — counsel redlines for nomination liability (D7), e-sign, anti-circumvention. **Don't ship nomination until counsel blesses D7.**

## Available subagents

- `v2-admin-surface-builder` — admin list pages (cream hero / KPI / chips / table / RowActionsMenu)
- `partner-editor-card-builder` — partner /products/[id]/edit cards (autosave + FSM + audit + approval-marked)
- `prisma-migrator` — schema changes + migrations + seed + CockroachDB-safe types
- `marketplace-taxonomy-guardian` — reviews any taxonomy change against the locked spec
