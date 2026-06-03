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
