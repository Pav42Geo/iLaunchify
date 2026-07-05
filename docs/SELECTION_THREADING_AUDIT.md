# Creator-selection threading audit — PDP → Design Studio → Checkout

**Date:** 2026-07-04. Question (Pavel): *the creator's choices on the product detail page (e.g. only
2 of 6 flavors) must flow through the Design Studio and Checkout — the Studio should show ONLY what
he selected, and that choice must reach checkout.* This audits whether that's actually wired.

## Headline

**It is NOT fully wired.** The selection threads **PDP → CheckoutDraft → Order**, but it is **dropped
on the Studio path**. The `Product` row stores **no selected subset**; both the **Design Studio** and
the **checkout matrix** independently re-read the **FULL `productTemplate.flavorPresets` pool**. A
creator who picks 2 of 6 flavors on the detail page still sees **all 6** in the Studio and can design
labels for flavors he never chose. The template pool — not the creator's choice — is the source of
truth everywhere except the CheckoutDraft/Order snapshot.

This also **reverses an assumption** in `docs/HANDOFF-TO-CODE-per-flavor-labels.md` ("design the
flavor POOL, not the order-time pack picks"). Per Pavel, the creator designs only his **selected**
flavors — so the Studio must scope to the selection, not the pool.

## Where the selection lives (and doesn't)

| Stage | Reads / writes | Selected subset? |
|---|---|---|
| **PDP configurator** `apps/marketing/.../ProductDetailConfigurator.tsx` | selection held in local `packValue` state (`:218`), handed to `LaunchCtaCluster` (`:788`) | in-memory only |
| **Launch action** `apps/marketing/src/lib/launch-actions.ts` | writes `CheckoutDraft.state.production.{pack,flavors}` (`:262`, `:459`); creates `Product` with only `productTemplateId` + first variant (`:184`, `:140`) | **subset → CheckoutDraft only** |
| **Product row** `schema.prisma model Product` (`:1493`) | `productTemplateId`, `variantId`, `recipe`, … | **no subset field at all** |
| **Design Studio loader** `apps/creator/.../design/canvas/page.tsx` | `flavorPresets: { orderBy: sortOrder }` = **full pool** (`:274`); `flavors = flavorPresets.map(...)` (`:288`); never reads CheckoutDraft | **FULL POOL (bug)** |
| **Checkout pack matrix** `apps/creator/.../checkout/production-actions.ts` | `pool` = all ACTIVE presets (`:257`, `:278`) | full pool; PDP pack only **pre-fills** (`ProductionStep.tsx:235`) |
| **Order** `apps/creator/.../checkout/cart-actions.ts` | writes `OrderItemFlavor` per selected flavor (`:557`) + pack snapshot on `OrderItem` (`:543`) | **subset → order ✓** |

## The four breaks

1. **`Product` has no subset field.** Selection is written only to `CheckoutDraft.state.production.pack`
   (`launch-actions.ts:262`), never onto the Product.
2. **Studio never reads the draft.** `design/canvas/page.tsx` loads the full pool (`:274`, `:288`) and
   does not query `CheckoutDraft`. → Studio shows all flavors, not the selected subset.
3. **Checkout re-reads the full pool.** `getVarietyPackMatrix` pool = all ACTIVE presets
   (`production-actions.ts:257`); the PDP pack is a *default*, not a *constraint* — the creator can
   re-pick freely.
4. **Single-flavor / size / packaging PDP picks are lost for authed users.** Only `quantity` and (multi)
   `pack` reach the draft (`launch-actions.ts:252`); `flavorId`/`sizeKey`/`packagingId` are dropped
   (kept only as guest signup query params, `:85`). The code self-documents this as pending ("Real
   flavor/size/packaging pickers will pass through here once R3 ships", `launch-actions.ts:7`).

## Why it matters

- **Mislabeling risk** (the reason we started this): if the Studio shows all 6 flavors, the creator can
  author/misplace labels for flavors that aren't in his pack. Scoping the Studio to the selection is the
  *structural* half of the "Bind" safety strategy (`docs/PER_FLAVOR_LABEL_SAFETY_UX.md`).
- **Broken promise**: "the creator's choice threads through the whole process." Today it doesn't reach
  the Studio, and checkout treats it as a suggestion.

## Status — fix BUILT 2026-07-04 (Cowork), pending `db:push`

The threading fix below is implemented, cast-guarded so it compiles before the migration:
- **Schema:** `Product.selectedFlavorPresetIds String[] @default([])` (additive).
- **Launch** (`launch-actions.ts`): writes the PDP pack's flavor ids onto the Product at create.
- **Studio loader** (`design/canvas/page.tsx`): scopes `flavorPresets` to `selectedFlavorPresetIds`
  (falls back to full pool when empty).
- **Checkout** (`production-actions.ts`): both `getPackBuilderConfig` and `getVarietyPackMatrix` pools
  are constrained to the subset.

**Pavel must run** (stale-client 3-layer gotcha): `pnpm db:push` → `pnpm db:generate` →
`rm -rf apps/*/.next` → restart dev. After that, drop the `as unknown as …` cast-guards on the new
field. Then the Studio + checkout show ONLY the creator's selected flavors.

## Recommended fix (no-regret) — Code's zone

Give the selection **one persistent home on the `Product`** and make it authoritative:

1. **Schema (additive):** persist the creator's selection on the Product — e.g.
   `Product.selectedFlavorPresetIds String[]` (+ the chosen pack size / variant), or a
   `ProductFlavorSelection` join. Written at launch. *(Also finally persist single-flavor/size/packaging
   picks — break #4.)*
2. **Launch action** (`launch-actions.ts`): write the PDP selection onto the Product (not just the draft).
3. **Studio loader** (`design/canvas/page.tsx`): resolve `flavors` = **the Product's selected subset**
   (fall back to full pool only when no selection recorded, for legacy rows). This is the one-line-ish
   change that fixes break #2 and feeds Cowork's `FlavorSwitcher`/completeness gate the correct set.
4. **Checkout** (`production-actions.ts`): **constrain** the matrix pool to the selected subset (not just
   pre-fill) so the order can't drift from the design.
5. Apply the same principle to every other selectable dimension (options/finishes/packaging) — selection
   constrains, template only offers.

Phasing: (1)+(2)+(3) first — that alone makes the Studio show only the selected flavors and unblocks the
per-flavor safety work. (4) closes the checkout drift. All additive; no destructive migration.

## Cowork ⇄ Code split for this

- **Code** (hot files): the schema field + `launch-actions` + Studio loader + checkout constraint above.
- **Cowork** (done / ready): the per-flavor safety components consume `flavors` = **the selected subset**
  the loader passes — `FlavorSwitcher.tsx`, `flavorCompleteness.ts`, `flavorMismatch.ts` are all subset-
  agnostic (they render/validate whatever selected set they're given), so they're already correct once
  the loader scopes to the selection.

## Seeding a full test product — see `packages/db/prisma/seed-product-full.ts`
Populates `cmr777pjk0001dmtadu9kair7` with FlavorPresets, pricing tiers, a variant (container/die-cut/
packaging), a Recipe with ingredients, and a CheckoutDraft carrying a **2-of-N selected subset**, so the
end-to-end test can prove the subset threading once the fix lands. Run on the Mac (DB access): see that
file's header.
