# HANDOFF → Code: label responsible-party line (21 CFR 101.5)

Pavel 2026-07-12. The creator chooses the label's signature line per product;
naming the manufacturer stays the PARTNER's opt-in. Everything below the canvas
is built — the Studio wiring is yours (LabelDrawer + canvas = your zone).

## What's already built (Cowork, this commit)

1. **Schema (additive — needs Mac `pnpm db:push && pnpm db:generate`):**
   - `Brand.legalName / legalAddressLine1 / legalAddressLine2 / legalCity /
     legalState / legalPostalCode / legalCountry` — the brand's PLACE OF
     BUSINESS (company address, NOT a facility; 101.5 wants the firm's
     principal place of business).
   - `Product.responsiblePartyMode: ResponsiblePartyMode`
     (`BRAND_MANUFACTURED_FOR` default · `BRAND_DISTRIBUTED_BY` ·
     `MANUFACTURER`).
   - NOTE: `Product.disclosureLevelOverride` remains dead — superseded by
     `responsiblePartyMode`; don't wire it.
2. **Pure composer:** `packages/ui/src/canvas/responsibility.ts`
   (`composeResponsibilityLine`, `availableResponsibilityModes`) — exported
   from `@ilaunchify/ui`. Returns `{ ok, line, problems[] }`; MANUFACTURER mode
   is gated on the pinned manufacturer service's `disclosureLevel === 'FULL'`
   and reports human-readable problems (missing brand address, disclosure gate).

## What's yours (Studio zone)

1. **LabelDrawer** (`apps/creator/src/app/(studio)/products/[productId]/design/
   canvas/drawers/LabelDrawer.tsx:~311`): replace the hardcoded
   `` `Manufactured for ${productCtx.brandName}` `` prefill for the
   `manufacturer-info` section with the composer:
   - Load: product.responsiblePartyMode + brand legal fields + the pinned
     manufacturer (`template.manufacturerService.partner` companyName/city/state
     + `manufacturerService.disclosureLevel`).
   - UI: a 3-option selector (radio/seg) using `availableResponsibilityModes()`
     — MANUFACTURER hidden/disabled with tooltip when disclosure ≠ FULL.
   - Persist the choice to `Product.responsiblePartyMode` (audited server
     action; the ownership guard pattern from the other drawer actions).
   - When `!result.ok`, show `problems[]` inline and keep the section flagged
     non-compliant (labelRules already requires role `manufacturer-info`).
   - Deep-link "Add your business address" → the Brand settings legal-identity
     section (Cowork is adding that form next; route will be the brand editor).
2. **Canvas placeholder** (`packages/ui/src/canvas/objects.ts:384`): keep the
   placeholder but prefer the composed line whenever the drawer provides one.
3. Optional: `labelRules.ts` `manufacturer-distributor-statement` phrase check
   can validate against `composeResponsibilityLine().ok`.

## Facts from the audit (context)

- Food/Supplement facts SVGs deliberately DON'T render this line — it's a
  separate canvas section. Cosmetic `InciDeclarationSvg` has its own free-text
  `responsiblePerson`; unify later if desired.
- Facility addresses are NOT what 101.5 wants — don't pull PartnerFacility
  here. Partner place-of-business = `Partner.companyName/city/state`.
