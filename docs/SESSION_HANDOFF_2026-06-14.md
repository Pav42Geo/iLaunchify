# Session handoff — 2026-06-14

Everything shipped this session, the pending Mac steps, and the open decisions. All code
typechecks clean (creator / partner / admin / marketing + db / ui / orders / nutrition / audit).

---

## 1. Shipped — Labels (creator-facing, regulated)

- **Drug Facts SVG renderer** (`DrugFactsSvg`, 21 CFR 201.66) in `@ilaunchify/ui` — the 5th
  print-grade, CSS-immune renderer. Verified via SSR.
- **Creator label download** — Builder+ gated (`label_file_download` plan feature, Maker
  excluded), in the Design-Studio 3-line menu + product-card kebab. Recomputes every label
  (one per flavor) → print-to-PDF.
- **All built domains** — `computeProductLabel` is a domain union: FOOD recompute-from-recipe +
  Supplement / Cosmetic / Pet from the template formulation. Cosmetic INCI + pet AAFCO assembly
  extracted to `@ilaunchify/nutrition/domain-labels` (single source; partner `inci.ts`/`pet.ts`
  are now re-export shims). OTC excluded (off). All 3 non-food renderers verified via SSR.

## 2. Shipped — Admin domain on/off

- `DomainSetting` model + `@ilaunchify/db` `getDomainSettings` / `getEnabledDomains` /
  `isDomainEnabled` (defaulted, **OTC off**). Admin **Settings → Product Domains** toggle page
  (audited). Partner builder filters the Step-1 domain picker + server-enforces in
  `setDraftLabelingType`.

## 3. Shipped — Partner builder

- **Step 4 Packaging Studio** — full-screen 3D studio (three.js via CDN, no npm dep): orbit,
  3D↔die-line fold, click a surface → open the real Die-line Studio. Flow Next button matches the
  other steps. `cdn.jsdelivr.net` allowlisted in the shared CSP.
- **#38 lock product type after recipe** — `hasRecipeRows` guard drives a monotonic lock on the
  Step-2 type chooser.

## 4. Shipped — Order orchestration / routing (the big thread)

Plan: `docs/ROUTING_BINDING_MODEL.md`. Core principle: **owner-product model** — manufacturing is
pinned to the product's owner; only commodity legs route.

- **Owner-pinned manufacturing** — `findRouting` reads `ProductTemplate.manufacturerServiceId`;
  pins to that owner (health-check active+payouts+MOQ); null-owner legacy products keep
  category-match (D2). Fixes routing an order to a maker who never built the product.
- **Print leg = the chosen offering** — resolves from `PackagingComponent.partnerOfferingId`
  (capability-matched at config time), else owner-preferred die-cut match, else **owner
  self-labels** (so non-food domains + new-builder food never strand on NO_PRINT_PROVIDER).
- **Cold-start escalation** — timed-out dispatches escalate the order to ON_HOLD + audit;
  `excludeServiceIds` lets a reroute skip already-tried partners.
- **Delay-accept (§7)** — maker counter-offers a later date; creator approves (proceeds) or
  declines (cancel+refund). Schema + both actions + both UIs + auto-cancel guard.
- **Quantity-tiered lead time (§9)** — the quote reads the band-matched `leadTimeDays`, so
  500 ≠ 50,000.
- **Multi-component dispatch — Phases 1 + 2a + 2b + 3 ALL SHIPPED**
  (`docs/MULTI_COMPONENT_DISPATCH.md`). `createDispatches` decomposes an order into one dispatch per
  real production leg:
  - **P1** — one PRODUCT + one LABEL dispatch **per distinct decorated-component provider**
    (collapsed by service, even cost split, deduped notifications).
  - **2a** — `generateOrderManifest` scopes a `components[]` block to each dispatch, so a printer
    sees exactly the components they print.
  - **2b** — `DispatchType += COPACKING`: a CARTON/SHIPPER component spawns an assembly dispatch
    to the chosen co-packer, else the manufacturer self-assembles (7% cost slice).
  - **3** — loops **every** `order.items` row (was `items[0]`), stamping each dispatch with the new
    `OrderDispatch.orderItemId`; any unroutable item → whole order ON_HOLD (no half-baskets).
  - Simple single-component, single-item orders keep the **exact** original 2-dispatch behavior.
- **Cross-domain/type audit** — confirmed the flow across all 5 domains + all packing profiles;
  fixed the universal print-leg strand; documented the by-design behaviors + V1 limits.

---

## 5. PENDING on Pavel's Mac — consolidated migration + regenerate checklist

Every schema change this session is **additive** (new nullable columns, new models, new index, a new
enum value, new relations) — no drops, no required columns, no data backfill. `prisma db push`
diffs the **whole** schema in one shot, so a **single push applies all of them at once**. Run this
top-to-bottom; don't skip the cache clear (the 3-layer stale-client trap from CLAUDE.md).

### 5.1 What's pending in the schema (the diff `push` will apply)

| # | Change | Model / field | Shipped in | Safe? |
|---|--------|---------------|------------|-------|
| 1 | New model | `DomainSetting` (domain `@id`, enabled `Boolean @default(true)`, updatedAt) | Admin domain on/off | additive model |
| 2 | 3 new columns | `OrderDispatch.proposedDeadlineAt?` / `delayReason?` / `delayProposedAt?` | Delay-accept (§7) | nullable |
| 3 | New enum value | `DispatchType += COPACKING` (was PRODUCT \| LABEL) | Multi-component **2b** | additive enum |
| 4 | New column + index + relation | `OrderDispatch.orderItemId?` + `@@index([orderItemId])` + `OrderItem.dispatches` back-relation | Multi-component **3** | nullable FK |
| 5 | New column | `OrderSettings.changeoverDays` (Int `@default(1)`) | D5 multi-flavor lead time | additive, defaulted |
| 6 | New model + relations | `OrderItemFlavor` + `OrderItem.flavors` + `FlavorPreset.orderItemFlavors` | Variety-pack builder Slice 1 | additive model |
| 7 | New column | `ProductTemplate.marketingDetail` (Json?) | Marketplace V1.1 detail copy | additive, nullable |

> **Run order note:** apply this `db push` BEFORE re-running `seed:variety-demo` — the seed now
> writes `ProductTemplate.marketingDetail` + sets `status: PUBLISHED` directly (not cast-guarded).

All code that reads #2/#3/#4 is **cast-guarded** so it compiled before the push. After `generate`
the generated client will type them natively — the casts keep working (they're widening, not lying),
so nothing breaks; cleaning them up later is optional cosmetic debt.

### 5.2 Run this (from repo root, in order)

```bash
# 0. Pre-flight — make sure the legacy FOD container isn't squatting a port (CLAUDE.md gotcha #1)
docker ps | grep frontend     # if present and you hit :3000 weirdness later, stop it

# 1. Apply ALL pending schema changes (rows 1–4 above) in a single diff
pnpm --filter @ilaunchify/db push

# 2. Seed the new DomainSetting rows (forces OTC off; idempotent)
pnpm --filter @ilaunchify/db seed:domain-settings

# 3. Regenerate the Prisma client — REQUIRED after any push
pnpm --filter @ilaunchify/db generate

# 4. Clear the 3rd stale-client layer: the .next webpack cache bundles the old client
#    (because @ilaunchify/db is in transpilePackages). Skipping this = phantom
#    "Unknown field orderItemId" / "prisma.domainSetting is undefined" at runtime.
rm -rf apps/*/.next

# 5. Restart dev (kill -9 any lingering next dev first if hot-reload held the old client)
pnpm dev
```

### 5.3 Verify after regenerate

```bash
pnpm typecheck                              # whole workspace — should stay 0 errors
pnpm --filter @ilaunchify/orders test       # vitest CAN'T run in the linux sandbox (rollup
                                            # native-binary mismatch) — run it here on the Mac
```
- **Manual smoke (recommended):** one checkout per domain (FOOD / Supplement / Cosmetic / Pet),
  plus **one multi-SKU basket** (≥2 different products) to exercise Phase 3 — confirm you get one
  PRODUCT dispatch per item, the right LABEL/COPACKING legs, and each partner's manifest shows the
  correct item's product + components.
- Confirm the **Send feedback** mailto in the Studio menu (currently `ilaunchify@gmail.com`).

### 5.4 Rollback note

Because every change is additive and nullable, rolling back code does **not** require a down-migration
— the new columns/model/enum value simply go unused. No production data depends on them yet.

## 6. OPEN decisions (routing)

- **D2** null-owner fallback (taken as category-match default). **D4** confirm generic-BOM = V2.
- **D5 multi-flavor lead time — DECIDED + SHIPPED 2026-06-14.** Pavel picked `max + (N−1) ×
  changeoverDays`. Built: `OrderSettings.changeoverDays` (default 1, admin Routing form), pure
  `applyFlavorChangeover` in `apps/marketing/src/lib/pricing.ts`, and `getPricingTierRows({
  flavorCount, changeoverDays })` (default N=1 = no-op). **Remaining seam:** the variety-pack
  builder must pass the live distinct-flavor count into `getPricingTierRows` — the single-flavor
  configurator is N=1, so the increment is dormant until the pack-builder wires it.
- **Partial-basket policy — DECIDED 2026-06-14: all-or-nothing now, defer the rest.** Keep the
  current whole-order ON_HOLD on any unroutable item. When a real multi-SKU cart is built, add a
  **pre-payment routability check** at checkout (so unroutable baskets never get paid). Defer true
  partial-fulfillment + partial-refund until there's real multi-SKU volume. (V1 checkout is
  single-product — `orderItem.create` once — so this is a non-issue today.)
- **C1–C3** locked as recommended; multi-component **Phases 1–3 are all shipped** (see §4).
- **Variety-pack builder — Slice 1 SHIPPED 2026-06-14.** Creator picks N≤`maxFlavorsPerPack`
  distinct flavors and splits the order quantity across them (capacity = order qty, so no new
  partner data). Shared pure engine `@ilaunchify/ui/lib/pack-composition` (`validatePackSelection`
  / `evenSplit` / `applyFlavorChangeover`); shared `PackBuilder` component. Renders in BOTH the
  marketing product detail (live D5 quote) and the creator checkout Step 2 (gated on
  `packingProfile.flavorMode === 'MULTI'`). Persists normalized `OrderItemFlavor` rows at checkout
  (validated pre-payment), and the production manifest surfaces the per-flavor splits to the
  manufacturer.
  - **Slice 2a — adjust/resubmit carry-over SHIPPED 2026-06-14.** `buildAdjustmentDraft` seeds the
    wizard's flavors from the order's `OrderItemFlavor` rows; `applyOrderAdjustment` detects a
    flavor change, adds a `flavors` impact (PRODUCT+LABEL re-review), and replaces the rows from the
    adjusted selection (re-snapshotting name + SoI). All cast-guarded.
  - **Slice 2b — live multi-column label preview SHIPPED 2026-06-14.** The per-flavor recompute
    already existed (`computeProductLabel` builds one FOOD label per flavor via `buildFoodLabel`), so
    this exposed it: `getVarietyPreviewColumns(productId)` (ungated preview, ownership-scoped,
    FOOD-only, reuses `buildFoodLabel` so the preview matches the printed label) returns per-flavor
    `{flavorPresetId, label, panel, contains}`. `PackBuilder` gained an optional `previewColumns`
    prop and renders `<VarietyFactsSvg>` below the picker, filtered to the chosen flavors in pick
    order; the creator checkout `ProductionStep` fetches + passes them, marketing omits them
    (pre-auth). **Follow-ups:** marketing (public) preview by slug; cache the columns as a product
    asset to avoid recomputing each checkout; supplement multi-flavor preview (FOOD-only today).
- **Recovery Mode (§10)** — broadcast-to-alternate-manufacturers — DEFERRED to a dedicated
  discussion (recipe IP, FDA label-as-legal-artifact, re-quote, system-vs-creator pick).

## 7. Verification posture

Everything is typecheck- and code-review-verified; the regulated SVG renderers were SSR-rendered
and asserted. NOT exercised through a live checkout (the 4 apps + DB + Stripe aren't running in
the sandbox). Recommended before relying on it: run the Mac migrations above, then a manual
checkout pass for one product per domain.

**Orchestration hardening (2026-06-14).** The risky decision logic in `@ilaunchify/orders` was
extracted into pure, dependency-free cores and unit-tested, so `createDispatches` /
`recomputeAggregateApprovalStatus` are now thin I/O shells over tested logic:
- `dispatch-planner.ts` (`deriveItemDispatch`, `isLive`, `estimateDispatchCosts`) +
  `dispatch-planner.test.ts` — print-leg collapse, co-pack/self-assembly, cost split, all branches.
- `aggregate-approval.ts` (`computeAggregateStatus`) + `aggregate-approval.test.ts` — the
  ships-together rollup incl. rerouted/failure-terminal exclusion + multi-SKU baskets.
- `auto-cancel.ts` (`isOrderStale`) + `auto-cancel.test.ts` — the stale-unpaid-order window.
- `manifest.ts` (`scopeDispatchComponents`) + `manifest-scope.test.ts` — the per-partner
  component scoping (each printer/assembler sees only their components + self-do fallback).

These run with the existing `scoring` / `fsm` / `transfer-planner` suites under
`pnpm --filter @ilaunchify/orders test` (§5.3). All assertions were additionally runtime-verified
in the sandbox via a TS-transpile harness (54 total: 26 planner + 15 aggregate + 6 stale-order + 7
manifest-scope) since vitest itself can't run here. Every pure decision in the multi-component /
multi-SKU path is now covered; the remaining untested surface is the I/O shells' transaction wiring
+ manifest stamping — that's what the multi-SKU smoke test in §5.3 exercises.

## 8. Marketplace DB-wiring + §7 filters (2026-06-18)

### 8.1 Additive migration (ONE `prisma db push` covers all rows below)

Run on the Mac (NOT in the Cowork sandbox — no Prisma engines / no DB there):

```bash
pnpm --filter @ilaunchify/db prisma db push        # additive, no data loss
pnpm --filter @ilaunchify/db prisma generate        # regen client (NEW fields/enum)
rm -rf apps/*/.next                                  # transpilePackages bundles the client
pnpm --filter @ilaunchify/db prisma db seed          # seed-filter-dimensions runs in main seed
```

New schema (all additive, Cockroach-safe — no `@db.Text`, String[] + enum only):

| # | Change | Model | Notes |
|---|--------|-------|-------|
| 8a | `marketingDetail Json?` | ProductTemplate | marketplace detail copy (V1.1, already in §1 if present) |
| 8b | `enum ManufacturingFormat` | — | 18 values (powder…spray) |
| 8c | `manufacturingFormat ManufacturingFormat?` | ProductTemplate | Format filter (single) |
| 8d | `manufacturingProcesses String[]` | ProductTemplate | Process filter (hasSome) |
| 8e | `allergenFreeClaims String[]` | ProductTemplate | Allergen-free filter (explicit CLAIM, not inferred) |
| 8f | `marketCodes String[] @default(["US"])` | ProductTemplate | Market filter; default backfills existing rows to US |

`seed-filter-dimensions.ts` (wired into `seed.ts` after `seedStarterTemplates`) sets a demo
`manufacturingFormat` + one process per template by domain; `marketCodes` comes from the column
default; `allergenFreeClaims` left empty (a regulatory claim — set per-product when real).

### 8.2 What shipped (all marketing-app + db; typecheck clean: marketing 0, db 0)

- **Marketplace is DB-driven** — listing + detail read PUBLISHED ProductTemplates; fixture is the
  empty-DB fallback only. `marketingDetail` carries detail copy (admin editor on
  `/admin/products/[id]`). Recipe-derived **ingredients + Nutrition Facts** computed from
  `ingredientSlots` via `@ilaunchify/nutrition` (FOOD); **add-ons** from `optionalIngredients`.
- **§7 filter system** (`docs/MARKETPLACE_DESIGN.md §7`), full set wired end-to-end:
  - Default 6: **Format** (manufacturingFormat), **Diet** / **Audience** (LifestyleTag groups),
    **MOQ** (variant.moqMin), **Lead time** (variant.leadTimeDays buckets), **Market** (marketCodes).
  - More-filters: **Trend** (LifestyleTag TREND), **Certifications** (ProductCertificate →
    VERIFIED instance → CertificateType.slug, market-scoped), **Allergen-free** (allergenFreeClaims),
    **Manufacturing process** (manufacturingProcesses), **Packaging type** (parent
    ContainerCategory → child PackagingType.slug).
  - Query in `apps/marketing/src/lib/templates.ts` `buildWhere` (OR within a group, AND across).
    Option loaders in `filter-options.ts` (server) + constants in `filter-constants.ts` (client).
  - Sidebar `MarketplaceFilters.tsx` rebuilt (foldable, DB-driven); `ActiveFilterChips` covers every
    param; the separate horizontal `LifestyleTagFilters` rail was RETIRED (moved into the sidebar).
- **Verification:** typecheck-only in the sandbox (Prisma engines can't be fetched here, so
  `prisma validate`/`generate` and any live query were NOT run). After the migration above, smoke
  test: select each filter on `/marketplace` and confirm the grid + active chips + URL params.
