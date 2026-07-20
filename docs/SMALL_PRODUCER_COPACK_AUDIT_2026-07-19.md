# Audit: is a small producer ever shown co-packing as a default or required step?

**Question (Pavel 2026-07-19).** A family honey/spice business makes small batches and packs it
themselves in the garage. They need no co-packer. Does the platform ever default them into co-packing,
require it, or make a manufacturing-only setup feel partial?

**Verdict: NO. The system is safe by construction.** Co-packing is opt-in at every stage; a partner
who never selects it never encounters it. The only real gap was copy that could make a self-packing
producer mis-identify as a co-packer. That copy is now fixed.

---

## What the audit checked, and what it found

**1. Service selection is opt-in, nothing pre-selected.**
- Public apply wizard (`apps/partner/src/app/partners/apply/ApplicationWizard.tsx`): `serviceTypes`
  is `.min(1)` (at least one of ANY service, not co-pack specifically). Default is `[]`; a service is
  only pre-checked when a landing page passes `?type=` intent (`apply/page.tsx:80`), which is a
  deliberate targeted-landing behavior, not a generic default.
- Onboarding Section 1 (`YourBusinessSection.tsx`): three equal opt-in checkboxes (Manufacturing,
  Co-packing, Packaging printing), none pre-selected. WAREHOUSE is not self-selectable at all
  (admin-contracted).

**2. Capability forms render only for SELECTED services.**
- Onboarding Section 3 (`WhatYouCanDoSection.tsx`) renders one tab per selected type and defaults to
  the first selected. A manufacturing-only partner sees only the Manufacturing tab. The co-pack form
  never appears unless they picked co-packing.

**3. Activation composes tracks per selected service (the "partial setup" check).**
- `activation-tracks.ts` `activationStepsFor(['MANUFACTURING'])` returns ONLY the 3 manufacturing
  steps + the shared tail. No co-pack steps. `isServiceActivationComplete('MANUFACTURING', …)` gates
  go-live on the manufacturing track alone. So a manufacturing-only partner reaches 100% and goes live
  without ever touching co-packing. Manufacturing-only is already a complete, first-class path in the
  engine.

**4. The product flow never forces a co-packer.**
- CP-5's auto-default only fires when the partner has an ACTIVE COPACKING service
  (`card-actions.ts resolveEligibleCoPackers`); a manufacturing-only partner has none, so
  `coPackerServiceId` stays null and the product self-assembles.
- The product-builder co-packer picker (`PackagingPicker.tsx`) renders only when
  `coPackers.length > 0`. Manufacturing-only ⇒ no eligible co-packers ⇒ the control is not shown.
- Routing: `deriveItemDispatch` falls back to the manufacturer for assembly, so even a small
  producer's variety pack self-assembles at zero co-pack cost. The co-pack price only ever appears
  when a SEPARATE co-packer is pinned (CP-3/CP-6, and only behind the flag).

## The one real gap (fixed): copy that blurred manufacturing vs co-packing

The terse subtitles could make a producer who fills and packs their OWN product wrongly pick
co-packing ("Fill & package" reads like what a self-packing honey maker does). Fixed:

- `ApplicationWizard.tsx`: Manufacturing sub `Make from scratch` → **"Make, fill & pack your own
  product"**; Co-packing sub `Fill & package` → **"Fill & pack OTHER brands' products"**.
- `YourBusinessSection.tsx`: Manufacturing description now says **"including filling and packing your
  own product"**; Co-packing now says **"You fill and pack OTHER brands' or creators' products. Not
  needed if you only pack your own."**; and the "What do you do?" hint now says **"Most partners start
  with just one: manufacturing already covers filling and packing your own product, so you only need
  co-packing if you pack for other brands."**

## Not changed (deliberately)

- The Services workspace "+ Co-packing / + Print production" add chips stay: they are clearly an
  optional "add another service" affordance, not a completeness nag.
- No schema or logic change was needed; the guard rails already hold. This was a copy-only fix.

## Product principle to preserve going forward

Co-packing is a tool the platform reaches for on the creator's behalf when a specific ORDER needs a
decomposition the manufacturer cannot do alone (a multipack past their line, or a print MOQ they
cannot meet, the honey-problem). It is never a station every partner must staff. A one-person operation
runs on iLaunchify as a MANUFACTURING service that makes, fills, and packs its own product, and borrows
a co-packer or printer only when an order requires it, which is a benefit handed to them, not a
requirement imposed on them.
