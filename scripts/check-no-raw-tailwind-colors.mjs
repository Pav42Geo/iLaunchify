#!/usr/bin/env node
// =============================================================================
// Design-system guard — bans raw off-palette Tailwind colors (2026-06-25).
// =============================================================================
//
// The platform palette is pink / neon / ink + the four semantic ramps
// (success / warning / danger / info), all token-backed in
// packages/ui/src/tokens/colors.ts + theme.css. Raw Tailwind families
// (amber, emerald, zinc, rose, sky, blue, …) bypass the tokens and drift
// off-brand — that's how the "brown above the tables" crept in.
//
// This script fails (exit 1) if any raw off-palette utility reappears, so the
// color system stays single-source. Run via `pnpm check:colors` (and in CI).
//
// Mapping for fixes: emerald/green→success · amber/orange→warning ·
// rose/red→danger · sky/blue/indigo/violet/purple/teal→info · zinc/gray→ink.
//
// Intentional exceptions (theme-immune regulated artifacts, hardcoded hex):
//   • packages/ui/src/nutrition/*  (FDA panels must NOT follow runtime tokens)
//   • packages/ui/src/canvas/*     (Fabric.js color pickers / substrate swatches)
// Those use hex literals, not these families, so they won't match anyway.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['apps/admin', 'apps/creator', 'apps/partner', 'apps/marketing', 'packages/ui/src']
const PRUNE = new Set(['node_modules', '.next', 'dist', '.turbo', '.git'])
const DENY = ['/nutrition/', '/canvas/substrates', '/canvas/patterns', '/charts/chartPalette']
const FAMILIES = [
  'emerald', 'green', 'lime', 'amber', 'orange', 'yellow', 'rose', 'red',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'teal', 'cyan',
  'zinc', 'gray', 'slate', 'neutral', 'stone',
]
const RX = new RegExp(`-(${FAMILIES.join('|')})-\\d{2,3}\\b`, 'g')

// ── Brand-hex arbitrary-value classes (added 2026-07-09) ─────────────────────
// Catches the OTHER drift shape the family regex misses: an arbitrary-value
// Tailwind class hardcoding a brand hex where a token class already exists,
// e.g. `bg-[#B5FF3D]` → `bg-neon-500`, `text-[#FF2E63]` → `text-pink-500`.
// Only brand hexes are matched, so SVG paint attrs, color-picker arrays,
// `placeholder="#.."`, and `?? '#..'` fallbacks never trip it (those are not
// class-shaped). Spec + token map: docs/DESIGN_TOKEN_HYGIENE.md.
const BRAND_HEX = 'ff2e63|e91e5a|c71350|ffe9f0|9e0e40|6e0a2d|b5ff3d|9ee61f|c2ff4d|d4ff7a'
const HEX_CLASS_RX = new RegExp(`\\b(?:bg|text|border|ring|from|to|via|decoration|outline|shadow|fill|stroke)-\\[#(?:${BRAND_HEX})\\](?:/\\d{1,3})?`, 'gi')
// Temporary exemptions — Code-owned hot zones (single-writer). Remove each
// entry when Code migrates the file. Tracked in docs/DESIGN_TOKEN_HYGIENE.md.
const HEX_CLASS_ALLOW = [
  'design/canvas/drawers/FlavorLabelSections', // ×2 status chips — Design Studio canvas
  'products/new/TurnkeyProductFlow',           // ×1 step badge — partner New-Product builder
  'products/new/BasicsStep',                   // ×1 bg-[#FFE9F0] wash — partner New-Product builder
]

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (PRUNE.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(p) && !DENY.some((d) => p.includes(d))) out.push(p)
  }
}

const files = []
for (const r of ROOTS) {
  try { walk(r, files) } catch { /* root may not exist */ }
}

const hits = []
const hexHits = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  const hexAllowed = HEX_CLASS_ALLOW.some((d) => f.includes(d))
  lines.forEach((line, i) => {
    const m = line.match(RX)
    if (m) hits.push(`${f}:${i + 1}  ${[...new Set(m)].join(' ')}`)
    if (!hexAllowed) {
      const hx = line.match(HEX_CLASS_RX)
      if (hx) hexHits.push(`${f}:${i + 1}  ${[...new Set(hx)].join(' ')}`)
    }
  })
}

if (hexHits.length) {
  console.error(`\n✗ Found ${hexHits.length} brand-hex arbitrary class(es) — use the token class.`)
  console.error('  bg-[#B5FF3D]→bg-neon-500 · bg-[#FF2E63]→bg-pink-500 · [#C71350]→pink-700 · [#FFE9F0]→pink-50')
  console.error('  Alpha works: bg-neon-500/30. See docs/DESIGN_TOKEN_HYGIENE.md\n')
  for (const h of hexHits.slice(0, 50)) console.error('  ' + h)
  if (hexHits.length > 50) console.error(`  …and ${hexHits.length - 50} more`)
  process.exit(1)
}

if (hits.length) {
  console.error(`\n✗ Found ${hits.length} raw off-palette Tailwind color usage(s).`)
  console.error('  Use the brand tokens instead (success/warning/danger/info/ink).')
  console.error('  emerald→success · amber→warning · rose/red→danger · sky/blue→info · zinc→ink\n')
  for (const h of hits.slice(0, 50)) console.error('  ' + h)
  if (hits.length > 50) console.error(`  …and ${hits.length - 50} more`)
  process.exit(1)
}

console.log(`✓ No raw off-palette Tailwind colors. ${files.length} files clean.`)
