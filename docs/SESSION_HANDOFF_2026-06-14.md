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
- **Multi-component dispatch Phase 1** (`docs/MULTI_COMPONENT_DISPATCH.md`) — `createDispatches`
  emits one PRODUCT + one LABEL dispatch **per distinct decorated-component provider** (collapsed
  by service, even cost split, deduped notifications, exact back-compat for simple products).
- **Cross-domain/type audit** — confirmed the flow across all 5 domains + all packing profiles;
  fixed the universal print-leg strand; documented the by-design behaviors + V1 limits.

---

## 5. PENDING on Pavel's Mac (all additive; sandbox can't run prisma/seed)

```
# DomainSetting (admin domain on/off)
pnpm --filter @ilaunchify/db push
pnpm --filter @ilaunchify/db seed:domain-settings
# Delay-accept (3 new OrderDispatch columns: proposedDeadlineAt / delayReason / delayProposedAt)
pnpm --filter @ilaunchify/db push
# then regenerate + clear caches
pnpm --filter @ilaunchify/db generate && rm -rf apps/*/.next
```
- Confirm the **Send feedback** mailto in the Studio menu (currently `ilaunchify@gmail.com`).
- Run the orders test suite on Mac: `pnpm --filter @ilaunchify/orders test` (vitest can't run in
  the linux sandbox — rollup native-binary mismatch).

## 6. OPEN decisions (routing)

- **D2** null-owner fallback (taken as category-match default). **D4** confirm generic-BOM = V2.
- **D5** multi-flavor lead time — sequential vs parallel (no schema yet).
- **C1–C3** locked as recommended for multi-component Phase 1. **Phase 2** = per-component
  manifest scoping (needs persisting the dispatch↔component map) + co-pack/assembly dispatch.
  **Phase 3** = multi-SKU orders (`order.items` > 1).
- **Recovery Mode (§10)** — broadcast-to-alternate-manufacturers — DEFERRED to a dedicated
  discussion (recipe IP, FDA label-as-legal-artifact, re-quote, system-vs-creator pick).

## 7. Verification posture

Everything is typecheck- and code-review-verified; the regulated SVG renderers were SSR-rendered
and asserted. NOT exercised through a live checkout (the 4 apps + DB + Stripe aren't running in
the sandbox). Recommended before relying on it: run the Mac migrations above, then a manual
checkout pass for one product per domain.
