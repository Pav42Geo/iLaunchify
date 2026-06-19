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

// Return widens Result with `staged` so the card can distinguish a live save
// from an allergen-free change sent for review.
type AttrResult = { ok: true; staged?: boolean } | { ok: false; error: string }

export async function setMarketplaceAttributes(
  productTemplateId: string,
  input: {
    manufacturingFormat: string | null
    manufacturingProcesses: string[]
    allergenFreeClaims: string[]
    marketCodes: string[]
  },
): Promise<AttrResult> {
  try {
    // (a) auth + ownership — identical to setIntendedAgeGroup
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    // Cast-guarded read — status + current allergen claims + pending payload
    // (these columns ship with a pending migration).
    const tpl = await (prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{
        manufacturerServiceId: string | null
        status: string
        allergenFreeClaims: string[]
        pendingEditPayload: Record<string, unknown> | null
      } | null> }
    }).productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, status: true, allergenFreeClaims: true, pendingEditPayload: true },
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

    const pt = (prisma as unknown as {
      productTemplate: { update: (a: unknown) => Promise<unknown> }
    }).productTemplate
    const sameSet = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

    // (c) §4 LOCKED policy:
    //   DRAFT      → everything saves live (no review).
    //   PUBLISHED  → Format / process / markets are low-risk metadata → live.
    //                allergen-free is a public regulatory CLAIM → a CHANGED value
    //                must NOT go live without admin re-review: stage it into
    //                pendingEditPayload + set status PENDING_EDIT_REVIEW. The live
    //                allergenFreeClaims is left untouched until admin approves
    //                (approveProductTemplate applies pendingEditPayload).
    let staged = false
    if (tpl.status === 'DRAFT') {
      await pt.update({
        where: { id: productTemplateId },
        data: { manufacturingFormat: format, manufacturingProcesses: processes, allergenFreeClaims: allergenFree, marketCodes: markets },
      })
    } else {
      // live: the three low-risk fields
      await pt.update({
        where: { id: productTemplateId },
        data: { manufacturingFormat: format, manufacturingProcesses: processes, marketCodes: markets },
      })
      // allergen-free: stage for review ONLY if it actually changed
      if (!sameSet(tpl.allergenFreeClaims ?? [], allergenFree)) {
        await pt.update({
          where: { id: productTemplateId },
          data: {
            pendingEditPayload: { ...(tpl.pendingEditPayload ?? {}), allergenFreeClaims: allergenFree },
            status: 'PENDING_EDIT_REVIEW',
          },
        })
        staged = true
      }
    }

    // (d) audit (non-fatal). 'MARKETPLACE_ATTRIBUTES_SET' is free-form-allowed by
    // the AuditAction union; optionally add it to AUDIT_ACTIONS in
    // packages/audit/src/types.ts for the review dashboard.
    try {
      await logAuditAs(user, {
        entityType: 'ProductTemplate',
        entityId: productTemplateId,
        action: 'MARKETPLACE_ATTRIBUTES_SET',
        payload: { manufacturingFormat: format, manufacturingProcesses: processes, allergenFreeClaims: allergenFree, marketCodes: markets, stagedForReview: staged },
      })
    } catch (e) {
      console.error('[setMarketplaceAttributes] audit failed (non-fatal):', e)
    }

    // Return whether the allergen-free change was staged so the card can toast
    // "Sent for review" instead of "Saved" in that case.
    return { ok: true, staged }
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
      else if (r.staged) toast('Allergen-free change sent for admin review')
      // (no toast on a plain live save — autosave is silent, matching the builder)
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

## 4. LOCKED — PUBLISHED-template edits (Pavel 2026-06-18)

Implemented in the §1 action above; do not re-open. The rule:

| Field | DRAFT | PUBLISHED |
|---|---|---|
| `manufacturingFormat` | live | **live** (low-risk metadata) |
| `manufacturingProcesses` | live | **live** |
| `marketCodes` | live | **live** |
| `allergenFreeClaims` | live | **re-review** — stage to `pendingEditPayload`, set `PENDING_EDIT_REVIEW`; live value unchanged until admin approves |

Rationale: Format / process / markets are discovery metadata — a wrong value just mis-files the product in the catalog, fixable instantly. `allergenFreeClaims` is a **public regulatory claim** (dairy-free, gluten-free, …); changing it on a live product must pass admin review, same as other published-edit flows. Only a *changed* allergen-free set triggers review (no-op edits don't bounce a live product into PENDING_EDIT_REVIEW).

Admin side already exists: `approveProductTemplate` applies `pendingEditPayload` to the live row on approval — `allergenFreeClaims` flows through that with no admin change needed. (If the admin approve flow doesn't yet copy `pendingEditPayload.allergenFreeClaims` onto the live column, add that one field to its apply step.)

---

## 5. Acceptance / test

- Ownership guard: non-partner and wrong-service partner both rejected.
- Validation: unknown slugs dropped; arrays deduped; bad format → null.
- Round-trip: set in builder → `loadDraft` returns them → card rehydrates.
- Cross-check: a value set here makes the template appear under that filter on `/marketplace` (e.g. set Format = Powder, then `?format=POWDER` includes it).
- **§4 policy (PUBLISHED template):**
  - Editing Format / process / markets → updates live immediately, status stays PUBLISHED, no review.
  - Editing allergen-free to a **new** set → status → PENDING_EDIT_REVIEW, live `allergenFreeClaims` unchanged, action returns `staged: true`, card toasts "sent for review".
  - Re-saving the **same** allergen-free set → no status change (not staged).
  - After admin `approveProductTemplate`, the staged allergen-free value is live.
- Typecheck `apps/partner` clean. (Migration must be applied + client regenerated on the dev machine first, or the cast-guards carry it.)

---

## 6. Files touched

- `apps/partner/.../products/new/build-actions.ts` — `setMarketplaceAttributes` + `loadDraft`/`InitialDraft` extension.
- `apps/partner/.../products/new/MarketplaceAttributesCard.tsx` — new.
- `apps/partner/.../products/new/BasicsStep.tsx` (+ `GuidedBuilder.tsx` if it threads `initial`) — render the card.
- `packages/audit/src/types.ts` — optional: add `'MARKETPLACE_ATTRIBUTES_SET'` to `AUDIT_ACTIONS`.
- `apps/admin/.../products/actions.ts` `approveProductTemplate` — verify its `pendingEditPayload`-apply step copies `allergenFreeClaims` onto the live column; add that one field if missing (it's the only new field that routes through re-review).

No schema change (done). No marketing change (done). Admin editor already ships; the only possible admin touch is the one-field approve-apply check above.
