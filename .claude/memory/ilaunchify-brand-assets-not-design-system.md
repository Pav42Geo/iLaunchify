---
name: ilaunchify-brand-assets-not-design-system
description: "CRITICAL scope correction (2026-05-25). Brand Identity in iLaunchify = a library of packaging-design assets that feed the Fabric.js canvas — NOT a web/SaaS design-system editor. Voice archetypes, banned words, WCAG checker, type-scale ratios, persona descriptions are all OUT OF SCOPE."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

I built the wrong thing. Pavel corrected me 2026-05-25 after I shipped a 7-tab Brand Identity Studio with Jungian archetypes, voice formality sliders, banned-words lint, WCAG contrast checker, 11-role color tokens, 7 type-scale ratios, and persona descriptions. He said it "looks like for some kind of web interface building."

**Correct mental model: Brand Identity in iLaunchify is a creator's *packaging-design asset library*.** Its only job is to feed the Fabric.js Design Studio canvas with ready-to-use elements. Concretely:

- **Logos** — uploaded variants (primary, icon, horizontal, inverse). Surface in the canvas Images drawer under "My Brand" for drag-onto-label.
- **Color swatches** — 3-5 hex values. Surface at the top of every canvas color picker (text, background, ink, label background) as one-click swatches.
- **Fonts** — 1-3 uploaded TTF/OTF files (or chosen from canvas catalog). Surface at the top of the canvas font dropdown.
- **(later: pattern tiles, brand-approved imagery, brand stamps/seals.)**

**One-click "Apply my brand" button on the canvas:** swaps template placeholder colors with brand swatches, swaps placeholder fonts with brand fonts, swaps logo placeholders with the brand's primary logo. Drag-and-drop works the same way — creator drags a brand swatch onto a shape, or a brand logo onto the canvas.

**Why:** Pavel's platform produces *printed packaging labels* on a Fabric.js canvas. A creator using it needs: assets to drop on the canvas. Not: a brand strategy framework, a typography scale calculator, or a WCAG checker. Voice/tone/archetypes belong in a marketing brief, not a packaging studio.

**How to apply:**
- If asked to "build brand identity" or "extend brand identity," the answer involves logos, colors, fonts, asset uploads — NEVER voice sliders, archetypes, banned words, contrast checkers, design tokens, or persona descriptions.
- "Brand identity feeds X" means asset surfacing in canvas drawers, not theme variables in a web app shell.
- A simple test: "would a packaging designer recognize this as part of their workflow?" If no (e.g. Jungian archetypes), it's the wrong scope.
- The over-built Studio at `/brands/[id]/identity` is being stripped down to a 3-section page: Logos / Colors / Fonts. The voice/tone/archetype/banned-words/WCAG machinery is being deleted.
- Related: [[ilaunchify-business-model]] (B2B production marketplace), [[ilaunchify-storefront-deferred]] (no public surfaces).

**Flow correction (same conversation):** Marketplace → product detail page (with creator preferences like flavor/size) → Design Studio Canvas. No "pick a starting template" gallery step between product detail and canvas. The template-gallery page I shipped at `/products/[id]/design` is also wrong shape and will be either removed or absorbed into the canvas's Product drawer.
