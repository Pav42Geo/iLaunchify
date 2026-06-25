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
- `packages/orders` — order routing + manifest generation
- `packages/compliance` — FDA rule packs + label validator (Python service)

## Database

CockroachDB Serverless via Prisma. Schema at `packages/db/prisma/schema.prisma`.

**Critical conventions:**
- Migrations are additive. Never `DROP TABLE` or `DROP COLUMN` without a Pavel decision.
- Cockroach rejects `@db.Text` — use bare `String` (it's already unbounded) or `@db.String(N)` for caps. `prisma generate` fails with P1012 otherwise.
- `id` is `String @id @default(uuid())` not `cuid()` and not autoincrement (no sequential hotspots).
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

- Creator: `maker | builder | agency` (not Master) — `packages/auth/tiers.ts`
- Partner: `VERIFIED | TRUSTED | PREMIER` — **placeholder names, no behavioral binding decided yet.** Never write "Premier partner gets X" anywhere. Surface as info-only chip.

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
- `PLATFORM_SPEC.md` — tiers, fees, FSMs
- `MARKETPLACE_DESIGN.md` — 4-layer taxonomy detail
- `PRODUCTION_ORCHESTRATION.md` — multi-partner workflow graph
- `MULTI_PARTNER_APPROVAL_WORKFLOW.md` — H1 spec
- `MANUFACTURER_PRODUCT_BUILDER.md` — partner editor card spec
- `DESIGN_SYSTEM.md` — full tokens + components
- `SECURITY_ARCHITECTURE.md` — LOCKED 2026-06-05 · threat model + Tier 0/1/2 plan. Tenant isolation is threat #1; new server actions use centralized ownership guards (`packages/auth`), never ad-hoc checks.

## Available subagents

- `v2-admin-surface-builder` — admin list pages (cream hero / KPI / chips / table / RowActionsMenu)
- `partner-editor-card-builder` — partner /products/[id]/edit cards (autosave + FSM + audit + approval-marked)
- `prisma-migrator` — schema changes + migrations + seed + CockroachDB-safe types
- `marketplace-taxonomy-guardian` — reviews any taxonomy change against the locked spec
