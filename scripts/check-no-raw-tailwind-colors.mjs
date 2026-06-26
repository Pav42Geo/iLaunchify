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
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const m = line.match(RX)
    if (m) hits.push(`${f}:${i + 1}  ${[...new Set(m)].join(' ')}`)
  })
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
