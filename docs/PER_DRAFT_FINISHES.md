# Per-draft finishes — spec

Status: PROPOSED · 2026-06-28 · additive, not built
Owner decision needed: §7

## 1. Problem

The Digital Product Passport (and the partner builder generally) has **no structured
finishes** to show for a product. Today the "Packaging & die-lines" section can only
surface `PackagingSystem.material` (a free-text substrate string) because that is the
only finish-adjacent value persisted on a draft. There is no record of *which print
finishes / coatings / decoration methods this product supports.*

This is a real gap, not just a display one: the creator's Design Studio Finishes drawer
currently has to offer **every finish the partner service can do**, with no per-product
narrowing — even when a given carton physically can't take, say, foil.

## 2. Current finish models (what exists)

Three models already exist; none of them is "the finishes this product offers."

| Model | Scope | Meaning |
|---|---|---|
| `FinishType` | platform (admin) | Master catalog of finish kinds — Spot UV, soft-touch lam, foil, emboss, die-cut… Carries `category` (`FinishCategory`), `applicationModes`, `decorationMethod`. |
| `PartnerFinish` | **partner service** | A service's *offering* of a `FinishType`: pricing (`pricingMode`, per-unit/area/object/color), `leadTimeDays`, `moqMin`, `availableModes`, `compatibleSubstrates[]`, `maxCoveragePct`, sample assets, `status`. |
| `DesignFinishApplication` | **creator `designVersionId`** | A creator's *applied* finish on one design version — where (object/colour/region/mask), cached cost. Design-time, not product-time. |

The missing link sits between `PartnerFinish` (capability) and
`DesignFinishApplication` (creator usage): **which of the partner's finishes are
offered on THIS product template.**

## 3. Proposed addition — `ProductTemplateFinish` (join)

One additive join model. The manufacturer declares, in the builder's Packaging step,
which of their service's `PartnerFinish` rows are available for this product; everything
downstream reads it.

```prisma
model ProductTemplateFinish {
  id                String          @id @default(uuid())   // repo convention: uuid, not cuid
  productTemplateId String
  partnerFinishId   String

  // Per-product overrides (all optional — fall back to the PartnerFinish values).
  isDefault         Boolean         @default(false)        // pre-applied/recommended on this product
  isIncludedInPrice Boolean         @default(false)        // bundled (no upcharge) for this product
  sortOrder         Int             @default(0)
  note              String?                                 // partner note shown to the creator

  productTemplate   ProductTemplate @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  partnerFinish     PartnerFinish   @relation(fields: [partnerFinishId], references: [id])

  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@unique([productTemplateId, partnerFinishId])
  @@index([productTemplateId])
  @@index([partnerFinishId])
}
```

Back-relations (additive, no column drops):
- `ProductTemplate.finishes  ProductTemplateFinish[]`
- `PartnerFinish.templateOffers  ProductTemplateFinish[]`

Why a join (not a `String[]` of finish slugs on `ProductTemplate`): finishes are
**partner-service-scoped rows with pricing/lead-time/MOQ**, and we want a real FK +
per-product overrides (`isDefault`, `isIncludedInPrice`, `note`) and clean cascade.
Mirrors the existing `ProductTemplatePackaging` / `TemplateOptionalIngredient` pattern.

## 4. Resolution semantics

- **Allow-list, explicit.** A product offers exactly the `PartnerFinish` rows linked via
  `ProductTemplateFinish`. No links ⇒ no finishes offered (honest empty state), NOT
  "all service finishes."
- **Substrate gating stays at runtime.** The Studio Finishes drawer still filters by the
  chosen substrate using `PartnerFinish.compatibleSubstrates` — this join only sets the
  *menu*, substrate compatibility narrows it.
- **Seeding convenience (optional, §7-D):** on first open of the Packaging step, offer a
  one-click "Add all compatible finishes my service supports" so partners don't start
  from zero.

## 5. Builder UI — Packaging step

Add a **Finishes** card to `PackagingStudioStep` (or the packaging picker), below the
packaging structure:

- Multi-select of the partner service's `PartnerFinish` rows (`status = ACTIVE`),
  grouped by `FinishType.category` (Surface / Foil & metallic / Emboss & texture /
  Cut / Ink / Special).
- Each selected finish shows: name, category chip, pricing summary (e.g. "+$0.08/unit · +2d lead · MOQ 500"), and two toggles — **Recommended** (`isDefault`) and **Included in price** (`isIncludedInPrice`) — plus an optional `note`.
- Autosave through a new `saveDraftFinishes(draftId, rows[])` server action (same FSM /
  audit / autosave pattern as the other packaging save actions; writes an `AuditLog` row).

## 6. Passport surfacing

Replace the current "substrate/material chips only" treatment in the Packaging section
with a real **Finishes** block (label-above-value + chips, dense type scale):

- One chip/row per offered finish: name · category · pricing mode · lead-time delta;
  a small "Recommended" / "Included" pill where set.
- Keep substrate/material as its own line.
- The loader (`getProductReviewDetail`) gains a `finishes: ReviewDetailFinish[]` field,
  populated from `tpl.finishes.include.partnerFinish.include.finishType`
  (cast-guarded until the migration lands, per the file's existing pattern).

## 7. Open decisions (Pavel)

- **A. Pricing display to the partner reviewer** — show finish pricing in the Passport, or
  partner-only (hide from any creator-facing reuse)? (Recommend: show; it's the partner's own view.)
- **B. `isIncludedInPrice` semantics** — does "included" actually zero the upcharge in
  checkout, or is it V1-cosmetic (label only) with real bundling deferred? (Recommend:
  cosmetic in V1; wire to pricing in V1.5.)
- **C. Default application** — should `isDefault` finishes auto-apply as a
  `DesignFinishApplication` when the creator opens the Studio, or just be highlighted as
  "recommended"? (Recommend: highlight only; auto-apply is surprising.)
- **D. Seed-all convenience** (§4) — include the one-click "add all compatible" button in
  V1, or require explicit per-finish selection? (Recommend: include it.)

## 8. Migration & rollout

- **Additive only.** New model + two back-relations. CockroachDB `pnpm db:push` +
  `pnpm db:generate` + `rm -rf apps/*/.next` (stale-client gotcha). No `DROP`.
- **Phasing:**
  1. Schema + `saveDraftFinishes` action + loader field (cast-guarded) — no UI yet.
  2. Builder Packaging-step Finishes card.
  3. Passport Finishes block (swap the placeholder).
  4. Studio Finishes drawer, split into two increments:

     **F3a (built) — Studio drawer DISPLAYS the product's offered finishes.**
     The creator's Design Studio Finishes drawer reads the product's
     `ProductTemplateFinish` allow-list (server-resolved in
     `design/canvas/page.tsx#loadStudioFinishes`, cast-guarded → `[]`
     pre-migration) and renders it read-only: offered finishes grouped by
     `FinishCategory`, each with name, category chip, pricing summary, lead-time,
     and Recommended/Included pills. The drawer's rail icon now actually appears
     (`partnerOffersFinishes = studioFinishes.length > 0`, replacing the
     always-false V1 value). Audit finding that motivated F3a: the drawer was a
     hardcoded placeholder and mounted only behind a flag V1 always passed as
     false, so no creator could ever see it. No mutations — finishes are still
     selected/applied at checkout; the drawer says so.

     **F3b (deferred) — object-level apply + substrate hard-filter.**
     Apply a finish to specific objects/regions in the design, persisting a
     `DesignFinishApplication` per applied finish, plus live cost/lead-time
     impact and per-finish notes for the printer. Also hard-filter the offered
     list by substrate compatibility (`PartnerFinish.compatibleSubstrates`).
     Both are blocked today because substrate isn't selected in the Studio yet —
     `compatibleSubstrates` is carried through to the drawer but stays inert
     until a substrate selection exists to filter against.
- **No-regret:** even before any Studio change, steps 1–3 make the Passport and
  builder truthful; F3a makes the Studio truthful too; F3b (apply + substrate
  filter) is a clean follow-up.

## 9. Touch list

- `packages/db/prisma/schema.prisma` — `ProductTemplateFinish` + back-relations.
- `apps/partner/.../products/new/build-actions.ts` (or a new `packaging-finishes-actions.ts`) — `saveDraftFinishes`.
- `apps/partner/.../products/new/PackagingStudioStep.tsx` — Finishes card.
- `apps/partner/.../products/new/review-actions.ts` — `finishes` on `ReviewDetail` + loader.
- `apps/partner/.../products/new/ReviewSummary.tsx` — Passport Finishes block.
- `apps/creator/.../design/canvas/page.tsx` — `loadStudioFinishes` + `StudioFinish` type + `partnerOffersFinishes` (F3a).
- `apps/creator/.../design/canvas/CanvasLayoutShell.tsx` — thread the `finishes` prop to the drawer (F3a).
- `apps/creator/.../design/canvas/drawers/FinishesDrawer.tsx` — display the template allow-list (F3a); object-apply + substrate filter (F3b).
