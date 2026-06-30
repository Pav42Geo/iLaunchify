# Variety packs & pack composition — model spec

Status: PROPOSED · 2026-06-29 · Pavel-locked decisions in §2 · additive schema · NOT built

Supersedes the live "split the order quantity across flavors" behavior, which is
wrong (it asks the creator *how many units of each flavor* instead of *which
flavors go in a pack*). See §1 for the diagnosis.

---

## 1. What's wrong today

The PDP variety builder treats **capacity = the entire order quantity** and asks
the creator to split that order into per-flavor unit counts (PackBuilder: "split
your {N} units"; `validatePackSelection` requires the per-flavor quantities to
sum to the order quantity; one `OrderItemFlavor` row per flavor holds that
flavor's total units). There is **no pack of N, no pack count, no pack-size
choice** — the "pack" is conceptually the whole order.

Consequences:
- The creator sees "how many of each flavor to order" — the exact thing we don't
  want.
- Per-flavor price is **silently dropped** in multi-flavor mode (`flavorDelta = 0`
  when `isMultiFlavor`); every flavor is priced at the base band cost.
- There is **no per-pack pricing** anywhere — always flat per-unit × total units.

Manufacturer side: can set the flavor pool, `maxFlavorsPerPack`, and **one**
pack capacity (`packingConfig.unitsPerPack`, untyped JSON). Cannot set multiple
offered pack sizes, a per-unit-vs-per-pack basis, a minimum flavors per pack, a
fill rule, or a real per-flavor price. The builder writes a **single variant**.

---

## 2. Locked decisions (Pavel 2026-06-29)

1. **The manufacturer defines the pack matrix**, per product:
   - **Pack type** (packaging — the physical pack/container).
   - **Offered pack sizes / varieties** — one or more of {2, 3, 4, 6, 8, 10, 12,
     24, 36, …}. Each offered size is a real, selectable option.
   - **Units per pack** for each offered size (how many units the pack holds).
   - **Max flavors per pack** (distinct-flavor cap the creator may combine).
   - **Min flavors per pack** (distinct-flavor floor).
2. **Odd-pack / under-pick handling** — when `unitsPerPack` > the number of
   distinct flavors the creator picked, some flavor(s) must repeat to fill the
   pack. The remainder distribution is governed by a manufacturer-set **fill
   rule** (§4.3). Default when unset: the system lets the creator choose which
   flavor(s) repeat; a manufacturer may instead fix the distribution.
3. **MOQ / minimum is manufacturer-set in Add Product** (expressed in packs for
   pack-based products — see §4.4).
4. **Pricing basis is manufacturer-set**, with two modes (§5):
   - **Per-flavor** — each flavor carries a price; pack price = Σ(flavor unit
     price × that flavor's unit count in the pack). **Flavor cards show price.**
   - **Per-pack (flat)** — each offered pack size carries a flat price.
     **Flavor cards show NO price.**
5. **Offered pack sizes = multiple `ProductTemplateVariant` rows** (the model
   already supports siblings; the builder just never authors them). No new
   "offered sizes" container type.

---

## 3. Vocabulary

- **Pack** — one sellable unit the creator orders (a 24-pack box). Holds
  `unitsPerPack` physical units (bars, sachets…).
- **Pack size / variety** — the offered options (6-pack, 24-pack…). Each is a
  `ProductTemplateVariant`.
- **Flavor pool** — the manufacturer's `FlavorPreset` rows.
- **Pick** — a distinct flavor the creator selects for a pack. Count is bounded
  by `[minFlavorsPerPack, maxFlavorsPerPack]`.
- **Slot fill** — how `unitsPerPack` units are distributed across the picked
  flavors (even split + remainder per fill rule).
- **Order quantity** — number of **packs** the creator buys. Total units =
  packs × unitsPerPack.

---

## 4. Manufacturer setup (Add Product → Variants & packs)

### 4.1 Flavor pool
Unchanged: `FlavorPreset` rows (name, Statement of Identity, swatch, die-line,
per-flavor recipe overlay). Gains a **price** field when basis = per-flavor (§5).

### 4.2 Pack matrix
For a pick-N / multi-flavor product the manufacturer authors:

| Field | Meaning | Storage |
|---|---|---|
| Pack type | packaging/container | `ProductTemplateVariant.packagingTypeId` (or component) |
| Offered pack sizes | the selectable sizes | one `ProductTemplateVariant` **per size** |
| Units per pack | units each size holds | `ProductTemplateVariant.unitsPerPack` (promote to typed column) |
| Min flavors / pack | distinct-flavor floor | `ProductTemplate.minFlavorsPerPack` (NEW) |
| Max flavors / pack | distinct-flavor cap | `ProductTemplate.maxFlavorsPerPack` (exists) |
| Fill rule | remainder distribution | `ProductTemplate.flavorFillRule` (NEW, §4.3) |

`minFlavorsPerPack ≤ maxFlavorsPerPack ≤ unitsPerPack`. A size where
`minFlavorsPerPack == unitsPerPack` is fully determined (one of each, no
remainder).

### 4.3 Fill rule (the odd-pack case)
When `unitsPerPack > distinctFlavorsPicked`, the extra units are assigned by
`flavorFillRule`:

- **`CREATOR_CHOOSES`** (default when unset) — the creator decides which picked
  flavor(s) take the extra units (a bounded per-flavor stepper inside the pack,
  not a free order-level quantity). Example: 3-pack, 2 flavors → creator chooses
  which flavor is ×2.
- **`EVEN_AUTO`** — system splits evenly and assigns the remainder
  deterministically (round-robin by pick order). 24-pack, 3 flavors → 8/8/8;
  10-pack, 3 flavors → 4/3/3.
- **`MANUFACTURER_FIXED`** — manufacturer pre-defines the distribution per
  (size × flavor-count) and the creator can't change it.

### 4.4 MOQ & quantity
- MOQ is set by the manufacturer, **in packs**, per offered size
  (`ProductTemplateVariant.moqMin` reinterpreted as pack MOQ for pack-based
  products). Total-unit MOQ is derived (`moqMin × unitsPerPack`).
- Lead time, SKU/GTIN stay per variant (per size).

---

## 5. Pricing

`ProductTemplate.pricingBasis` (NEW enum): `PER_FLAVOR | PER_PACK`.

### 5.1 PER_FLAVOR
- Each `FlavorPreset` carries a **per-unit price** (absolute, or base size price
  + `priceDeltaCents`).
- **Pack price** = Σ over the pack's filled slots of (that flavor's unit price).
  Equivalent to Σ(flavorUnitPrice × unitCountInPack).
- **Order total** = pack price × number of packs.
- **Flavor cards on the PDP show price.**

### 5.2 PER_PACK (flat)
- Each offered pack size (`ProductTemplateVariant`) carries a flat
  **`pricePerPackCents`** (NEW).
- **Order total** = pricePerPack × number of packs. Flavor mix doesn't change
  the price.
- **Flavor cards on the PDP show NO price** (just the flavor + swatch).

Volume tiers (`ProductTemplatePricingTier`) continue to apply as quantity bands;
for pack-based products the band quantity is **packs**.

---

## 6. Creator flow (PDP)

1. **Pick a pack size** (if >1 offered) — e.g. 24-pack. Single offered size =
   no chooser, just shown.
2. **Pick flavors** — choose between `min` and `max` distinct flavors from the
   pool. (Sample orders are **exempt** from min/max — §7.)
3. **Compose the pack** — units are filled across the picks per the fill rule
   (auto even, or a bounded "which flavor repeats" control when
   `CREATOR_CHOOSES`). The creator never types order-level per-flavor unit
   counts.
4. **Set quantity in packs.**
5. **Price** rolls up per §5; headline = order total, with per-pack shown.
6. **Summary** reads e.g. *"3 flavors in a 24-pack · 10 packs = 240 units."*

Persistence: `OrderItemFlavor` rows still capture per-flavor total units (packs ×
per-pack count); the **pack size + pack count** are recorded on the order item so
manufacturing knows the pack structure, not just aggregate flavor totals.

---

## 7. Samples

Sample orders bypass the min/max-flavors rule entirely (a creator can sample a
single flavor, or a sampler set), per the existing sample policy. The pack-matrix
constraints apply only to production orders.

---

## 8. Per-bucket pass (other product types)

The same "pick what, set packs, price by basis" discipline maps onto the 6
`StructuralPackType` buckets:

| Bucket | Creator picks | Quantity in | Flavors | Pricing |
|---|---|---|---|---|
| `SINGLE_UNIT` | size only | units | n/a | per-unit (per-pack n/a) |
| `MULTI_UNIT_SAME` (e.g. 6-pack, one flavor) | pack size + **one** flavor | packs | exactly 1 | per-unit or per-pack |
| `MULTI_FLAVOR_MIXED` (fixed assortment, loose) | pack size | packs | **manufacturer-fixed** assortment (no pick) | per-pack (or per-flavor summed) |
| `MULTI_FLAVOR_COMPARTMENT` (fixed, compartmented) | pack size | packs | manufacturer-fixed | per-pack |
| `PER_FLAVOR_IN_OUTER` (individual packs in outer) | pack size + flavors | packs | pick min–max | per-flavor or per-pack |
| `CUSTOMIZABLE_PICK_N` (the demo) | pack size + flavors | packs | pick min–max | per-flavor or per-pack |

`FlavorPolicy` (`CREATOR_PICK | PARTNER_FIXED`) — promote to a real field so the
fixed-assortment buckets are explicit (today the enum exists but is unused on the
template).

---

## 9. Schema additions (additive, CockroachDB-safe, no drops)

- `ProductTemplate.minFlavorsPerPack Int?`
- `ProductTemplate.flavorFillRule FlavorFillRule?` (new enum
  `CREATOR_CHOOSES | EVEN_AUTO | MANUFACTURER_FIXED`)
- `ProductTemplate.pricingBasis PricingBasis?` (new enum `PER_FLAVOR | PER_PACK`)
- `ProductTemplate.flavorPolicy FlavorPolicy?` (promote existing enum to a field)
- `ProductTemplateVariant.unitsPerPack Int?` (promote from `packingConfig` JSON)
- `ProductTemplateVariant.pricePerPackCents Int?` (per-size flat price; PER_PACK)
- `FlavorPreset.unitPriceCents Int?` (absolute per-flavor price; PER_FLAVOR) —
  or keep using `priceDeltaCents` over a base; decide at build time.
- (Manufacturer-fixed distributions, if `MANUFACTURER_FIXED`: a small JSON on the
  variant keyed by flavor-count → counts.)

Keep `packingConfig` readable for back-compat; new typed columns win when set.

---

## 10. Build phasing

1. **Schema** (additive) + `pack-composition` engine v2 (pack-aware: size,
   units-per-pack, min/max, fill rule) with exact-value tests.
2. **Manufacturer builder** — pack-matrix card (offered sizes + units + min/max +
   fill rule) and pricing-basis card (per-flavor prices OR per-pack flat).
3. **Creator PDP** — replace the "split the order" PackBuilder with: pack-size
   chooser → flavor picker (min–max) → fill control → packs quantity → basis-aware
   price + summary.
4. **Persistence + manifest** — record pack size + pack count on the order item;
   keep `OrderItemFlavor` aggregate totals.
5. **Per-bucket rollout** — apply §8 to the other structural types.

---

## 11. Open / deferred

- Exact per-flavor price representation (absolute `unitPriceCents` vs base +
  `priceDeltaCents`) — decide at build step 1.
- Whether volume tiers price in packs or units for per-pack basis (lean: packs).
- `MANUFACTURER_FIXED` distribution authoring UI (defer if not needed in V1).
- **Required-fields / stepper validation — DEFERRED (Pavel 2026-06-29).** The Add
  Product stepper should EVENTUALLY block "Next" when pricing is incomplete —
  specifically PER_FLAVOR with any flavor missing `unitPriceCents`, and PER_PACK
  with any offered size missing `pricePerPackCents`. NOT YET: don't gate the
  stepper while the flow is still changing. First have the broader "what fields
  are required in Add Product" conversation (per step × domain × pack type, how
  errors surface, save-incomplete behavior), THEN wire the gates. Booked price
  stays the safe `Math.max` floor (§5) meanwhile.
