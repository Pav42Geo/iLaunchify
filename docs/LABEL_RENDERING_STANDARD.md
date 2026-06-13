# Label Rendering Standard (LOCKED intent 2026-06-13)

> Product labels are **regulated legal artifacts** (FDA 21 CFR, AAFCO), not UI.
> They must be built to exact spec, render **deterministically and isolated from
> app CSS**, and be **print-accurate**. No utility-class styling that another
> stylesheet can override. Getting a rule weight, column, footnote, or required
> element wrong is a compliance failure, not a cosmetic bug.

## The five label artifacts

| # | Label | Authority | Engine (math/content) | Renderer today | State |
|---|-------|-----------|------------------------|----------------|-------|
| 1 | Nutrition Facts | 21 CFR 101.9 (+ (j)(5) infant/child variants) | `@ilaunchify/nutrition` `calculateLabel` + `toPanelData` | `NutritionFactsRenderer` (React/Tailwind) | Built; **harden to standard** |
| 2 | Supplement Facts | 21 CFR 101.36 | `toSupplementPanelData` | `NutritionFactsRenderer` (table) | Built (most complete); **harden** |
| 3 | Drug Facts | 21 CFR 201.66 (OTC) | — (none) | `packages/ui/src/canvas/drugFactsPanel.ts` (partial) | **Not real; build** |
| 4 | INCI declaration | 21 CFR 701.3 (+ MoCRA) | `inci.ts` `toInciDeclaration` | none (text only) | **Build declaration block** |
| 5 | Guaranteed Analysis | AAFCO Model Regs | `pet.ts` `formatGuaranteedAnalysis` + adequacy statement | none (text only) | **Build formal block** |

## The professional bar (every label must meet all of these)

1. **Deterministic, style-isolated rendering.** The label must look identical
   regardless of surrounding app CSS. Use explicit inline styles / SVG with point
   sizes and rule weights set per the regulation — never Tailwind utilities that
   inherit or can be beaten on specificity. (The uppercase/grey-header bug came
   from a descendant `th` rule overriding utilities — that class of bug is banned.)
2. **Print-accurate.** Same renderer rasterizes to PDF/SVG at print resolution for
   actual label production (services/exports pipeline). Screen preview === print.
3. **Spec-faithful structure.** Required elements, ordering, indentation, rule
   weights (hairline vs 1pt vs heavy bar), column headers, and footnotes exactly
   per the CFR/AAFCO citation for that label.
4. **Content from a single engine.** All math/derivation lives in
   `@ilaunchify/nutrition` (or the per-domain builder); the renderer is dumb and
   only lays out a structured model. No business logic in the renderer.
5. **Verified.** Spec-anchored tests: golden snapshots + assertions on required
   elements, ordering, footnote triggers, and dimensions. CFR citation in code.
6. **Compliance caveat.** Pixel-exact CFR typography (exact pt sizes, the 2016
   graphic models in the appendices) gets a compliance-designer review before any
   product goes to print. We get structure + content provably right; a human signs
   off the final typographic proof.

## Architecture decision (pending Pavel)

Today the Facts panel is a React component using Tailwind utility classes — which
is exactly why an app `th` rule could override it. Two ways to meet bar #1:

- **A. Print-grade SVG renderer (recommended).** A shared label core renders each
  artifact to self-contained SVG with explicit pt typography + rule weights. Immune
  to app CSS by construction, and *is* the print asset (rasterize to PDF). Most
  work, highest fidelity, kills the whole CSS-bleed bug class permanently.
- **B. Hardened isolated HTML.** Keep HTML but render every label with fully inline
  styles inside a style-reset boundary (e.g. shadow DOM / `all: initial` wrapper) so
  nothing cascades in. Less work, good enough for screen; PDF still needs a separate
  path.

## Phasing (once substrate is chosen)

- **P0 — substrate + Nutrition/Supplement gold standard.** Build the shared core in
  the chosen substrate; bring Nutrition Facts + Supplement Facts to the bar with
  golden tests. These two are the reference all others copy.
- **P1 — Guaranteed Analysis (pet)** and **INCI declaration (cosmetic):** formal,
  spec-faithful blocks (these aren't "Facts boxes" but still have strict required
  structure + adequacy/warning statements).
- **P2 — Drug Facts (OTC):** the strictest box (201.66 has rigid headings, bullets,
  bold rules). Replaces the partial canvas stub.
- **P3 — print/export:** wire the renderer into the export pipeline for production
  PDFs; verify screen === print.

## Citations to build against

- Nutrition Facts: 21 CFR 101.9, format 101.9(d); infant/child 101.9(j)(5).
- Supplement Facts: 21 CFR 101.36; format 101.36(e) + Appendix B graphic models.
- Drug Facts: 21 CFR 201.66(c)–(d).
- Cosmetic ingredient declaration: 21 CFR 701.3; MoCRA labeling.
- Pet Guaranteed Analysis + nutritional-adequacy statement + feeding directions:
  AAFCO Model Pet Food Regulations (PF2–PF9).
