# Add Product — V1 Slice: Presets / Inheritance + Net-Content / COO / Ti-Hi (+ Clone)

**Prepared:** 2026-06-27 · Implements the V1 slice from `docs/MANUFACTURER_WORKFLOW_AND_ADD_PRODUCT_RESEARCH.md` §7.
**Thesis:** cut *re-entry*, not add manual inputs. New products inherit manufacturer-level defaults; the team fills only deltas. All schema changes are **additive + CockroachDB-safe** (`uuid()`/`cuid()` ids, no `@db.Text`, optional columns), applied via `pnpm db:push` (this repo uses push, not migrate).

---

## Status — SHIPPED 2026-06-27 (uncommitted; one `db:push` gates activation)

The whole slice is built and verified (partner `tsc` 0 errors + `check:colors` clean on every PR). New-model / new-column code is **cast-guarded** (`prisma as unknown as {…}`), so it compiles before the client is regenerated and "lights up" after the push. Run once on the Mac (sandbox can't reach CockroachDB):

```bash
pnpm db:push && pnpm db:generate && rm -rf apps/*/.next   # then restart next dev
```

| PR | What shipped | Key files |
|----|--------------|-----------|
| **PR-1** | The four additive schema blocks (§1) | `packages/db/prisma/schema.prisma` |
| **PR-2** | `PartnerProductDefaults` get/save actions, **Settings → Product defaults** page + form, settings-hub card, **template-level** seeding (COO, lead times, storage) in `createDraftShell` | `settings/product-defaults/{actions,ProductDefaultsForm,page}.tsx`, `settings/page.tsx`, `products/new/build-actions.ts` |
| **PR-2b** | **Variant-level** pre-fill: `createDraftShell` seeds a default variant (MOQ/max/increment/capacity/fulfillment/lot/facility) **best-effort** (a stale facility FK can't fail the draft) so step 2 opens pre-filled | `products/new/build-actions.ts` |
| **PR-3a** | Country of origin threaded through `BasicsPatch`/`updateBasics`/`loadDraft`/`InitialDraft` + a dropdown in Basics → Product identity (prefilled from defaults) | `build-actions.ts`, `BasicsScreen.tsx` |
| **PR-3b** | Net content (value + unit) on `ProductionInput`/`saveProduction`, round-tripped via `loadDraft` (Decimal→number), + fields in the Variants production block | `build-actions.ts`, `VariantsPacksStep.tsx` |
| **PR-3c** | Ti-Hi + gross weight authored on the **packaging catalog** (`PackagingForm` + `actions` + edit-page seeding), and shown **read-only inherited** on the builder's packaging-step cards | `packaging/{PackagingForm,actions}.tsx`, `packaging/[id]/page.tsx`, `products/new/{page,GuidedBuilder,PackagingPicker}.tsx` |
| **Clone** (sibling win, no schema) | `cloneDraftFromTemplate` deep-copy → new DRAFT with full id-remap (slots/flavors/option values/rules) + a "Clone product" row action. Caught + fixed a real bug: variant `gtin` is **globally `@unique`** → nulled on clone | `build-actions.ts`, `products/ProductRowActions.tsx` |

**Corrections vs. the original plan below:**
- **Niche/tag persistence was NOT a bug.** `saveProductNiches`/`saveProductLifestyleTags` already write the junctions and `loadDraft` already returns `nicheIds`/`lifestyleTagIds` — the "in-session only" was a stale top-of-file comment. No fix shipped (the comment can be tidied opportunistically); §6a below is superseded.
- **Variant-level defaults seed at draft creation,** not "where the first variant is created." `createDraftShell` creates the default variant (best-effort, only when defaults exist) so `loadDraft.production` returns them and step 2 shows them. The §4.3 "smart-default net content" remains a manual field (no auto-derivation shipped).
- **Several "missing" fields already existed** (per-template lead times, storage class/temp, net *weight* via `containerSizeG`, net pack *dimensions* + `maxWeightG`), so the additive diff was just the four blocks in §1.

---

## 0. Ground truth (what already exists — do NOT rebuild)

Verified against `packages/db/prisma/schema.prisma` + `build-actions.ts`:

| Capability | Status | Where |
|---|---|---|
| Per-template lead times | ✅ exists | `ProductTemplate.leadTimeRepeatDays`, `.leadTimeFirstRunDays` |
| Storage class + temp range | ✅ exists | `ProductTemplate.storageClass`, `.storageTempMinF`, `.storageTempMaxF` |
| Net **weight** of contents | ✅ partial | `ProductTemplateVariant.containerSizeG` (weight only) |
| Net pack **dimensions** | ✅ exists | `PackagingSystem.dimensions` (JSON `{lengthMm,widthMm,heightMm}`) + `.maxWeightG` |
| MOQ / increment / capacity / fulfillment / lot / facility | ✅ exists | `ProductTemplateVariant.*` (with schema `@default`s) |
| Facility w/ country + default flag | ✅ exists | `PartnerFacility.country`, `.isDefault` |
| **Niche / lifestyle-tag persistence** | ✅ **already works** | `saveProductNiches`/`saveProductLifestyleTags` write junctions; `loadDraft` returns `nicheIds`/`lifestyleTagIds`. The "in-session only" note is a **stale comment**, not a bug |

**So the real gaps are narrow:** (a) no manufacturer-level *preset* record to seed drafts from, (b) declared net content by **volume/count** (not just weight), (c) finished-good **country of origin**, (d) **Ti-Hi + filled gross weight** for pallet/freight, (e) no **clone-from-existing**, (f) a stale comment to delete.

---

## 1. Schema diff (additive)

### 1.1 NEW model — `PartnerProductDefaults` (manufacturer-level presets, 1:1 with Partner)

```prisma
model PartnerProductDefaults {
  id                   String           @id @default(uuid())
  partnerId            String           @unique
  // Operational defaults seeded into each new product DRAFT at createDraftShell.
  // All nullable: a null field falls through to the existing schema @default
  // (or, for COO, to facility/partner country). Precedence in §2.
  defaultFacilityId    String?          // FK PartnerFacility (UI prefills the isDefault facility)
  countryOfOrigin      String?          // ISO-3166-1 alpha-2 finished-good COO
  leadTimeRepeatDays   Int?
  leadTimeFirstRunDays Int?
  moqMin               Int?
  moqMax               Int?
  orderIncrement       Int?
  monthlyCapacity      Int?
  fulfillmentMode      FulfillmentMode?
  lotTracking          Boolean?
  storageClass         StorageClass?
  storageTempMinF      Int?
  storageTempMaxF      Int?
  // Master switch: when false, createDraftShell skips seeding (manual entry).
  applyToNewProducts   Boolean          @default(true)
  partner              Partner          @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  defaultFacility      PartnerFacility? @relation("FacilityProductDefaults", fields: [defaultFacilityId], references: [id])
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt
}
```

Back-relations (add one line each):
```prisma
// in model Partner
  productDefaults   PartnerProductDefaults?
// in model PartnerFacility
  productDefaults   PartnerProductDefaults[] @relation("FacilityProductDefaults")
```

> **V1.5 extensibility (do NOT build now, just leave room):** to support per-domain defaults later, drop `@unique` on `partnerId`, add `labelingType LabelingType?`, and switch to `@@unique([partnerId, labelingType])`. Additive when needed.

### 1.2 `ProductTemplate` — finished-good country of origin

```prisma
  // Finished-good country of origin (ISO-3166-1 alpha-2). Seeded from
  // PartnerProductDefaults.countryOfOrigin → default facility country →
  // Partner.country. Override per product. Customs + label + Made-in-USA +
  // DPP-ready (kept nullable; no UI requirement in V1).
  countryOfOrigin   String?
```

### 1.3 `ProductTemplateVariant` — declared net content (volume/count, beyond weight)

```prisma
  // Declared net quantity of contents for the label's principal display panel.
  // containerSizeG already stores net WEIGHT (g) for shipping; these capture the
  // DECLARED quantity, which may be volume or count (FDA 21 CFR 101.105).
  netContentValue   Decimal? // e.g. 473, 60
  netContentUnit    String?  // 'g' | 'mL' | 'fl oz' | 'oz' | 'ct' | 'capsules' | 'tablets' | ...
  netContentDisplay String?  // optional pre-formatted label string, e.g. "16 fl oz (473 mL)"
```

### 1.4 `PackagingSystem` — pallet/freight logistics (Ti-Hi + filled gross weight)

Net dimensions already live in `.dimensions`; add the missing pieces:
```prisma
  grossWeightG    Int? // filled/packed gross weight of one sellable unit (vs maxWeightG capacity)
  casesPerLayer   Int? // Ti — cases per pallet layer
  layersPerPallet Int? // Hi — layers high  (casesPerPallet = Ti × Hi)
```

That's the entire schema change. No drops, no type changes, no required columns.

---

## 2. Inheritance / precedence rule (document + enforce in one place)

For any seeded field, resolution precedence is:

```
product-level value (explicitly set on template/variant)
  ↳ PartnerProductDefaults.<field>   (if applyToNewProducts && non-null)
      ↳ schema @default               (existing behavior, unchanged)
```

For **country of origin** specifically:
```
ProductTemplate.countryOfOrigin
  ↳ PartnerProductDefaults.countryOfOrigin
      ↳ default PartnerFacility.country (isDefault)
          ↳ Partner.country ("US")
```

**Ti-Hi / dims / gross weight are NOT copied onto the product** — they live on `PackagingSystem` (the catalog row) and are read *through* the `ProductTemplatePackaging` link at shipping/freight time. Authored once per packaging, inherited by every product that uses it. (Single source of truth; avoids drift.)

---

## 3. Server actions (`@ilaunchify/db` + partner actions)

All mutating actions write an `AuditLog` row (per repo convention) and use the centralized ownership guard.

1. **`getPartnerProductDefaults(partnerId)`** — read (returns null if unset).
2. **`savePartnerProductDefaults(input)`** — `upsert` by `partnerId`; validates facility belongs to partner; audited.
3. **Seed in `createDraftShell`** (extend existing action): after creating the `ProductTemplate` + default `ProductTemplateVariant`, load `partner.productDefaults`; if `applyToNewProducts`, set the template/variant fields per §2 (only where the default is non-null). COO falls back to default-facility country. No new draft path — just enrich the existing one.
4. **`cloneDraftFromTemplate(sourceTemplateId)`** (NEW) — deep-copy a source `ProductTemplate` owned by the same partner into a fresh `DRAFT`:
   - scalars (name → `"Copy of <name>"`, new unique `slug`, status `DRAFT`, COO, lead times, storage, formulationData, marketplace attrs, customMeta),
   - `TemplateIngredientSlot[]`, `FlavorPreset[]` (+ slotResolution/extras), the default `ProductTemplateVariant` (incl. net content), `ProductTemplatePackaging[]` links, `ProductTemplatePricingTier[]`, `ProductTemplateFee[]`, `ProductSampleOption[]`, niche + lifestyle-tag junctions.
   - Ownership-guarded; audited. This is the cheapest, highest-value preset mechanism (pure app logic, zero schema).
5. **Extend the variant/packing save action** to accept `netContentValue/Unit/Display`; extend the packaging-system editor action to accept `grossWeightG/casesPerLayer/layersPerPallet`.

`loadDraft` / `InitialDraft`: add `countryOfOrigin` and the three `netContent*` fields so the builder seeds them on resume (mirrors the existing pattern).

---

## 4. UI changes (minimal, mostly read-only/prefilled)

1. **Partner settings → "Product defaults"** (`/settings/product-defaults`, partner-admin only via `PartnerMembership.isAdmin`): one form to author the preset (facility, COO, lead times, MOQ/increment/capacity, fulfillment, lot, storage). This is the single page that makes every future product lighter. Uses the new `_ui` Section/Field chrome for consistency.
2. **Basics step:** add a **Country of origin** field (prefilled from defaults, editable) — one dropdown, defaulted, rarely touched.
3. **Variants & packs step:** add **Net content** (value + unit) next to container config; smart-default the value from finished weight/packaging where derivable, partner confirms.
4. **Packaging step:** show **Ti-Hi + gross weight + dims** as a read-only "Logistics" line inherited from the selected PackagingSystem (with an "edit in packaging catalog" link). Authoring lives in the PackagingSystem editor, not per product.
5. **Products list / builder top bar:** a **"Clone from existing"** action (calls `cloneDraftFromTemplate`) → opens the new draft.
6. **Stale-comment fix:** delete the "Niches/tags/variant persistence is the next revision pass (local + functional in-session for now)" comment block at the top of `BasicsScreen.tsx` (persistence is real). Optional: a small test asserting `loadDraft` round-trips `nicheIds`/`lifestyleTagIds`.

---

## 5. Out of scope for this slice (schema-ready, hidden)

Per the research's "no-regret substrate, no UI burden" stance: do **not** surface HS/HTS code, multi-level GTIN, COA attachment, supplement overage/theoretical-yield, hazmat, or DPP fields (substances-of-concern / recycled-content / carbon) in V1. They can be added later as additional nullable columns/JSON when a market or customer pulls us in. Country of origin is the one DPP-adjacent field we add now because manufacturers need it for customs/label anyway.

---

## 6. Rollout

```bash
# 1. edit schema.prisma (the four changes in §1)
pnpm db:push          # additive; this repo uses push, NOT migrate
pnpm db:generate      # regenerate client
rm -rf apps/*/.next   # stale client gets bundled into .next (CLAUDE.md gotcha)
# 2. implement actions (§3) + UI (§4)
pnpm typecheck && pnpm lint
node scripts/check-no-raw-tailwind-colors.mjs
```

**Verification:** create a product with defaults set → confirm the draft pre-fills facility/COO/lead times/MOQ/storage; clone an existing product → confirm a full DRAFT copy; set Ti-Hi on a PackagingSystem → confirm it shows read-only in the product packaging step; confirm niche/tag round-trip on resume.

---

## 7. Suggested PR breakdown

1. **PR-1 schema + client:** the four additive blocks (§1) + `db:push`/`generate`. (No behavior yet.)
2. **PR-2 presets engine:** `PartnerProductDefaults` actions + `createDraftShell` seeding + precedence helper (§2–3). Settings page (§4.1).
3. **PR-3 fields in builder:** COO (Basics), net content (Variants), Ti-Hi/gross weight on PackagingSystem editor + read-only inherited display in packaging step (§4.2–4.4). Extend `loadDraft`.
4. **PR-4 clone:** `cloneDraftFromTemplate` + "Clone from existing" button (§3.4, §4.5).
5. **PR-5 cleanup:** delete the stale BasicsScreen comment + niche/tag round-trip test (§4.6).

Each PR is independently shippable; PR-1 is the only one requiring a DB push. PR-4 (clone) delivers the biggest day-one entry-saving on its own and could be pulled forward if you want the fastest visible win.
