# Manufacturer Product Inventory (per-flavor, hide-when-out)

Date: 2026-07-27. Status: PLAN, approved direction, not yet built.
Decisions locked by Pavel 2026-07-27: per-flavor granularity, HIDE exhausted products from the Marketplace, plan doc before code.

---

## 1. Problem

Manufacturers cannot cap how much of a product the Marketplace may sell. `ProductTemplate` has no inventory field, the add-product builder (`apps/partner .../products/new`) has no inventory step, and the marketplace query (`apps/marketing/src/lib/templates.ts` `buildWhere()`) filters only on `status: 'PUBLISHED'` plus facets. A limited production run keeps selling forever.

Audit of existing "inventory" systems (none solves this):

| System | What it is | Why it doesn't apply |
|---|---|---|
| Partner `/inventory` page (`StorageAgreement` + FEFO lots) | Client goods stored AT the partner's facility | Creator-owned stock, not the partner's own sellable product |
| `InventoryPool` + `InventoryLedger` (`packages/channels/src/inventory.ts`) | Creator bulk stock for external channels (Shopify etc.) | Creator-scoped; well-built pattern we will CLONE, not reuse rows |
| `Product.inventoryAvailable` | Written by the creator publish form | READ NOWHERE (dead field, see §8 cleanup) |

## 2. Semantics (D1, D2)

- Inventory = finished-good BASE UNITS the manufacturer is willing to sell through the platform, tracked **per flavor** (`FlavorPreset`), optional per template.
- Templates without flavors track one row with the sentinel flavor key `base` (same convention as `InventoryPool.flavorPresetId @default("base")`).
- Untracked (default) = infinite, today's behavior. Fully additive; zero migration risk.

## 3. Data model (additive; rides the shared db:push + generate gate)

```prisma
/// Per-template x flavor sellable stock. Quantities are DERIVED; the ledger is truth.
model TemplateFlavorInventory {
  id                String   @id @default(uuid())
  productTemplateId String
  flavorPresetId    String   @default("base") // soft FK; "base" = flavorless template
  tracked           Boolean  @default(true)
  quantityAvailable Int      @default(0)      // base units remaining
  lowStockThreshold Int?                      // null = category default
  alertState        String   @default("HEALTHY") // HEALTHY | LOW | STOCKOUT, fires on TRANSITION
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  ledger            TemplateInventoryLedger[]

  @@unique([productTemplateId, flavorPresetId])
  @@index([productTemplateId])
}

enum TemplateInventoryLedgerKind {
  RESTOCK        // manufacturer adds units (+)
  ORDER_CONSUMED // paid order decremented units (-)
  ORDER_REVERSED // cancel/refund compensating entry (+)
  ADJUSTMENT     // manual correction (signed, audited)
}

/// Append-only. quantityAvailable is derived from this; never hand-edit the count.
model TemplateInventoryLedger {
  id          String @id @default(uuid())
  inventoryId String
  kind        TemplateInventoryLedgerKind
  delta       Int    // signed base units
  orderId     String? // soft FK, provenance for ORDER_CONSUMED / ORDER_REVERSED
  note        String?
  actorUserId String? // who restocked/adjusted
  createdAt   DateTime @default(now())
  inventory   TemplateFlavorInventory @relation(fields: [inventoryId], references: [id], onDelete: Cascade)

  @@index([inventoryId, createdAt])
}
```

Denormalized hide flag on `ProductTemplate` (precedent: `printCoverage` cache):

```prisma
  // Marketplace sellability cache. Recomputed inside every ledger-touching
  // transaction. false = at least one valid flavor combination is in stock
  // (or inventory untracked). true = hidden from the marketplace.
  inventorySoldOut Boolean @default(false)
```

Ledger math helpers live in a new pure module (clone of `packages/channels/src/inventory.ts` invariants: never negative, kind-specific signs, helper-enforced only).

## 4. Hide rule (D3 = HIDE)

A template is sellable when untracked OR a creator can still complete a valid order:

- Single-flavor / flavorless: `quantityAvailable > 0` on the relevant row.
- Multi-flavor (variety): count of in-stock ACTIVE flavors must be >= `minFlavorsPerPack ?? 1`. Below the floor the template is unofferable even if some flavors remain.

Enforcement points, cheapest first:

1. **Marketplace list**: `buildWhere()` gains `inventorySoldOut: false`. One clause; the cache keeps the query flat.
2. **PDP flavor picker**: out-of-stock flavors are dropped from the chip row / pack-builder pool (same data the picker already loads; the pack-builder already enforces `maxFlavorsPerPack`, add the stock filter beside it).
3. **PDP direct link**: `inventorySoldOut` templates fall through to the category page (HIDE semantics; no sold-out page in V1).
4. **Checkout guard**: pre-charge validation recomputes per-flavor need vs stock and rejects with "only N units of {flavor} left". Protects launched `Product` rows whose PDP snapshot predates the stockout.
5. **Favorites / existing launched Products**: launch + re-order paths hit the same guard; the marketplace card component renders nothing for sold-out ids (they simply stop appearing, consistent with HIDE).

### 4b. Quantity ceiling (INVARIANT: a creator can never order more than remaining stock)

Low-but-not-zero stock is the common case (300 units left, creator wants 500). The order quantity is capped, not just the product's visibility:

- `maxOrderableQty(config) = min over involved flavors of floor(quantityAvailable_f / perPackUnits_f)`, where `perPackUnits_f` comes from the SAME fill-rule split helper the pricer and the decrement use (single source; the three can never disagree). Flavorless: `floor(available / unitsPerPack)`.
- **Checkout quantity stepper** (the ONLY editable field at checkout) clamps to `maxOrderableQty` and shows "Only N packs available" when the clamp binds. PDP shows a low-stock hint when a flavor is at/below its threshold.
- **Server is the authority, UI clamp is convenience**: the pre-charge guard revalidates `qty <= maxOrderableQty` and the conditional decrement (§5) is the final gate, so a stale page, a concurrent order, or a hand-crafted request can never oversell. Reject happens BEFORE the charge, with the current max in the error.
- **MOQ interaction**: variants carry `moqMin`. If `maxOrderableQty < effective MOQ` for a config, that config is UNORDERABLE, and the flavor is treated as out-of-stock for that variant (dropped from the picker) even though `quantityAvailable > 0`. The `inventorySoldOut` recompute uses this orderability test, not a bare `> 0`, so a template whose remaining stock is below MOQ everywhere hides correctly instead of dangling as "in stock but impossible to order".

## 5. Decrement path

Point of truth: the post-charge transaction in the production order action (`apps/creator .../checkout/production-actions.ts`, where `computeOrderPricing` output becomes the order). Checkout is confirm-only, so quantity and flavor composition are final there.

- Per-flavor consumption comes from the same engine that prices it: `selectedFlavorPresetIds` + the variety fill rule (`FixedDistribution` / even split) x variant `unitsPerPack` -> base units per flavor. ONE helper computes this split; pricing, the §4b quantity ceiling, and inventory must never disagree.
- Concurrency: conditional decrement inside the transaction, `updateMany({ where: { id, quantityAvailable: { gte: need } }, data: { quantityAvailable: { decrement: need } } })`; affected-rows 0 = abort before charge. No reservations in V1 (graduate to the RESERVATION pattern only if oversell pressure appears).
- Same helper runs for on-demand dispatches (C2.2 route-core): a finite run is consumed by every produced unit regardless of journey. `OnDemandEnablement.capacityPerDay` stays what it is (throughput), inventory is stock; both guards can park/reject independently.
- Cancels/refunds write `ORDER_REVERSED` compensating entries (refund rail is currently off; wire the hook where refund approval lands).
- Every ledger write recomputes `quantityAvailable`, `alertState`, and the template's `inventorySoldOut` in the same transaction.

## 6. Surfaces

- **Builder card** (`apps/partner .../products/new`, beside `ProductBatchCard`): "Track available stock" toggle; when on, a per-flavor quantity grid (rows = the template's FlavorPreset list, or one row if flavorless) + low-stock threshold. Untracked stays the default.
- **Partner products list**: stock column + "Restock" row action (ledger RESTOCK entry with note; never a raw count edit).
- **Partner `/inventory` page**: new tab "My products" beside the existing stored-client-goods table (the page keeps its current meaning; naming must not conflate the two).
- **Notifications**: new `PARTNER_STOCK_ALERT` event kind mirroring `CREATOR_STOCK_ALERT` (`packages/notifications/src/categories.ts`), fired on alertState TRANSITION (LOW, STOCKOUT, recovered), plus an event when a template flips `inventorySoldOut` (auto-hidden / restored). Register + emit per the 76-event registry pattern.
- **Admin**: products table gets stock + sold-out pill (admin surface pattern); ledger visible on the template detail for disputes.

## 7. Phases

- **I1 schema + helpers**: models above + pure ledger math + split-computation helper + unit tests. Gates on the shared db:push + generate.
- **I2 builder + restock**: builder card, products-list restock, partner inventory tab.
- **I3 enforcement**: checkout guard + §4b quantity ceiling (stepper clamp + server revalidation) + post-charge decrement + on-demand hook + `inventorySoldOut` recompute (orderability test incl. MOQ) + `buildWhere()` clause + PDP flavor filtering.
- **I4 notifications + admin**: PARTNER_STOCK_ALERT wiring, admin visibility.

I3 is the risk center; the conditional-decrement transaction gets a two-concurrent-checkout test before anything ships.

## 8. Cleanup + out of scope

- **D4 open**: dead `Product.inventoryAvailable` (creator publish form writes it, nothing reads it). Wire into channel gating or drop; decide during I1 so a third half-meaning of "inventory" doesn't survive.
- Out of scope V1: reservations/holds, per-variant (pack-size) stock, back-in-stock waitlists for creators, a public "sold out" page (HIDE chosen), auto-restock from production batches.
