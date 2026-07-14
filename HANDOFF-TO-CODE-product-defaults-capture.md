# HANDOFF → Code: "Save as my defaults" capture in the New-Product builder

**Date:** 2026-07-13 · **Decided by:** Pavel · **Zone:** partner New-Product builder
(`apps/partner/src/app/(dashboard)/products/new/*`) — Code's hot zone, single-writer.
Cowork will NOT touch these files.

## Decision

The standalone `/settings/product-defaults` page is RETIRED (redirects to
`/services#product-defaults`). The prefill **mechanism stays** — Pavel's call:
defaults should be *captured in context* while building a product, not authored
up-front on an abstract settings page.

Already done on Cowork's side (committed):

- `/services` gained a "Product defaults" accordion card (producers only,
  `id="product-defaults"`) rendering the existing `ProductDefaultsForm`.
- `apps/partner/src/app/(dashboard)/settings/product-defaults/actions.ts` and
  `ProductDefaultsForm.tsx` are UNCHANGED and stay where they are —
  `products/new/build-actions.ts` already imports `getPartnerProductDefaults`
  for the prefill; the services card imports both.
- Settings rail entry removed; hub card now points at `/services#product-defaults`.

## What Code builds

In the builder step that collects run facts (lead times, MOQ, order increment,
monthly capacity, facility, fulfillment/storage) add ONE opt-in control:

> ☐ Save these as my defaults for future products

- Render it only when the entered values DIFFER from the partner's current
  `PartnerProductDefaults` row (or none exists) — no dead checkbox.
- On submit, when checked: call `savePartnerProductDefaults` (existing action in
  `settings/product-defaults/actions.ts` — it validates facility ownership and
  upserts by `partnerId`) with the run-fact fields from the draft, and keep
  `applyToNewProducts: true` (or the row's current value if one exists).
- Do NOT write a second copy of the mapping — reuse `ProductDefaultsInput`.
- Toast on success: "Saved — new products will start from these values.
  Edit anytime under Services → Product defaults."

## Guardrails

- No new fee/em dash/audit paths involved; `savePartnerProductDefaults` already
  exists and is the single writer for the row.
- Don't gate the stepper on any of this (Add-Product required-fields convo is
  still deferred — see memory `ilaunchify-add-product-required-fields`).
- `PartnerProductDefaults.applyToNewProducts=false` must keep meaning "seed
  nothing" in `createDraftShell` — the checkbox never flips it off.
