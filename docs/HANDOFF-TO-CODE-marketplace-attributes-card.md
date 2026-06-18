# Handoff to Code — Partner builder: Marketplace Attributes card

**Owner:** Code (single-writer in `apps/partner/.../products/new/`).
**Why this is a handoff, not a Cowork build:** the partner guided builder is Code's hot-file zone (GuidedBuilder + step components churn often). Cowork built the schema, the marketing filter query/sidebar, and the **admin** editor for these same fields; this card is the partner-authoring counterpart and should be written by the single writer of the builder to avoid clobbering.

**Goal:** let a partner set the four §7 marketplace-filter attributes on their ProductTemplate, so the catalog filters have authoritative data at the source (partners know the real form/process/claims), not just admin curation.

---

## 0. Context — already shipped (do not rebuild)

- **Schema (migration pending on Mac, see `docs/SESSION_HANDOFF_2026-06-14.md §8`).** `ProductTemplate` already has:
  - `manufacturingFormat ManufacturingFormat?` — single enum (18 values).
  - `manufacturingProcesses String[]`
  - `allergenFreeClaims String[]`
  - `marketCodes String[] @default(["US"])`
- **Shared option constants** in `@ilaunchify/types` (`packages/types/src/marketplace-filters.ts`), already a dep + in `transpilePackages` for `apps/partner`:
  - `FORMAT_OPTIONS`, `MANUFACTURING_PROCESS_OPTIONS`, `ALLERGEN_FREE_OPTIONS`, `MARKET_FILTER_OPTIONS` (each `FilterOption[]` = `{ value, label, group? }`).
  - **These are the single source of truth** — the marketplace sidebar filters on exactly these slugs. Do NOT hand-write option lists in the card; import from here, or filters silently break on slug drift.
- **Marketing query layer** (`apps/marketing/src/lib/templates.ts buildWhere`) already filters on all four fields. Nothing to change there.
- **Admin editor precedent** — `apps/admin/.../products/[id]/MarketplaceAttributesPanel.tsx` + `adminSetMarketplaceAttributes` in `apps/admin/.../products/actions.ts`. **Mirror its validation exactly** (validate against the shared lists, dedupe, drop unknowns). The partner action is the same logic with the partner ownership guard.

---

## 1. Server action — `setMarketplaceAttributes`

**File:** `apps/partner/src/app/(dashboard)/products/new/build-actions.ts` (add alongside `setIntendedAgeGroup`, which is the closest precedent — copy its shape).

```ts
import {
  FORMAT_OPTIONS,
  MANUFACTURING_PROCESS_OPTIONS,
  ALLERGEN_FREE_OPTIONS,
  MARKET_FILTER_OPTIONS,
} from '@ilaunchify/types'

export async function setMarketplaceAttributes(
  productTemplateId: string,
  input: {
    manufacturingFormat: string | null
    manufacturingProcesses: string[]
    allergenFreeClaims: string[]
    marketCodes: string[]
  },
): Promise<Result> {
  try {
    // (a) auth + ownership — identical to setIntendedAgeGroup
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, status: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    // (b) validate against the shared option lists (drop unknowns, dedupe)
    const fmt = new Set(FORMAT_OPTIONS.map((o) => o.value))
    const prc = new Set(MANUFACTURING_PROCESS_OPTIONS.map((o) => o.value))
    const alg = new Set(ALLERGEN_FREE_OPTIONS.map((o) => o.value))
    const mkt = new Set(MARKET_FILTER_OPTIONS.map((o) => o.value))

    const format =
      input.manufacturingFormat && fmt.has(input.manufacturingFormat)
        ? input.manufacturingFormat
        : null
    const processes = [...new Set(input.manufacturingProcesses)].filter((s) => prc.has(s))
    const allergenFree = [...new Set(input.allergenFreeClaims)].filter((s) => alg.has(s))
    const markets = [...new Set(input.marketCodes)].filter((s) => mkt.has(s))

    const data = {
      manufacturingFormat: format,
      manufacturingProcesses: processes,
      allergenFreeClaims: allergenFree,
      marketCodes: markets,
    }

    // (c) DRAFT → direct update. PUBLISHED → see §4 (decision point).
    // Cast-guard the update (columns ship with a pending migration).
    await (prisma as unknown as {
      productTemplate: { update: (a: unknown) => Promise<unknown> }
    }).productTemplate.update({ where: { id: productTemplateId }, data })

    // (d) audit (non-fatal). 'MARKETPLACE_ATTRIBUTES_SET' is free-form-allowed
    // by the AuditAction union; optionally add it to AUDIT_ACTIONS in
    // packages/audit/src/types.ts for the review dashboard.
    try {
      await logAuditAs(user, {
        entityType: 'ProductTemplate',
        entityId: productTemplateId,
        action: 'MARKETPLACE_ATTRIBUTES_SET',
        payload: data,
      })
    } catch (e) {
      console.error('[setMarketplaceAttributes] audit failed (non-fatal):', e)
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save attributes: ${(err as Error).message}` }
  }
}
```

Notes:
- One batched action (all four fields) — simpler than the per-field `setIntendedAgeGroup` because three of the four are arrays. The card saves the whole set on change.
- `requirePartner()`, `prisma`, `logAuditAs`, `Result` are all already imported in `build-actions.ts`.

---

## 2. Card component — `MarketplaceAttributesCard.tsx`

**File:** `apps/partner/src/app/(dashboard)/products/new/MarketplaceAttributesCard.tsx` (new). Mirror `CertificatesCard.tsx` for the autosave/transition/toast UX, and the **admin** `MarketplaceAttributesPanel.tsx` for the control layout (Format = single-select pills, the other three = checkbox rows). You can lift the admin panel's JSX almost verbatim; only the wiring differs.

```tsx
'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  FORMAT_OPTIONS, MANUFACTURING_PROCESS_OPTIONS,
  ALLERGEN_FREE_OPTIONS, MARKET_FILTER_OPTIONS, type FilterOption,
} from '@ilaunchify/types'
import { setMarketplaceAttributes } from './build-actions'

export function MarketplaceAttributesCard({
  draftId,
  initial,
  preview = false,
}: {
  draftId: string | null
  initial: {
    format: string | null
    processes: string[]
    allergenFree: string[]
    markets: string[]
  }
  preview?: boolean
}) {
  const [format, setFormat] = useState(initial.format)
  const [processes, setProcesses] = useState(new Set(initial.processes))
  const [allergenFree, setAllergenFree] = useState(new Set(initial.allergenFree))
  const [markets, setMarkets] = useState(new Set(initial.markets.length ? initial.markets : ['US']))
  const [, start] = useTransition()

  // Autosave on every change (immediate, like setIntendedAgeGroup). Pass the
  // NEXT state explicitly so we don't save stale closure values.
  function persist(next: { format?: string | null; processes?: Set<string>; allergenFree?: Set<string>; markets?: Set<string> }) {
    if (!draftId || preview) return
    start(async () => {
      const r = await setMarketplaceAttributes(draftId, {
        manufacturingFormat: next.format !== undefined ? next.format : format,
        manufacturingProcesses: [...(next.processes ?? processes)],
        allergenFreeClaims: [...(next.allergenFree ?? allergenFree)],
        marketCodes: [...(next.markets ?? markets)],
      })
      if (!r.ok) toast.error(r.error ?? 'Could not save')
    })
  }
  // ... render Format pills + three checkbox groups; each onToggle updates
  // local state AND calls persist({...}) with the new value. Disable inputs
  // when `preview` (Review step read-only). Copy the visual structure from the
  // admin MarketplaceAttributesPanel (Pill + CheckboxField sub-components).
}
```

UX requirements:
- **Format** single-select pills (clicking the active one clears to `null`).
- **Manufacturing process / Allergen-free / Markets** multi checkboxes.
- **Allergen-free hint (REQUIRED, keep verbatim intent):** "An explicit free-from claim — only check what the product is verified to be." This is a regulatory claim; never pre-check or infer it.
- **Markets** default to `['US']` when unset (V1 US-only ACTIVE).
- Save immediately on change with a quiet toast on error only (match `setIntendedAgeGroup`'s fire-and-forget; no "Saved" chip needed, the builder is autosave throughout).

---

## 3. Placement + load-back

**Place in Step 1 — `BasicsStep.tsx`**, grouped with the other marketplace-discovery fields (niches / lifestyle tags / category). Format/process/markets are catalog-discovery metadata, which is Basics' job. (The age-group selector lives in Recipe only because it's nutrition-panel-specific; these are not.)

**Load-back — extend `loadDraft` + `InitialDraft` in `build-actions.ts`:**
1. Add to the `loadDraft` `select`: `manufacturingFormat`, `manufacturingProcesses`, `allergenFreeClaims`, `marketCodes` (cast-guard the select if the generated client is stale, same as other pending-migration reads).
2. Add the four fields to the `InitialDraft` interface.
3. Map them in the return: `manufacturingFormat: tpl.manufacturingFormat ?? null`, arrays `?? []`.
4. In `GuidedBuilder`/`BasicsStep`, thread `initial` → the card's `initial` prop:
   ```tsx
   <MarketplaceAttributesCard
     draftId={draftId}
     preview={isReviewStep}
     initial={{
       format: initial?.manufacturingFormat ?? null,
       processes: initial?.manufacturingProcesses ?? [],
       allergenFree: initial?.allergenFreeClaims ?? [],
       markets: initial?.marketCodes ?? [],
     }}
   />
   ```

---

## 4. Decision point for Pavel — PUBLISHED-template edits

The builder is primarily for DRAFTs (simple direct save). When a partner edits a **PUBLISHED** template, other partner edit flows route through `pendingEditPayload` + `status → PENDING_EDIT_REVIEW` so admin re-reviews before changes go live.

**Question:** do marketplace-attribute edits (Format / process / allergen-free / markets) on a live product require admin re-review?
- **If yes** (recommended for **allergen-free** at minimum — it's a public claim): on `status !== 'DRAFT'`, write to `pendingEditPayload` and set `PENDING_EDIT_REVIEW` instead of a direct update, mirroring the existing published-edit actions.
- **If no** (treat as low-risk metadata): direct update always.

Default to **re-review for allergen-free, direct for the rest** unless Pavel says otherwise. The action above does a direct update for all — split it per the decision.

---

## 5. Acceptance / test

- Ownership guard: non-partner and wrong-service partner both rejected.
- Validation: unknown slugs dropped; arrays deduped; bad format → null.
- Round-trip: set in builder → `loadDraft` returns them → card rehydrates.
- Cross-check: a value set here makes the template appear under that filter on `/marketplace` (e.g. set Format = Powder, then `?format=POWDER` includes it).
- Typecheck `apps/partner` clean. (Migration must be applied + client regenerated on the dev machine first, or the cast-guards carry it.)

---

## 6. Files touched

- `apps/partner/.../products/new/build-actions.ts` — `setMarketplaceAttributes` + `loadDraft`/`InitialDraft` extension.
- `apps/partner/.../products/new/MarketplaceAttributesCard.tsx` — new.
- `apps/partner/.../products/new/BasicsStep.tsx` (+ `GuidedBuilder.tsx` if it threads `initial`) — render the card.
- `packages/audit/src/types.ts` — optional: add `'MARKETPLACE_ATTRIBUTES_SET'` to `AUDIT_ACTIONS`.

No schema change (done). No marketing change (done). No admin change (the admin editor already ships).
