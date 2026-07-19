# Checkout lock + PDP completeness (#22) — implementation spec

**Status:** planned, 2026-07-18. Slice 1 foundation started (offerings loader). UI slices unbuilt.
**Decision owner:** Pavel. **Locked decision:** quantity stays EDITABLE at checkout (see §Decisions).

## The problem (Pavel, 2026-07-17)

> "We should not be able to pick containers at [checkout], they should be picked on
> the detailed page." + "neither flavors! They should be locked here."

His flow: **detail page** (flavors, packaging/container, MOQ) → **Studio** (die-lines +
label stock/packaging material, built as F3b) → **checkout** (review + pay).

Checkout today re-opens decisions that should be settled upstream. Worse, the PDP's
packaging picker is FIXTURE data, and the real container is never captured, so
checkout's `ComponentsPanel` is the ONLY place a real container gets chosen —
backwards from the intent.

## Current state — where each decision is made, and what checkout wrongly re-opens

| Decision | Detail page (PDP) | Studio | Checkout re-editable? |
|---|---|---|---|
| Flavors + pack split | captured (`selectedFlavorPresetIds` + pack slots) | — | YES — variety-pack builder in Step 2 |
| Quantity | captured (passed to launch → CheckoutDraft) | — | YES (intended, see Decisions) |
| Container (PRIMARY) | FIXTURE list only; real `partnerOfferingId` hardcoded `null` | — | YES — `ComponentsPanel` |
| Label stock + packaging material | — | YES (F3b, `MaterialDrawer`) | read-only readout |
| Die-lines | — | YES | — |

## The model (learned 2026-07-18, do not re-derive)

- A product's physical parts are **`PackagingComponent`** rows (PRIMARY CONTAINER,
  CARTON, ...). The PRIMARY container is the "container" the creator picks.
- Each `PackagingComponent` is materialised from a **`PartnerPackagingOffering`**
  (which partner produces that `packagingType` + decoration method + dieline).
  Real offerings ARE seeded per template (`seed-packaging-offerings-fixtures.ts`,
  run by the main seed): it backfills `ProductTemplateVariant.packagingTypeId` and
  upserts a `PartnerPackagingOffering` per mapped `packagingType`.
- `launch-actions.ts:~241` ALREADY materialises ONE PRIMARY CONTAINER
  `PackagingComponent` from `input.partnerOfferingId` — but `ProductDetailConfigurator`
  passes `partnerOfferingId={null}`, so nothing is created at launch.
- The PDP's `PackagingPicker` shows `detail.packaging` (fixture / seeded
  `marketingDetail` JSON), NOT the real offerings. Its fake price delta was already
  stripped (task #24); the fake OPTIONS remain.
- Checkout `ComponentsPanel` edits DECORATION variants per component slot AND lets
  the creator swap/remove the PRIMARY component — that is the "picking containers at
  checkout" Pavel objected to.

## THE REFRAME: this is a PDP-completeness project, not a checkout cleanup

Checkout can only go read-only once EVERY upstream surface captures a COMPLETE,
valid selection. Two concrete gaps prove it:

1. The PDP lets a creator launch with "0 flavors in a 4-pack" (Pavel's screenshot).
   Locking the split at checkout REQUIRES the PDP to enforce a full pack before
   launch.
2. The container is never captured, so there is nothing for checkout to lock TO.

## Decisions

- **Quantity stays EDITABLE at checkout** (Pavel 2026-07-18). The detail-page
  quantity is a price preview; checkout keeps ONE editable control (quantity), and
  it drives the tier band. Flavors + container LOCK; quantity does not.
- **No invented anything** (the running rule): the container picker shows REAL
  `PartnerPackagingOffering` rows, never a fixture. A template with no ACTIVE
  offering for its packaging type has no container to pick — surface that as
  absence, do not fabricate (same shape as the no-price gate, task #18).

## Slices (in dependency order)

### Slice 1 — Container capture on the PDP (FOUNDATION)
- **1a (done here):** `getTemplateContainerOfferings(slug)` — load ACTIVE
  `PartnerPackagingOffering` rows for the template's `packagingType`, shaped for a
  picker. Pure server read, tsc-verified. Zero UI risk.
- **1b:** PDP container picker reads 1a instead of the fixture; captures the chosen
  `offeringId`.
- **1c:** `LaunchCtaCluster` passes the real `partnerOfferingId` (stop hardcoding
  null). launch-actions already materialises it.
- **Verify:** place an order; confirm a PRIMARY `PackagingComponent` exists on the
  product with the chosen offering. (A `verify-order-container` read script.)

### Slice 2 — PDP completeness gates
- The variety-pack builder must ENFORCE a full pack (all units allocated, min
  flavors met) before the launch CTA enables. No "0 flavors" launches.
- The container pick is required before launch (or defaults to the sole offering
  when only one exists).

### Slice 3 — Lock the checkout
- Step 2 renders flavors + split + container as a READ-ONLY summary with an
  "Adjust on the product page" affordance. Quantity stays editable.
- Remove the variety-pack builder + `ComponentsPanel` editors from checkout; retire
  the dead code or move any still-needed editing to the Studio/PDP.

## Testing constraint (important for whoever builds the UI)

The marketing PDP is heavy and the Studio canvas never reaches `document_idle`;
browser-automation read/click tools time out or freeze on them. UI slices must be
verified by a human clicking, plus a DB read script (`verify-order-container`) that
confirms the captured `PackagingComponent`. Do not assume a UI change works because
it compiled.
