# C8 — Design Studio Asset Rules + Compliance Feedback UX

**Paste prompt at the bottom into Claude Code. Builds on C6 (consent capture) + C7 (asset library) and follows the locked compliance-UX pattern (see `docs/design/COMPLIANCE_UX_PRINCIPLES.md`).**

## Why this slice exists

The asset library shipped in C7 needs creator-facing surfaces and enforcement rules. C8 wires:
1. Context-aware filtered drawer (only show relevant assets per partner + product + market + substrate)
2. Variant chooser per asset (Color / B&W / Outline / contentual sub-variants)
3. Canvas object rules (aspect lock + color lock + size enforcement + clear space + required co-text)
4. Compliance feedback UX following the "quiet by default, loud when wrong" pattern
5. Pre-flight checklist at Export + Compliance HUD + Compliance score

The compliance-UX pattern is the load-bearing design choice — without it the creator drowns in legalese and ignores the system. With it, the creator designs freely and the system protects them silently until something needs attention.

~3 days for an experienced contributor.

## Prerequisites

- **C6** — partner doc vault + consent-at-claim flow. Required because every cert badge added to a label routes through the consent modal from C6.
- **C7** — asset library schema (CertificateAssetVariant + PackagingSymbol/Variant + LabelingSymbol/Variant). C8 reads from this library.

## What's in scope

### 1. Filtered asset drawer

Context-aware filtering across 5 axes. Drawer only shows assets where ALL apply:

| Axis | Driver | What gets filtered |
|---|---|---|
| Partner availability | `PartnerCertificateInstance` (status=VERIFIED) | Only certs the partner holds |
| Product category fit | `CertificateType.applicableCategorySlugs` | Only certs that apply to this product subcategory |
| labelingType fit | `CertificateType.applicableLabelingTypes` | FOOD vs SUPPLEMENT vs COSMETIC vs PET vs BABY |
| Market fit | `applicableMarketSlugs` ∩ `BrandTargetMarket` | US-only certs hidden when product targets EU |
| Substrate fit (symbols only) | `PackagingSymbol.applicableSubstrates` ∩ selected packaging | Resin Code 1 only shows for PET; FSC only for paper |

Drawer is **organized into three tabs**:
- **Recommended for this product** — required + recommended items the creator hasn't yet placed
- **Other available** — items applicable but not required
- **Already on this label** — items currently placed (with badge count + jump-to action)

Empty-state messaging is meaningful: "No certificates apply to this product / packaging combination. Your partner doesn't hold certs valid for [category]. They can request to add new cert types in their Partner dashboard."

### 2. Variant chooser per asset

When the creator drags an asset onto the canvas (or clicks "Add"), a variant chooser modal opens BEFORE the consent modal:

```
USDA Organic seal

Pick a variant:
[ Color (recommended) ]  [ Black & white ]  [ Reversed white ]

Contentual variant:
[ 100% Organic ]  [ Organic ]  [ Made with Organic [X] ]

Approved color spec: Pantone 348 C green / Pantone 1535 C brown
Minimum size on label: 0.5" (12.7 mm)
Required accompanying text: "Certified Organic by [agent name]"

[Cancel]  [Continue to consent]
```

After variant choice → consent modal (per C6) → badge renders on canvas.

### 3. Canvas object rules

Per asset object on the canvas:

- **Aspect ratio LOCKED** at drop time (Fabric.js `lockUniScaling: true` + `lockScalingX/Y` ratio preserved). Cannot be stretched / squished.
- **Color modification LOCKED.** Variant choice is the only re-color path. No custom color picker available on cert badge objects.
- **Size enforced.** `minWidthMm` / `maxWidthMm` from the variant. Refuse resize beyond bounds with toast: "USDA Organic seal must be at least 0.5\" tall (12.7 mm). Try a different variant if you need a smaller mark."
- **Clear space enforced.** `clearSpaceFactor × width` blank zone around the asset. Other objects refused placement within zone; existing objects flagged in compliance scan if encroaching.
- **Required co-text auto-paired.** When variant has `requiredCoText`, a linked text object is created automatically. Cannot be deleted independently. Moves with the badge. Font size meets brand standards minimum.

### 4. Compliance feedback UX — quiet by default

Five-surface architecture from `docs/design/COMPLIANCE_UX_PRINCIPLES.md`:

**A. Compliance HUD pill (top bar, ambient).** Always present, top of canvas:
- Green ✓ "Compliant" when all-clean
- Amber ⚠ "2 warnings" when warnings exist (click expands panel)
- Red 🛑 "1 blocker" when required items missing (click expands panel)

**B. Compliance score (small, always visible).** A single 0-100 number with traffic-light color. Green ≥ 95, amber 80-94, red < 80. Computed from existing `scanLabelCompliance` results: 60% required items + 25% recommended items + 15% best practice items. Click → compliance panel.

**C. Inline canvas warnings.** When an object violates a rule, a small contextual badge appears NEXT to the object (extending ObjectActions chrome from DS-60d):
- "USDA seal too small — drag to enlarge or [Auto-fix]"
- "Missing required attribution — [Add 'Certified by...']"
- "Off-spec color — [Use approved variant]"

One sentence. Plain English. Always with an auto-fix or "I'll handle it" option. Citation hidden behind a small (?) tooltip.

**D. Pre-flight checklist at Export.** Restructure the existing ExportModal compliance output:

```
Ready to print? Here's what we checked:

✓ All FDA-required elements present (8 of 8)
✓ Min font sizes met
✓ Cert claims have your consent records
✓ Allergen statement matches your recipe
✓ Net quantity formatted correctly
✓ Required co-text paired with cert badges
⚠ 1 recommended item missing — Resin Code 1 (PET) for plastic bottle

[Add Resin Code]    [Skip and proceed]
```

Green ticks dominate. Yellow warnings inline with one-click resolution. Red blockers prevent Export until resolved (with same one-click resolution).

**E. "Why this rule?" tooltips.** Every rule has an expandable detail with CFR citation + one-line plain-English explanation. Collapsed by default. The creator never sees a regulation citation in the primary flow — only if they explicitly ask.

### 5. Outcome-framed copy pass

Rewrite all existing `scanLabelCompliance` messages from regulation-framed to outcome-framed. ~40 rules × 30 min each = ~3 hours of careful copy work.

Pattern:
- **Don't:** "21 CFR §101.4(b)(2) requires the ingredient statement be in descending order of predominance by weight."
- **Do:** "Ingredients should be listed in order from most to least. We've sorted them — review or [Reset to my order]."

Each rule's existing structured-output now carries both forms — `regulationText` (for the tooltip) and `outcomeText` (for primary surface).

### 6. Compliance scanner extensions

Extend `scanLabelCompliance` (in `packages/ui/src/canvas/compliance.ts`) with new checks:

- Missing required symbol for product+market+substrate combination
- Asset placed outside primary display panel when PDP-required (uses `autoDetectLabelSections` from DS-72a)
- Asset rendered below min size or above max size
- Aspect-ratio violation (defensive; should not happen with canvas lock)
- Missing required co-text (e.g., USDA Organic without "Certified by [agent]")
- Co-text not in proper proximity (within clearSpaceFactor × 2 of the badge)

### 7. Submit-for-production opportunity prompt

When the creator clicks Export (or Next per the H1 checkout step), one prompt fires:

```
Hold on — you have 3 verified claims available that you haven't added:

USDA Organic · Non-GMO Project Verified · Kosher OU

Adding these can increase shelf appeal and customer trust. Each requires
your individual consent (per Creator Agreement §3).

[Review and add]   [Continue without]
```

If they click Review, sequential consent modals fire (one per cert).

## What's NOT in scope

- No automatic OCR / color detection of off-spec rendering (would require pixel-level analysis; V2)
- No real-time brand-standards-document fetch (we use the C7 captured metadata)
- No automated cert body API verification of cert currency (manual admin review only)
- No multi-surface PDP detection beyond what `autoDetectLabelSections` already supports
- No A/B testing of compliance message copy (worth post-launch experiment)

## Implementation notes

### Files to touch

- `apps/creator/src/app/studio/...` — Design Studio shell, drawer, ObjectActions chrome
- `packages/ui/src/canvas/compliance.ts` — extend `scanLabelCompliance` with new checks
- `packages/ui/src/canvas/asset-rules.ts` (NEW) — canvas object rule enforcement (aspect lock, color lock, size, clear space, co-text)
- `packages/ui/src/canvas/compliance-score.ts` (NEW) — score computation from scan results
- `apps/creator/src/app/studio/ComplianceHUD.tsx` (NEW) — top-bar pill
- `apps/creator/src/app/studio/PreflightChecklist.tsx` (NEW) — restructured ExportModal scan output
- `apps/creator/src/app/studio/AssetDrawer.tsx` — extend with filtering + 3-tab organization + variant chooser

### Server actions

- `getRecommendedAssetsForProduct(productTemplateId, packagingId)` — returns filtered asset list across all 5 axes
- `recordVariantChoice(designVersionId, assetVariantId, instanceData)` — captures which variant was used (audit + reproduction)
- `recordLabelClaimConsent` — already shipped in C6; reuse

### RSC boundary

`ComplianceHUD`, `PreflightChecklist`, `AssetDrawer` are client components. Lucide icons imported inside them (memory `ilaunchify-rsc-boundary-config`).

### Reapproval-marked behavior

Adding / removing a cert claim on a PUBLISHED product label triggers `PUBLISHED → PENDING_EDIT_REVIEW`. Per existing approval pattern.

## Verify before reporting done

```bash
pnpm --filter @ilaunchify/creator typecheck
pnpm --filter @ilaunchify/ui typecheck
pnpm --filter @ilaunchify/db typecheck
```

Manual smoke test (after C6 + C7 land + variant catalog seeded):

1. Sign in as creator with Builder tier. Open Design Studio on a partner product with 4 VERIFIED certs.
2. Confirm asset drawer shows "Recommended for this product" tab with applicable certs only.
3. Drag USDA Organic seal onto canvas. Variant chooser fires. Pick "Color · 100% Organic." Continue to consent. Add to label.
4. Confirm `LabelClaimConsent` row + audit log entries.
5. Confirm aspect-ratio lock — try to stretch the seal horizontally; should refuse.
6. Confirm size lock — try to shrink below 0.5"; should refuse with helpful toast.
7. Confirm clear-space — try to place text within 25% of seal width; should warn.
8. Confirm required co-text auto-appeared next to seal; cannot be deleted independently.
9. Compliance HUD shows green when all clean; flips amber when you intentionally violate a rule.
10. Click Export. Pre-flight checklist appears with full summary. If a recommended item is missing, "Add" button works.
11. Verify "Why this rule?" tooltip is the only place CFR citations appear.

## Commit

```
/ship "C8 design studio asset rules — filtered drawer + variant chooser + canvas object rules + compliance UX (HUD + score + inline + pre-flight) + outcome-framed copy"
```

After commit, Pavel housekeeping:

```
Pavel:
  restart next dev
  smoke-test the full Design Studio + Export flow per the brief
  verify compliance copy is outcome-framed across all ~40 rules
```

## Paste-ready prompt for Claude Code

```
Ship C8 — Design Studio Asset Rules + Compliance Feedback UX. Brief at
docs/builds/certificates-c8-design-studio-asset-rules.md. Compliance UX
pattern locked at docs/design/COMPLIANCE_UX_PRINCIPLES.md (quiet by
default, loud only when wrong). Memory:
ilaunchify-compliance-ux-pattern, ilaunchify-asset-library-pattern,
ilaunchify-cert-liability-pattern.

Major pieces:

1. Filtered asset drawer — context-aware across 5 axes (partner
   availability + product category + labelingType + market + substrate).
   Three tabs: "Recommended for this product" / "Other available" /
   "Already on this label". Meaningful empty state.

2. Variant chooser modal per asset (Color / B&W / Outline + contentual
   sub-variants). Shows approved color spec + min size + required
   co-text. Fires BEFORE consent modal.

3. Canvas object rules per asset:
   - Aspect ratio LOCKED at drop
   - Color modification LOCKED (variant choice only)
   - Size enforced (refuse resize beyond min/max)
   - Clear space enforced (refuse placement within zone)
   - Required co-text auto-paired and unbreakable

4. Compliance UX (the load-bearing piece):
   a. ComplianceHUD pill in top bar — green/amber/red + count
   b. Compliance score (0-100) — small, always visible, click expands
   c. Inline canvas warnings on selected objects with violations
   d. Pre-flight checklist at Export — restructured ExportModal summary
   e. "Why this rule?" tooltips — citations hidden by default

5. Outcome-framed copy pass — rewrite all ~40 scanLabelCompliance
   message strings from regulation-framed to outcome-framed. Each rule
   carries both forms (regulationText for tooltip, outcomeText for
   primary).

6. Compliance scanner extensions in packages/ui/src/canvas/
   compliance.ts: missing required symbol, asset outside PDP, off-size,
   missing required co-text, co-text proximity violation.

7. Submit-for-production prompt — "You have N unused verified claims
   available" with sequential consent flow.

NEVER auto-stamp. Per-cert consent (LabelClaimConsent from C6) required
before any badge renders. NEVER show CFR citations in the primary flow.

Verify: typecheck across creator + db + ui packages.

Then /ship "C8 design studio asset rules — filtered drawer + variant
chooser + canvas object rules + compliance UX (HUD + score + inline +
pre-flight) + outcome-framed copy".
```
