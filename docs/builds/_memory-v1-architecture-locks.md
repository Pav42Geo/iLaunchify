# Memory files to add — V1 architectural locks 2026-06-03

Drop these into `.claude/memory/` after copy. Each maps to a memory file with frontmatter as shown. Also add the matching index lines to `.claude/memory/INDEX.md`.

---

## File 1: `ilaunchify-prepress-terminology.md`

```markdown
---
name: ilaunchify-prepress-terminology
description: Locked prepress/print-industry terminology. Use "dieline" not "die-cut", "substrate" not "material", spot colors with C/U/M designation. Speak partners' language.
metadata:
  type: project
---

Locked 2026-06-03 after prepress terminology audit. Use these terms in code, UI, schema, and partner-facing copy.

**Renames already applied or pending across V1 docs:**
- "die-cut template" → **dieline** (or "dieline template" / "packaging template")
- `PackagingDieCut` model → `PackagingDieline`
- `DieCutFrame` component → `DielineFrame`
- "die-cut" UI strings → "dieline"

**Why:** "Die-cut" is the action of cutting, not the file/spec. The industry term is "dieline" (one word, Esko-standard). "Die" is the physical metal tool. "Cutter guide" is acceptable alternative. "Artboard" is the Adobe Illustrator software term for the design canvas — keep for Studio component naming, but don't say it to partners.

**Industry-standard glossary** (use throughout):
- **Trim** / trim line / trim box — where substrate is cut
- **Bleed** / bleed line — area beyond trim (3mm or 1/8" standard)
- **Safe area** / safety zone — interior margin for critical elements
- **Score line** / crease — fold mark and resulting crease
- **Mountain fold / valley fold** — directional convention
- **Perforation** / perf — tear-line
- **Substrate** — material being printed on (use instead of "material")
- **Stock** — informal for substrate ("16pt coated stock")
- **GSM** — grams per square meter
- **Caliper** — thickness in points
- **Coated / uncoated / matte** — substrate finish; affects color and Pantone book
- **Process colors** — CMYK 4-color
- **Spot color** — single mixed ink (often PANTONE)
- **PMS** — Pantone Matching System (abbreviation)
- **Pantone C / U / M** — Coated / Uncoated / Matte book versions. PMS 185 C ≠ PMS 185 U. Always specify book.
- **Knockout / overprint / trapping** — color interaction
- **ICC profile** — color management (Fogra39, GRACoL 2013, USWebCoatedSWOP)
- **TAC / TIC** — Total Area/Ink Coverage. 280-320% coated, 240-280% uncoated typical.
- **Out-of-gamut** — color exists in source but not destination
- **PDF/X-1a** — conservative print PDF (CMYK/spot only, fonts embedded, no transparency)
- **PDF/X-4** — modern PDF/X (allows live transparency, RGB+CMYK+spot)
- **Outline / convert to paths** — convert fonts to vectors
- **DPI** — dots per inch (300 minimum at final size)
- **LPI** — lines per inch (halftone screen frequency)
- **Prepress** — workflow between design approval and press
- **RIP** — Raster Image Processor
- **Imposition** — multi-label layout on press sheet
- **Plate** — physical offset plate (digital has no plates)
- **Soft proof** / hard proof — on-screen / physical proof
- **Press check** — buyer present at press start
- **Registration** — color plate alignment
- **Spot UV / spot varnish** — selective glossy coating
- **Foil stamp** — metallic foil application
- **Emboss / deboss** — raised / sunken impression
- **Die strike** — emboss without ink

**How to apply:** when writing code, doc, or UI copy that touches print, use these terms. Never write "die-cut template" again. Never say "material" when "substrate" is correct. Always specify C/U/M on PANTONE color references.

Related: [[ilaunchify-partner-spec-source-of-truth]], [[ilaunchify-operational-philosophy-v1]]
```

---

## File 2: `ilaunchify-partner-spec-source-of-truth.md`

```markdown
---
name: ilaunchify-partner-spec-source-of-truth
description: All print/export specs (CMYK conversion, ICC profile, TAC, fonts, dieline layer naming) read from PartnerPrintOutputSpec — never hardcoded platform defaults.
metadata:
  type: feedback
---

Pavel correction 2026-06-03 — I proposed hardcoded CMYK enforcement at export. Pavel pushed back: every partner has their own press, their own color profile, their own preferred PDF format, their own font policy. Hardcoded defaults force creators into a color space the partner might not even use.

**Why:** Some digital presses run extended-gamut CMYK+OGV. Some printers prefer RGB inputs and do their own conversion in their RIP. Some require PDF/X-1a (no transparency); others want PDF/X-4 (modern). Hardcoded one-size-fits-all breaks every partner who doesn't match the default.

**How to apply:**
- All export specs live in `PartnerPrintOutputSpec` model — color space, ICC profile, TAC limit, font policy, file format, bleed amount, dieline delivery format, spot color library (C/U/M book), special channel naming
- At export time, read the spec for the receiving partner and produce output matching THEIR config
- Pre-flight checks warn based on partner spec, not universal rules
- Same artwork might pass for Partner A and fail for Partner B — both correct
- This principle extends beyond print: every output the platform produces ON BEHALF OF a partner reads from partner-configured policy, not platform-baked defaults

**Generalization:** when adding any new partner-touching system, ask "is there a config field for this on the partner side?" If yes, read it. If no, default conservatively and add the config field. Don't hardcode behavior partners might want to override.

Related: [[ilaunchify-prepress-terminology]], [[ilaunchify-operational-philosophy-v1]]
```

---

## File 3: `ilaunchify-accessories-are-partner-bundled-only.md`

```markdown
---
name: ilaunchify-accessories-are-partner-bundled-only
description: Accessories (wooden spoons, ribbons, rosette caps, inserts) exist on iLaunchify only when a partner explicitly lists them AND commits to physically bundling them with their product in one pack-out. No platform-curated, no cross-partner orchestration in V1/V1.5.
metadata:
  type: project
---

Pavel correction 2026-06-03 — I proposed a "PLATFORM_CURATED" accessory model where the platform suggests accessories (e.g., wooden honey dipper) even when the manufacturer doesn't carry them, routing fulfillment to a different partner. Pavel pushed back: without an answer to "who puts the spoon next to the jar at pack-out time," the platform is selling something it can't operationally deliver.

**The principle:** the listing partner IS the fulfillment partner, always. An accessory exists on iLaunchify only when the partner has:
1. Explicitly listed it in their `/partner/accessories` catalog
2. Linked it to specific products they offer (`applicablePartnerOfferingIds`)
3. Committed to physically including it with the order's pack-out

**Workflow visibility — all three touchpoints are conditional:**
- Marketplace product detail: "X brand accessories available" badge renders only if partner has linked offerings
- Product Builder: "Preview brand accessories" link hidden when no offerings
- Checkout: accessories step (G7 stub renamed "Brand Add-ons") skipped entirely when none exist; stepper goes straight to Production Review

**Why:** without this principle, the platform makes promises it can't keep — coordination across partners for a single pack-out is operationally complex and breaks shipping/tracking/return flows. Per "operational trust > margin optimization" — preserve the trust by only offering what can actually be delivered together.

**V2 forward-pointer:** when the pooling + buffer-inventory architecture from `PRODUCTION_ORCHESTRATION.md` exists, cross-partner accessory routing becomes feasible. Until then, partner-bundled-only.

**Schema:** `AccessoryOffering.partnerServiceId` is required (not nullable). No `source` enum. No `fulfillmentPartnerId` (always equals listing partner). No platform-curated catalog. No admin curation tooling for accessories (partners are the only source).

Related: [[ilaunchify-operational-philosophy-v1]], [[ilaunchify-orchestration-thesis]], [[clarify-audience-before-building-customer-facing-flows]]
```

---

## INDEX.md additions

Add under appropriate sections:

```markdown
- [Prepress terminology lock — dieline not die-cut, substrate not material, PMS C/U/M](ilaunchify-prepress-terminology.md) — Industry-standard glossary. Speak partners' language.
- [Partner spec is source of truth for print output](ilaunchify-partner-spec-source-of-truth.md) — PartnerPrintOutputSpec drives CMYK/ICC/TAC/fonts/PDF format. No hardcoded defaults.
- [Accessories are partner-bundled, never platform-routed](ilaunchify-accessories-are-partner-bundled-only.md) — Listing partner IS the fulfillment partner. Three touchpoints conditional on partner having offerings.
```
