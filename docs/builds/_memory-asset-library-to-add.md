# Memory file to add — Pavel, drop into `.claude/memory/`

Cowork can't write into `.claude/memory/` (protected path). Copy block below into:

`.claude/memory/ilaunchify-asset-library-pattern.md`

Plus the index entries at the bottom.

---

## File — `.claude/memory/ilaunchify-asset-library-pattern.md`

```markdown
---
name: ilaunchify-asset-library-pattern
description: "Asset Library scope: certs + packaging symbols + labeling symbols under unified schema family. Admin-curated approved variants per asset (color/B&W/contentual sub-variants). Filtered drawer in Design Studio (partner availability + product category + market + substrate axes). Canvas object rules (aspect lock + color lock + size enforcement + clear-space + required co-text auto-pair). NEVER auto-stamp; per-cert consent via C6."
metadata:
  type: project
---

The platform's approach to managing certification badges, packaging symbols, and labeling symbols. Locked 2026-06-01 after the conversation about size rules, multi-placement, variant management, and filtered drawer.

## Scope — three asset families under unified pattern

- **Certificate badges** — USDA Organic, Non-GMO, Kosher, Vegan, Fair Trade, etc.
- **Packaging symbols** — Resin Recycling Codes 1-7, Green Dot, How2Recycle, BPI Compostable, FSC, recycling triangle, etc.
- **Labeling symbols** — "Refrigerate after opening", country-of-origin marks, allergen icons, Prop 65 warnings, BE disclosure mark, "Distributed by" attribution, etc.

All three use the same admin curation pattern + same creator picker pattern + same canvas enforcement rules. Don't fragment them.

## Schema family

- `CertificateAssetVariant` (per `CertificateType`) — color/B&W/outline + contentual sub-variants like OU-D, 100% Organic
- `PackagingSymbol` + `PackagingSymbolVariant` — with `applicableSubstrates` (PET/glass/aluminum/paper) + `applicableMaterials` (bottle/pouch/folding-carton) + `applicableMarkets` + `requiredWhen` / `recommendedWhen` rules
- `LabelingSymbol` + `LabelingSymbolVariant` — same shape

Each variant carries:
- SVG file (R2)
- Raster preview (PNG thumbnail)
- `minWidthMm` + `maxWidthMm` per cert body brand standards
- `approvedColorSpec` (Pantone / CMYK / RGB)
- `requiredCoText` (e.g., USDA Organic requires "Certified by [agent]")
- `clearSpaceFactor` (e.g., 0.25 = 25% of width clear on all sides)
- `aspectRatioLocked` (always true for cert marks)
- `brandGuidelinesUrl`

## Filtered drawer in Design Studio (the load-bearing UX)

Context-aware filtering across 4 axes — drawer ONLY shows assets where ALL apply:

1. **Partner availability** — only certs the partner has VERIFIED `PartnerCertificateInstance` for
2. **Product category fit** — `CertificateType.applicableCategorySlugs` matches product subcategory
3. **labelingType fit** — matches FOOD / SUPPLEMENT / COSMETIC / etc.
4. **Market fit** — `applicableMarketSlugs` includes one of the product's `BrandTargetMarket` rows
5. **Packaging substrate fit** — for symbols only — `PackagingSymbol.applicableSubstrates` matches selected packaging substrate

Empty state gets meaningful messaging — not "no items" but "No certificates apply to this product / packaging combination. Your partner doesn't hold certs valid for [category]. They can request to add new cert types in their Partner dashboard."

## Compliance scanner extensions

- Flag missing REQUIRED symbols (e.g., plastic bottle in CA missing Resin Code per SB 343)
- Flag missing required attributions (e.g., "Distributed by" per 21 C.F.R. §101.5)
- Flag asset placed outside primary display panel when PDP-required
- Flag off-size assets (below min or above max per variant)
- Flag aspect-ratio violations (shouldn't happen with canvas lock)
- Flag missing required co-text (e.g., USDA Organic without "Certified by [agent]")

Existing infrastructure (`scanLabelCompliance`, `autoDetectLabelSections`) extends naturally.

## Canvas object rules (Design Studio enforcement)

Per asset object on the canvas:

- **Aspect ratio LOCKED** at drop time. Cannot be stretched / squished.
- **Color modification LOCKED.** Variant choice (Color / B&W / Outline) is the only re-color path. No custom color picker.
- **Size enforced** — refuse resize below `minWidthMm` or above `maxWidthMm`.
- **Clear space enforced** — refuse placement of other objects within `clearSpaceFactor × width` zone around the asset.
- **Required co-text auto-paired** — text object linked to badge; cannot orphan; must move together; must meet font-size minimums.
- **Required content vs PDP zone** — if asset has `requiredOnPDP: true`, compliance scan flags placement outside PDP.

## Consent-at-Claim — non-negotiable

Per memory `ilaunchify-cert-liability-pattern`: NEVER auto-stamp. Every cert badge added to a label requires per-cert affirmative consent via the consent modal. The asset library makes badges AVAILABLE; the consent flow gates each USE.

## Multi-placement

Real packaging often carries the same cert on multiple panels (front for marketing, back for formal attribution block). The consent modal fires ONCE per cert type added to the design, regardless of how many times it's placed on the canvas. Compliance scanner can flag "missing instance in primary display zone" if creator placed it only in secondary panels.

## Variant research

A one-time task per cert type — admin or contractor sources approved SVG variants from each cert body's brand standards document, records metadata per the schema above. See `docs/builds/certificates-variant-research-spec.md`. Decoupled from build sequence — can run in parallel with C7/C8.

## Trademark + license-fee posture

See `docs/legal/LEGAL_AUTHORITIES.md` §13. Default posture is Option B (platform hosts library; partners use under their existing cert-body license). Some certs (notably Non-GMO Project) may require Option C (platform-level license negotiation) or fall back to Option A (partner uploads their own artwork). Counsel confirms per cert before going live.

## See also

- `docs/builds/_certificates-roadmap.md` — full slice plan
- `docs/builds/certificates-c7-asset-library.md` — admin curation slice (when written)
- `docs/builds/certificates-c8-design-studio-asset-rules.md` — design studio enforcement slice (when written)
- `docs/builds/certificates-variant-research-spec.md` — contractor research brief
- `docs/legal/LEGAL_AUTHORITIES.md` §13 — trademark + license-fee considerations
- [[ilaunchify-cert-liability-pattern]] — consent-at-claim + no auto-stamp rule
- [[ilaunchify-certificates-declare-only]] — cert module scope lock
```

---

## Append to `.claude/memory/MEMORY.md` (Project context section)

Add this line near the bottom of `## Project context`:

```
- [Asset library pattern — certs + packaging + labeling symbols](ilaunchify-asset-library-pattern.md) — Admin-curated approved SVG variants per asset (color/B&W/contentual sub-variants). Filtered Design Studio drawer (partner availability + product category + market + substrate). Canvas object rules (aspect lock + color lock + size enforcement + clear-space + required co-text). NEVER auto-stamp.
```

---

## Append to `.claude/memory/INDEX.md` under `### Phases`

```
- `ilaunchify-asset-library-pattern.md` — Asset library scope + filtered drawer + canvas enforcement rules
- `ilaunchify-compliance-ux-pattern.md` — Quiet by default, loud when wrong, comprehensive only at commit, never legalese
- `ilaunchify-on-demand-business-model.md` — Second fulfillment track; Pattern A.5 payment; free creator tier; per-tier % fee; zero MOQ
- `ilaunchify-fulfillment-mode-terminology.md` — Locked labels (Bulk production / On-demand drop-ship / Both); picker in step 3; mode pill in editor; capability gating
```

---

## File 3 — `.claude/memory/ilaunchify-on-demand-business-model.md`

```markdown
---
name: ilaunchify-on-demand-business-model
description: "On-demand drop-ship is iLaunchify's second fulfillment track. Per-product partner-controlled fulfillmentMode flag (BULK_PRODUCTION | ON_DEMAND | BOTH). Creator publishes to any channel; channel order → iLaunchify → partner drop-ships. Pattern A.5 payment (channel pays creator → iLaunchify invoices creator post-fulfillment → iLaunchify pays partner). Free on-demand on every tier; lower platform-fee % is the upgrade incentive. Zero MOQ. Spec at docs/builds/ON_DEMAND_BUSINESS_MODEL.md. Pricing at docs/builds/on-demand-pricing-economics.md."
metadata:
  type: project
---

iLaunchify has TWO fulfillment tracks, both permanent: BULK_PRODUCTION (original — creator pays upfront for batch run) and ON_DEMAND (new V1.5+ — channel order triggers single-unit drop-ship by partner). Same platform, same partners, same creators, same Stripe Connect — different `ProductTemplate.fulfillmentMode` enum.

## Locked decisions (V1.5)

- **fulfillmentMode is per-product, partner-controlled.** Partner toggles per SKU. Onboarding gates the capability; per-product toggle uses it.
- **All channels** — Shopify (V1.5) → Amazon + Etsy (V2) → TikTok Shop + WooCommerce (V2.1).
- **Pattern A.5 payment intermediation** — Channel pays creator's bank directly; iLaunchify invoices creator post-fulfillment via Stripe Connect Customer for (partner cost + shipping + platform fee); iLaunchify pays partner via Stripe Connect Transfer. iLaunchify never becomes Merchant of Record for end-buyer transaction.
- **Free on-demand for creators.** Maker tier gets on-demand at 15% platform fee. Builder at 10%. Agency at 7%. Lower fee = upgrade incentive (matches Printify/Supliful industry pattern).
- **Partner per-order fee tied to PartnerTier:** Verified 5% / Trusted 3.5% / Premier 2% of wholesale. No partner subscription. Lower fee = upgrade incentive.
- **Returns: partner-eats defects; customer-eats remorse.** Codified in Partner Agreement Schedule X addendum.
- **Zero MOQ.** True on-demand. Single-unit orders the standard.
- **Sample orders at cost** (single unit; partner wholesale + shipping; no platform fee). Capped 10/product/month/creator.
- **Inventory: show "Out of stock"** with notify-me capture; admin Marketplace Management module override available to force-hide.
- **Per-channel pricing** — Amazon take rate > Shopify; per-channel pricing matters.

## Locked Printify-adopted patterns

- **Default profit margin** — 40% suggested global default per creator; warning at 25%; hard floor at 20% (server refuses below).
- **Order submission timing** — 1-hour auto-submit default; Manual / 1h / 24h / Specific-time-daily / Daily-digest options. Sample + bulk + flagged orders always manual.
- **Order routing (V2)** — checkbox + max-additional-cost ceiling + match-strictness toggle, mirroring Printify pattern.
- **Pricing transparency** — production cost + shipping + platform fee shown as separate lines (iLaunchify wedge vs Printify/Supliful opacity).

## Architecture

NEW models:
- `ChannelOrder` — every fulfilled-via-channel order with status FSM (RECEIVED → SUBMITTED → IN_PRODUCTION → SHIPPED → DELIVERED + variants for CANCELED/RETURNED/REFUNDED)
- `OnDemandPreferences` per creator — default margin + order submission timing + tracking notifications + routing prefs
- `PublishedProduct` — per (productTemplate, channelConnection) — tracks what's live where

EXTENDED on `ProductTemplate`:
- `fulfillmentMode` enum: `BULK_PRODUCTION | ON_DEMAND | BOTH` (default BULK_PRODUCTION)
- `recipeLocked` boolean — true for on-demand supplements (Mode 3 declared panel)
- `onDemandWholesaleCost`, `onDemandLeadTimeDays`, `onDemandMaxDailyCapacity`
- `onDemandInventoryStatus` enum

NEW partner field: `Partner.onDemandCapabilityVerified` boolean. Set during onboarding sub-section. Required before any product-level fulfillmentMode = ON_DEMAND.

## Critical rules — do NOT violate

- **NEVER let iLaunchify become Merchant of Record** for end-buyer transaction. Channel is always MOR. iLaunchify intermediates the B2B (creator → partner) transaction only. Pattern A.5 is non-negotiable.
- **NEVER auto-submit Sample, Bulk, or Flagged orders.** Per Printify-adopted pattern. Creator always reviews.
- **NEVER allow publish below 20% margin floor.** Server refuse with clear error.
- **NEVER show opaque cost to creator** — always break out production + shipping + platform fee. Transparency is the wedge.
- **NEVER lock features by tier on on-demand.** Lock MARGIN by tier. All tiers get access; higher tiers get better per-order economics.

## Why this matters

Adding on-demand expands TAM dramatically — captures the smaller-audience creator segment (sub-50k followers) that won't take inventory risk. Aligns with proven Supliful + Printify economics. Locks iLaunchify's "transparent + cross-vertical + integrated Design Studio + Pooled-V2-Inventory-as-moat" wedge against incumbents.

V2 pooled inventory becomes the orchestration thesis made operational: same partner inventory serves 50 creators' branded SKUs → economy of scale + fast fulfillment → creator-visible value that competitors can't match without similar pooling.

## What changes the analysis

If iLaunchify ever moves to Pattern B (true Marketplace Facilitator becomes MOR for end-buyer transactions), the analysis flips dramatically — sales tax nexus in every state, Bolger-strict-liability platform creep, end-buyer indemnification load. Don't do this without a major counsel pass.

## See also

- `docs/builds/ON_DEMAND_BUSINESS_MODEL.md` — full architectural spec
- `docs/builds/on-demand-pricing-economics.md` — locked pricing model + cost protection
- `docs/legal/LEGAL_AUTHORITIES.md` — applies unchanged (cert chain, KYB, GDPR)
- [[ilaunchify-cert-liability-pattern]] — cert claim flow works the same on on-demand products
- [[ilaunchify-kyb-document-collection]] — on-demand partners need same KYB documents
- [[ilaunchify-compliance-ux-pattern]] — applies to all on-demand surfaces
- [[ilaunchify-orchestration-thesis]] — V2 pooled inventory is the moat
```

---

## File 4 — `.claude/memory/ilaunchify-fulfillment-mode-terminology.md`

```markdown
---
name: ilaunchify-fulfillment-mode-terminology
description: "Locked terminology + UX placement for the fulfillment mode picker. Three modes: Bulk production / On-demand drop-ship / Both. Picker lands in 'How it ships' step (3 of 4) of the partner Create Product stepper, with 'Both' as recommended default + on-demand-only locked behind onboarding capability gate. Editor reflects current mode via a pill in the top bar; cards render differently per mode."
metadata:
  type: project
---

Locked 2026-06-01 after the on-demand business model discussion. Terminology + UX placement is consistent across product creation, editor, marketplace display, admin reviews — never re-invent the labels or the placement.

## The three modes — locked labels

| Schema enum | Partner-facing label | Creator-facing label | Default |
|---|---|---|---|
| `BULK_PRODUCTION` | Bulk production | Pre-order with bulk discount | Default for new partners |
| `ON_DEMAND` | On-demand drop-ship | Sell on your channels (drop-ship) | Requires capability unlock |
| `BOTH` | Both — creators choose | Either way | RECOMMENDED for partners with the capability |

NEVER use: "direct sell", "production order", "wholesale", "POD", "made-to-order", "made-to-stock". Only the three locked labels above.

## Placement in the partner Create Product flow

The fulfillment-mode picker lives as the FIRST section of **"How it ships"** (step 3 of 4) in the partner Create Product stepper.

Three radio cards in this order:
1. **Bulk production only** (Default tag)
2. **Both — creators choose** (RECOMMENDED tag, selected by default for capable partners)
3. **On-demand drop-ship only** (Requires capability — locked with inline unlock CTA if `Partner.onDemandCapabilityVerified = false`)

Each card has:
- Icon (Lucide: ti-stack-3 for bulk, ti-rocket for both, ti-bolt for on-demand)
- Name + tag
- One-sentence plain-English description of what the mode means for the partner
- Three small "perks" / characteristics with icons
- Locked-state inline note with link to unlock when gated

Below the cards: an info pill saying "Most partners pick Both because it lets you serve both the small-volume drop-ship creator and the large bulk-order creator from the same product."

## What changes downstream by mode

| Mode | Step 4 "What it costs" shows | Editor cards rendered |
|---|---|---|
| BULK_PRODUCTION | MOQ-tier pricing matrix (current behavior) | All current cards + existing Variants & Pricing card with MOQ tiers |
| ON_DEMAND | Wholesale-per-unit + shipping rate field | All current cards + new On-Demand Settings card. No MOQ-tier card |
| BOTH | Both sections with subheaders "Bulk production pricing" + "On-demand wholesale pricing" | All cards. Variants & Pricing carries "Used for bulk orders" note; On-Demand Settings carries "Used for drop-ship orders" note |

## Editor top-bar pill

After save → partner lands in editor. Mode shown as a pill in the editor top bar: `Fulfillment: Both ▼`. Click → confirmation modal explaining consequences of switching (e.g., switching from BOTH to ON_DEMAND will hide MOQ tier configuration; existing slot data preserved but inaccessible).

Mode change writes an AuditLog row `FULFILLMENT_MODE_CHANGED` with from/to values + actor + reason (optional).

## Gating

- `BULK_PRODUCTION` mode: available to every active partner
- `ON_DEMAND` or `BOTH` modes: server refuses creation/transition unless `Partner.onDemandCapabilityVerified = true`. Capability is set in the partner onboarding On-Demand sub-section (per C6 KYB document collection memo extension)
- Capability verification requires: real-time inventory system attestation + sub-3-day fulfillment SLA commitment + returns handling capability + Stripe Connect Express completion

## Critical rules — do NOT violate

- NEVER show the on-demand options to a partner whose capability is not yet verified (locked + visible is fine; never hidden)
- NEVER let server create a product with `fulfillmentMode != BULK_PRODUCTION` for a partner without verified capability
- NEVER change the three labels without a Pavel-explicit re-lock decision (existing seed data + marketplace surfaces + admin reviews + creator-facing UI all assume these three labels)
- NEVER add a fourth fulfillment mode without architectural review (changes the entire payment flow)
- NEVER auto-default to BOTH for partners without verified capability — show Default tag on Bulk production only

## See also

- `docs/builds/ON_DEMAND_BUSINESS_MODEL.md` — full architectural spec
- `docs/builds/on-demand-pricing-economics.md` — pricing per mode
- [[ilaunchify-on-demand-business-model]] — business model lock
- [[ilaunchify-kyb-document-collection]] — capability verification section (Layer 3 extension)
```

---

## File 2 — `.claude/memory/ilaunchify-compliance-ux-pattern.md`

```markdown
---
name: ilaunchify-compliance-ux-pattern
description: "Compliance feedback UX rule: quiet by default, loud only when wrong, comprehensive only at commit, never legalese in the primary flow. Applies to every compliance surface — label, brand, ingredient, KYB, packaging. Five-surface architecture: HUD pill + score + inline + comprehensive + pre-flight + tooltips. Full spec at docs/design/COMPLIANCE_UX_PRINCIPLES.md."
metadata:
  type: project
---

The platform-wide design pattern for any surface that communicates rules, regulations, or compliance status. Locked 2026-06-01 after the cert + claim chain conversation. Applies wherever the platform tells a user whether they're following the rules.

## The core rule

**Quiet by default. Loud only when wrong. Comprehensive only at commit. Never legalese in the primary flow.**

A user designing / configuring correctly should NEVER see a regulation citation, a warning, or a long rule explanation in their main flow. The system protects them silently. They build trust through the system's silence.

A user who makes a mistake should see ONE plain-English sentence at the moment of mistake, with an auto-fix or "I'll handle it" option. Not a wall of text. Not a citation. Not scolding language.

A user at a commit moment (Export, Submit, Publish) should see ONE comprehensive summary with one-click resolution for anything missing. This is the only moment of full disclosure.

A user who asks "why?" (clicks the (?) tooltip) gets the CFR citation. NEVER unsolicited.

## The five surfaces

1. **HUD pill** (top bar, always present) — Green ✓ / Amber ⚠ / Red 🛑 + count. Glanceable.
2. **Compliance score** (always present, small) — 0-100 with traffic-light color. Green ≥ 95, amber 80-94, red < 80.
3. **Inline canvas warnings** (only at moment of violation) — One sentence, plain English, always with an action button.
4. **Pre-flight checklist** (once, at commit moment) — Full clean/warning/blocker summary with one-click resolution.
5. **"Why this rule?" tooltips** (only when explicitly clicked) — CFR citation + one-line plain-English explanation.

## The copy rules

- Outcome-framed, never regulation-framed
- One sentence, plain English
- Always actionable (auto-fix or "I'll handle it")
- Never scold (passive voice fine)
- Citations are reference, not requirement reading

## Anti-patterns — NEVER do these

- Modal walls of text when a popup with one sentence + action would do
- Multi-step compliance wizards when inline warnings would do
- Warnings without actions — complaints train users to ignore
- Regulation-framed copy in primary flow — kills trust + comprehension
- "Submit anyway" buttons on blockers without context — bypasses protection
- Required reading consent text that no human reads — sign-of-handwave
- Auto-fix that changes design without confirmation — surprise mutations break trust
- Compliance score that swings wildly with small changes
- HUD that flips green→red on a benign action — confidence-destroying

## Applies across all compliance domains

NOT just label compliance:
- Brand Identity Studio (banned words, contrast, type legibility)
- Partner Product Builder Ingredients card (banned ingredients, BE flag, high-%)
- Partner onboarding accordion (KYB document compliance per type)
- Admin product review queue (marketplace listing compliance)
- Production checkout (order manifest compliance)

Consistency across domains lets users learn the pattern once and trust it everywhere.

## Why this matters for liability

The compliance UX pattern reinforces the liability posture locked in [[ilaunchify-cert-liability-pattern]]:

- The platform performs verification / scanning. The platform surfaces the result. The user decides to commit.
- Outcome-framed copy = the user is making an informed choice in plain English, not a legal opinion.
- Citations hidden in tooltip = "we provided the rule for transparency; the user chose to act."
- Pre-flight checklist with one-click resolution = the user had every chance to fix.
- Consent modals at binding moments = the user accepted responsibility.

This pattern is what makes the platform's compliance-tooling-not-certification stance defensible (per `docs/legal/FDA_REGULATORY_POSTURE.md` + `docs/legal/LEGAL_AUTHORITIES.md` §11). If we showed walls of CFR text the user couldn't reasonably parse, we'd be claiming a level of authority that creates exposure. The "quiet by default" pattern frames us as a tool, not an authority.

## Implementation infrastructure

Today's `scanLabelCompliance()` in `packages/ui/src/canvas/compliance.ts` is the engine. Each rule returns:

```ts
{
  id, severity, category,
  outcomeText,        // for primary surfaces — one sentence, plain English
  regulationText?,    // for "Why this rule?" tooltip
  actions?,           // every warning has an action
  affectedObjectIds?, // for inline canvas surfacing
}
```

One scan → six surfaces. New compliance domains (brand, ingredient, KYB, packaging) extend this same registry. Same UI consumes any rule conforming to this shape.

## See also

- `docs/design/COMPLIANCE_UX_PRINCIPLES.md` — full design pattern reference
- `docs/builds/certificates-c8-design-studio-asset-rules.md` — first slice implementing this pattern in full
- [[ilaunchify-cert-liability-pattern]] — consent-at-claim flow (the "decision modal" surface)
- [[ilaunchify-asset-library-pattern]] — asset library + canvas object rules
```
