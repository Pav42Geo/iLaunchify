# Cert seal conversions — SVG + PNG pairs

Generated 2026-06-04 from the downloaded EPS vector masters.

## Pipeline

EPS can't be opened by Inkscape 1.4 directly and isn't browser-renderable, so
each master was converted via:

```
EPS  --(ghostscript, -dEPSCrop)-->  PDF  --(inkscape)-->  SVG  (true vector, print)
                                          --(inkscape)-->  PNG  (1024px, RGBA, web/canvas)
```

- `gs -q -dNOPAUSE -dBATCH -dEPSCrop -sDEVICE=pdfwrite -sOutputFile=out.pdf in.eps`
- `inkscape out.pdf --export-type=svg --export-filename=<slug>/svg/<name>.svg`
- `inkscape out.pdf --export-type=png --export-width=1024 --export-filename=<slug>/png/<name>.png`

The "Couldn't parse text in PDF from UTF16" Inkscape warning is non-fatal
metadata noise — the seals are outlined vector shapes and render correctly
(verified visually for USDA color + EU colour).

## Output (10 EPS masters → 10 SVG + 10 PNG)

- `usda-organic/{svg,png}/` — color, color-R (®), bw, bw-R (4 variants)
- `eu-organic/{svg,png}/` — Colour, Colour+OuterLine, OneColour Dark/Light
  (±OuterLine) (6 variants)

PNGs are RGBA with transparency preserved (USDA 1024×1024 square; EU 1024×683
at the official 54×36 mm aspect). SVGs are true vector.

## Upload mapping (per CertificateType badge slots)

For each cert type pick ONE canonical pair:
- **PNG → web badge** (`thumbnailFileId`) — marketplace + cert chips + Studio canvas
- **SVG → print badge** (`badgeSvgFileId`) — Design Studio production/vector

Recommended canonical variants:
- USDA Organic → `usda-organic-seal-color` (color on light surfaces)
- EU Organic   → `EU_Organic_Logo_Colour_54x36mm`

The `-R` / OuterLine / Dark / Light variants are alternates the admin can wire
as `CertificateAssetVariant` rows (C7 variant pipeline) for dark surfaces etc.

## ⚠️ Governance — do NOT auto-inject

These stay LOCAL + UNTRACKED (this whole folder is git-untracked on purpose).
They are staged for the governed admin path only:

  /admin/certificate-types/[id] → upload PNG + SVG → R2

Provenance/usage still goes through the legal procedure the team chose; the
manufacturer-verification model owns ownership/usage attestations on white-label
products. Nothing here gets committed to the repo or written to the DB/R2
outside that admin upload flow. See `SOURCES.md` for download provenance.
