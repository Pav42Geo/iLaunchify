# Partner order packets — product passport + per-role work packets (proposal)

**Date:** 2026-07-04. Answers: are orders saved to the creator; does each partner get the RIGHT data
for their role; should partners get the full order passport + only what they need; how do major
platforms do it; what's the exact information-package template per partner; is it compatible today;
and do all interested partners get notified/emailed.

## Direct answers (TL;DR)

1. **Orders saved to the creator's profile?** ✅ Yes. `placeOrderFromCheckoutDraft` persists the `Order`
   with `creatorUserId` (`cart-actions.ts:611`); the creator sees it in their order history (list +
   detail, `orders/page.tsx:94`). Durable and correctly scoped.
2. **Does each partner get the right data?** ⚠️ Partly. Each producing partner gets their OWN dispatch +
   manifest (good), but the manifest CONTENT is barely role-scoped — only the packaging `components[]`
   array is filtered by role (`manifest.ts:47`). **Everything else — full recipe/ingredients/allergens,
   flavor SoIs, finishes + pricing, and the ship-to street address — is sent to every partner.** A
   printer receives the full food formula and the creator's delivery address. That's the core problem.
3. **Full passport + exactly what they need — right model?** Best practice = **a shared read-only Product
   Passport (what the product IS) + a per-role Work Packet (only the fields that role executes on),
   need-to-know.** Not "the whole order to everyone." Formulation → producer only; end address → the
   last hop only; each partner sees only their own cost.
4. **How major platforms do it:** Distributed Order Management splits an order into per-vendor streams;
   each supplier sees ONLY their assigned work in a portal + gets email; product **master data**
   governs who may see which field (need-to-know). ([Descartes DOM](https://www.descartes.com/solutions/ecommerce-shipping-fulfillment/multichannel-inventory-order-management) · [Shopify supplier portals split orders + email](https://apps.shopify.com/supplier-portal) · [vendor master data / field ownership](https://sourceday.com/blog/vendor-master-data/)). For CPG specifically, the co-packer/manufacturer needs a crisp **Product Specification** (finished-product description, packaging + labeling/artwork, nutrition-facts match, QC, price breakdown) — the spec is the basis for accepting/rejecting goods ([co-packing spec best practices](https://www.mrpeasy.com/blog/cpg-comanufacturing-copacking/) · [CPA glossary](https://www.contractpackaging.org/external-manufacturing-library/contract-manufacturing-co-packing-glossary)).
5. **Compatible with today's interface?** Partially — the plumbing exists (per-dispatch manifest, role
   "skins" `PrintJobCard`/`WorkOrderCard`, the shared `ProductionManifestView`, a raw-JSON download). The
   GAPS are content scoping, the passport/packet split, and the FC leg (below).
6. **Do all interested partners get notified + emailed?** ⚠️ The three PRODUCING partners (manufacturer,
   printer, co-packer) each get IN_APP + EMAIL `DISPATCH_RECEIVED` (`routing.ts:447`). **The FC/warehouse
   gets nothing at assignment or ship time** — it owns no dispatch and must poll its inbound queue; its
   only event is a post-delivery SLA nag.

## Current gaps (from the audit)

- **G1 — Manifest content not role-scoped (over-exposure).** Only `components[]` is filtered; recipe,
  ingredients, allergens, flavor SoIs, finishes+pricing, and **ship-to street address** go to everyone
  (`manifest.ts:526-611`; raw JSON download returns the whole blob).
- **G2 — No FC/warehouse work leg or assignment notification.** `DispatchType` = PRODUCT/LABEL/COPACKING
  only; the FC owns no dispatch and is never told an inbound is coming until someone else ships.
- **G3 — No passport vs packet split.** One manifest doubles as both, "rendered identically" for partner
  and admin (`ProductionManifestView.tsx:1`). No need-to-know separation.
- **G4 — Fragile transport.** Substrate/packaging/finish are regex-parsed from `Order.internalNotes`
  (`manifest.ts:471`) — a formatting drift silently drops them.

## The proposal — one Passport + four role packets

### A. Product Passport (SHARED, read-only, immutable at order time)
"What the product IS" — safe for every partner + admin. NO formulation, NO end-customer address.
```
Passport {
  orderNumber, brandName (NOT the creator's personal identity), placedAt
  quantityOrdered, perFlavorSplit[{ flavor, units }]
  product { name, category, domain (label type), netQuantity, gtin, internalSku }
  selectedFlavors[{ name, statementOfIdentity, swatch }]
  labelArtwork[{ flavor, designVersionId }]        // the print master reference
  dieCut { name, widthMm, heightMm, bleedMm, safeAreaMm }
  compliance { requiredLabelType, mandatoryPhrases[], allergenStatement, bioengineered, certs[] }
  leadTime, requiredShipBy
}
```

### B. Manufacturer / Producer packet (dispatch type PRODUCT) — + on top of the passport:
```
{ formulation: { servingSizeG, servingsPerContainer, perFlavorRecipes[{ flavor, ingredients[{ name, weightG, source }] }], allergens, bioengineered },
  fillQuantities perFlavor, moq, orderIncrement, shelfLifeDays, lotTracking,
  qc { batchSampleRetention, records },
  shipTo: NEXT HOP (co-packer or FC) — not the creator's address }
```

### C. Printer / Decorator packet (dispatch type LABEL) — + on top of the passport:
```
{ printFiles: { normalizedDielineSvg, designVersion per flavor }, decorationMethod,
  substrate (label material), finishes[{ name, spec }] (NO cost), spotColors[], dieCut spec,
  labelQuantities perFlavor,
  shipTo: NEXT HOP.  // NO recipe/formulation, NO end address }
```

### D. Co-packer / Assembler packet (dispatch type COPACKING) — + on top of the passport:
```
{ assembly: { components[CARTON/SHIPPER], packComposition[{ flavor, units }], packingConfig, mockups },
  inboundExpected[{ from role, items, eta }],   // what arrives from producer + printer
  outerQuantities,
  shipTo: FC or end destination.  // NO recipe/formulation }
```

### E. FC / Warehouse inbound packet (NEW leg) — passport (light) +:
```
{ inbound: { items[{ sku, flavor, units }], fromPartner, eta, trackingCarrier/Number },
  storage { tempClass, hazmat, dwellPolicy }, channelInboundPlan (FBA/WFS/FBT if any) }
```

### Need-to-know redaction rules (applied when scoping the full manifest → a role packet)
- **Formulation/recipe** → PRODUCT (manufacturer) only. Redacted for printer, co-packer, FC.
- **End-customer / delivery address** → only the LAST hop that ships to it. Intermediate partners see
  "ship to <next partner>", not the creator's home address.
- **Cost/pricing** → each partner sees only THEIR payout/cost, never the creator's retail or another
  partner's cost. (Today finishes carry per-unit pricing to everyone — fix.)
- **Passport fields** (identity, compliance, artwork ref, die-cut, quantities) → shared to all.

## Build plan + Cowork/Code split

- **Cowork (pure, collision-free — I can build now):** a `scopeManifestForRole(fullManifest, role) →
  RolePacket` engine + the Passport/packet TYPES + tests, in `@ilaunchify/orders` (extends the existing
  `scopeDispatchComponents` to ALL fields, applying the redaction rules). Deterministic + testable.
- **Code (hot files):**
  - `manifest.ts` — build the Passport once + call `scopeManifestForRole` per dispatch so each partner's
    `finishManifestJson` is their packet (closes G1); promote substrate/packaging/finish to typed order
    columns (G4).
  - `DispatchType` + `dispatch-planner`/`routing` — add a WAREHOUSE/INBOUND leg (or a first-class inbound
    assignment) + fire `DISPATCH_RECEIVED`/a new `INBOUND_ASSIGNED` to the FC at ship time (closes G2 + the
    notification gap).
  - Partner UI — a shared **Passport** panel + the role packet view (reuse `ProductionManifestView`, but
    fed the scoped packet); the raw-JSON download returns the packet, not the whole blob.
- **Notifications:** extend the fan-out so the FC/warehouse partner is notified (in-app + email) at ship
  time, alongside the existing producer notifications.

### Phasing
1. Cowork: the pure `scopeManifestForRole` engine + Passport/packet types + tests.
2. Code: wire it into `manifest.ts` (per-dispatch packets + shared passport) — closes over-exposure (G1/G3).
3. Code: FC/warehouse leg + notification (G2).
4. Code: typed substrate/packaging/finish columns (G4).

## Sources
- Descartes DOM (split + route per vendor) — https://www.descartes.com/solutions/ecommerce-shipping-fulfillment/multichannel-inventory-order-management
- Shopify supplier portals (per-vendor split + email) — https://apps.shopify.com/supplier-portal
- Vendor master data / field ownership — https://sourceday.com/blog/vendor-master-data/
- Co-packing spec best practices — https://www.mrpeasy.com/blog/cpg-comanufacturing-copacking/
- CPA contract packaging glossary — https://www.contractpackaging.org/external-manufacturing-library/contract-manufacturing-co-packing-glossary
