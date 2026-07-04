# Creator Design Studio — "Product details" drawer (proposal)

**Date:** 2026-07-04. Answers: *rebuild the Creator-mode "Product Spec" drawer into a
Printify-style "Important product information" panel — compact, informative, well-organized —
and should we merge the Label + Phrases tabs?* Grounded in the current code + POD/UX research.

## TL;DR

**Yes — worth doing.** Today the "Product Spec" drawer is print-only (a bleed/trim/safe
diagram + a dimensions table + template downloads). It ignores everything *else* the creator
picked in the marketplace product builder (manufacturer, pricing/MOQ, domain, net quantity,
allergens…). Rebuild it into a **"Product details"** reference panel that gathers the info a
creator actually needs while designing, organized with **progressive disclosure** (a couple of
always-visible essentials + collapsible sections). And **yes, merge Label + Phrases** into one
**"Label & Compliance"** tab — they're the same regulated-content workflow.

## Current state (from the code)

- Rail tool **`product`** → `ProductDrawer` → **`ProductSpecCard`** ("Vistaprint-style"):
  safe-area diagram, Bleed/Trim/Safe dimensions table, **Download blank template** (PDF/SVG),
  plus `SurfacesSection` and a Templates entry-point. **Print-spec only.**
- Rail tool **`label`** → `LabelDrawer`: the facts panel (nutrition / supplement / pet / OTC),
  add-panel, cert badges, allergens, net quantity context.
- Rail tool **`phrases`** → `PhrasesDrawer`: mandatory phrases by domain + `ClaimSuggestions`.
- These four (`product`, `label`, `components`, `phrases`) are **creator-only** (already hidden
  in template-author/admin mode via `TEMPLATE_AUTHOR_HIDDEN`), so this redesign is Creator-scoped.

The gap: the product the creator configured in the marketplace builder carries far more decided
context (owner-pinned manufacturer, tier pricing, MOQ, fulfillment mode, domain, sample policy,
allergens) — none of it surfaced in the studio. Printify's panel shows exactly this class of
"decided facts you reference while designing": product + provider, "fulfilled by", production
cost breakdown, print-area px + DPI, download template.

## What the research says

- **Progressive disclosure** — reduce cognitive load by showing essentials first and revealing
  the rest on demand (accordions/collapsibles), grouped by the user's goals (validate via card
  sorting), while keeping hidden items discoverable.
  ([LogRocket](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/) ·
  [UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/) ·
  [IxDF](https://ixdf.org/literature/topics/progressive-disclosure))
- **Printify Product Creator** — the side panel is a **real-time reference**: variants, print
  areas, **pricing**, **design requirements (px/DPI)**, and **Download design template** — a
  compact info surface, not an editing form. ([Printify Product Creator](https://printify.com/product-creator/))

## Proposed "Product details" drawer

Replace `ProductSpecCard`'s narrow print card with a compact, **accordion** panel. Header shows
identity always; the rest are collapsible (first one open by default). Everything is read-mostly
reference — no heavy editing here.

```
PRODUCT DETAILS                                   (rail label: "Details", info-icon)
┌───────────────────────────────────────────────┐
│  [thumb]  {Product name}                       │  ← always visible (identity)
│           {Category} · {Domain chip}           │
│           Made by {Manufacturer}  ·  {tier}     │
├───────────────────────────────────────────────┤
▸ Production & pricing              (collapsible) │  per-unit at MOQ · fulfillment mode
│    From ${unit}/unit · MOQ {n} · lead {d}d      │  (bulk / on-demand) · Samples →
├───────────────────────────────────────────────┤
▾ Print spec                        (open first)  │  ← the current ProductSpecCard content
│    [bleed/trim/safe diagram]                    │
│    Bleed / Trim / Safe  W×H (mm + px) · {DPI}   │
│    Download blank template  [PDF] [SVG]         │
│    Surfaces: {front …}                          │
├───────────────────────────────────────────────┤
▸ Compliance essentials             (collapsible) │  Label type · Net quantity · Allergens
│    Required: {label type}                       │  Required marks/certs · "Open Label &
│    Net qty {…} · Allergens {…}                  │   Compliance →" (jumps to that tab)
└───────────────────────────────────────────────┘
```

Data sources (all already decided upstream — no new inputs from the creator):
- **Identity / manufacturer / tier / domain** — ProductTemplate + owner-pinned manufacturer
  (`ProductTemplate.manufacturerServiceId`) + category `labelingType`.
- **Pricing / MOQ / fulfillment** — pricing tiers + OrderSettings MOQ; **Samples** links to the
  sample flow.
- **Print spec** — the existing `DieCutSpec` (bleed/trim/safe, px, DPI) + PDF/SVG generators.
- **Compliance essentials** — net quantity, allergens, required label type + required marks
  (read-only summary; the *editing* lives in the Label & Compliance tab).

Why this shape: identity + print spec are what a creator references most (keep them prominent);
pricing and compliance are "good to glance at" (collapsed). That's the essential-vs-advanced
split progressive disclosure calls for.

## Merge Label + Phrases → "Label & Compliance"

**Recommended — yes.** A creator's mental model is "make my label compliant," not "labels in one
tab, phrases in another." Both are the regulated-content workflow (facts panel + mandatory
phrases + claims), both are Creator-only, and both key off the same `labelingType`.

New single tab with three **sub-sections (accordions)** so nothing is lost:

```
LABEL & COMPLIANCE
  ▾ Facts label        (LabelDrawer: nutrition/supplement/pet/OTC panel, add panel, cert badges)
  ▸ Mandatory phrases  (PhrasesDrawer: required phrases by domain)
  ▸ Claims             (ClaimSuggestions)
```

**Pros:** fewer rail tools (−1), the compliance workflow lives in one place, matches how the
creator thinks, plays to progressive disclosure. **Cons / mitigations:** the merged panel is
taller → use collapsibles (only one open at a time) so it never feels heavy; keep clear
sub-headers so phrases don't feel buried. Net: do it, but as **grouped accordions, not a flat
mash**.

Result: the creator rail's product-context tools go from **Product Spec · Label · Phrases ·
Components** → **Details · Label & Compliance · Components** — more compact, better grouped.

## Phasing

1. **Rebuild the drawer** — ✅ **BUILT 2026-07-04.** `ProductDetailsDrawer` (identity header +
   Production&pricing / Print spec / Compliance accordions) replaces `ProductSpecCard` in
   `ProductDrawer`; loader (`canvas/page.tsx`) now derives `productMeta` (category + owner-pinned
   manufacturer + entry-tier pricing/MOQ) and threads it through the shell. Rail tool stays
   labelled **"Product"** (per Pavel). Pricing shown (collapsed); compliance = read-only summary +
   jump link. Dead `ProductSpecCard`/`SpecRow`/orphaned helpers removed.
2. **Merge Label + Phrases** — ✅ **BUILT 2026-07-04.** The `label` rail tool is relabelled
   **"Label & Compliance"** and now renders `LabelDrawer` + `PhrasesDrawer` as two collapsible
   `CollapseSection`s (Facts label open by default · Mandatory phrases collapsed; children stay
   mounted so state survives collapsing). The standalone `phrases` rail entry was removed.
3. **Polish** — one-open-at-a-time accordions, "Open Label & Compliance →" jump from the Details
   compliance summary, remember last-open section.

## Open questions

1. **Pricing visibility** — show per-unit-at-MOQ + fulfillment mode in the studio, or keep
   pricing out of the design surface entirely? (Printify shows it; some creators find it noisy.)
2. **Compliance essentials in Details** — read-only summary that *links* to the Label &
   Compliance tab (recommended), or fully inline?
3. **Rail label** — "Details" (Printify's "Important product information", shortened) vs
   "Product" vs "Overview"?

## Sources
- Printify Product Creator — https://printify.com/product-creator/
- Progressive disclosure (LogRocket) — https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/
- Progressive disclosure (UXPin) — https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/
- Progressive disclosure (IxDF) — https://ixdf.org/literature/topics/progressive-disclosure
