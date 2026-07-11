# M4 — money-formatter consolidation (SSOT built; codemod handoff)

**Done (committed separately):** a single canonical formatter now exists —
`formatCents(cents)` and `formatCentsOrDash(cents|null)` in
`packages/ui/src/lib/money.ts`, exported from `@ilaunchify/ui`, pin-tested
(`money.test.ts`). ONE rounding rule (`toFixed(2)`). This is the SSOT every site
below should adopt. (Audit finding M4.)

> Note: this is a **duplication** cleanup, not an active-bug fix — every existing
> copy already uses `toFixed(2)`, so nothing renders differently after migration.
> Value = one source of truth + it unblocks guardrail 0.4.

## Codemod — replace each local helper with the SSOT

For each file: delete the local `const money/usd/formatCents/... = (c) => …` and
switch call sites to the import. Pick the variant by null-handling:
- plain `(c) => \`$${(c/100).toFixed(2)}\`` → **`formatCents`**
- `(c) => c == null ? '—' : …` → **`formatCentsOrDash`**

### A · Client components / pages — `import { formatCents } from '@ilaunchify/ui'` (safe)
- `apps/creator/.../products/[productId]/spec-sheet/page.tsx` (`money`)
- `apps/creator/.../products/[productId]/configure/ConfiguratorClient.tsx` (`money`)
- `apps/creator/.../checkout/OrderSummary.tsx` (`formatCents`)
- `apps/creator/.../checkout/steps/CheckoutStep.tsx` (`usd`)
- `apps/creator/.../checkout/steps/ProductionStep.tsx` (`formatCents`)
- `apps/creator/.../checkout/SubscribeChoiceRail.tsx` (`formatCents`)
- `apps/partner/.../products/[id]/preview/page.tsx` (`money`)
- `apps/partner/.../products/new/ReviewSummary.tsx` (`usd` → `formatCentsOrDash`)
- `apps/partner/.../billing/page.tsx` (`usd` → `formatCentsOrDash`)
- `apps/admin/.../orders/[orderId]/page.tsx` (`formatCurrency`)
- `apps/admin/.../partners/[partnerId]/page.tsx` (`formatCurrency`)
- `apps/admin/.../order-settings/overrides/OverridesManager.tsx` (`usd` → `formatCentsOrDash`)
- `apps/admin/.../order-settings/OrderSettingsForms.tsx` (`usd` → `formatCentsOrDash`)
- `apps/admin/.../sample-settings/SampleSettingsForm.tsx` (`usd` → `formatCentsOrDash`)

### B · `packages/ui` internal components — `import { formatCents } from './lib/money'` (relative; contained)
- `packages/ui/.../FavoriteRow.tsx` (`money`)
- `packages/ui/.../ProductCard.tsx` (`fmtMoney`)
- `packages/ui/.../PerFlavorEarnings.tsx` (`usd`)

### C · Server-side files — **verify barrel-import safety first**
Importing from the `@ilaunchify/ui` barrel (which re-exports `'use client'`
components) into a server action can pull client-only code. For these, either add a
server-safe subpath export for `money.ts` and import that, or keep the local helper:
- `apps/partner/.../products/new/review-actions.ts` (`money`)
- `apps/partner/.../settings/storage/actions.ts` (`formatDollars`)
- `apps/partner/.../packaging-finishes-actions.ts` (`usd`)

### D · Non-ui packages — dependency-direction blocked
`packages/orders/src/sample-quote.ts` (`formatCents`) can't import `@ilaunchify/ui`
(wrong dep direction). It and its twin `apps/marketing/src/lib/sample-quote.ts` are a
duplicate pair — either leave them, or hoist a shared pure `money.ts` into a
lower-level package both can import (e.g. `@ilaunchify/types`) and re-export from
`@ilaunchify/ui`. Out of scope for the quick codemod.

## After the codemod
Once A–C are migrated (D allowlisted), enable **guardrail 0.4** in
`scripts/check-invariants.mjs`: warn on any `(c…: number) => \`$…toFixed(2)…\`` helper
defined outside `packages/ui/src/lib/money.ts` (allowlist the residual D cases). That
freezes the pattern so the 15 copies can't regrow.

## Why handed off, not applied here
~15 files across all four apps + server actions with a barrel-import nuance (C) that
needs a real `pnpm type-check` to validate — which can't run in this session. The
durable win (the SSOT util + test) is landed; the mechanical swaps are low-risk but
want typecheck + are best done in one focused PR without colliding with in-flight app
work.
