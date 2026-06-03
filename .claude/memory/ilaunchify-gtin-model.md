---
name: ilaunchify-gtin-model
description: V1 GTIN/UPC plan — light schema + validation + duplicate detection + Internal SKU escape hatch. Brand-of-record service deliberately deferred to V2+.
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

iLaunchify V1 supports retail barcodes WITHOUT being the brand of record.

**The four V1 pieces (shipped as DS-52a/b/c):**
1. **Schema**: Product.gtin (`@unique` — free dup detection), Product.gtinSource (USER_PROVIDED default, GS1_VALIDATED + PLATFORM_ASSIGNED reserved for V2+), Product.internalSku, Product.barcodeMode (NONE / RETAIL_UPC / INTERNAL_SKU).
2. **Validation**: pure-JS mod-10 check-digit math in `packages/ui/canvas/gtin.ts` for UPC-A / EAN-13 / EAN-8 / ITF-14. Synchronous, no API.
3. **Duplicate detection**: server action scans Product table; privacy-safe — surfaces "in use elsewhere on iLaunchify" without disclosing which brand/product.
4. **Internal SKU mode**: Code 128 + "INTERNAL" caption baked in, for pre-launch / sample / retailer-pitch runs where creator doesn't have GS1 paperwork back yet.

**Why:** Real retail (Amazon Brand Registry, Walmart, Target, Costco) validates UPC ownership against GS1's GEPIR database. iLaunchify V1 lets creators paste their own GS1-registered UPCs and print them correctly; doesn't acquire UPCs for them.

**Why NOT brand-of-record (Pavel 2026-05-28):** Pavel hasn't decided whether to be in that business. The legal complexity (GS1 prefix licensing, ownership transfer at graduation, retailer audit responsibility) is V2+ territory if at all.

How to apply: when adding new variant-level identity (eventually multiple GTINs per Product if multiple SKUs ship under one Product), keep the same shape. The whole point of the V1 design is "schema makes V2+ moves cheap."

Surfaces:
- Product overview page: `RetailIdentityCard` (opt-in, collapsed by default)
- Design Studio Barcode drawer: Retail UPC vs Internal SKU mode toggle + GS1 educational popover

See also [[ilaunchify-orchestration-thesis]] — the Variant SKU is the keystone object in iLaunchify's "manufacturing-grade product identity systems" thesis vs POD's ephemeral identity.
