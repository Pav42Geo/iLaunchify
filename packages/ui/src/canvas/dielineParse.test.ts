// Dependency-free self-check for the die-line auto-parser. Node-verified during
// build (no test runner wired in packages/ui).

import { parseDielineSvg } from './dielineParse'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`dielineParse self-check failed: ${msg}`)
}

export function runDielineParseSelfTest(): void {
  // 1. Name-based: layers named bleed/dieline/safe + a fold line + a stray circle.
  const named = `
    <svg viewBox="0 0 86 126">
      <rect id="bleed" x="0" y="0" width="86" height="126" stroke="#999" />
      <rect inkscape:label="Dieline" x="3" y="3" width="80" height="120" stroke="#000" />
      <rect class="safe-area" x="6" y="6" width="74" height="114" stroke="#000" />
      <line id="fold-crease" x1="3" y1="63" x2="83" y2="63" stroke="#000" />
      <circle id="logo" cx="40" cy="40" r="5" />
    </svg>`
  const a = parseDielineSvg(named)
  assert(a.sheetW === 86 && a.sheetH === 126, 'sheet size from viewBox')
  assert(a.trimBox?.w === 80 && a.trimBox?.h === 120, 'trim from "Dieline" layer')
  assert(a.bleedBox?.w === 86, 'bleed from "bleed" layer')
  assert(a.safeBox?.w === 74, 'safe from "safe-area" class')
  assert(a.confidence.trim === 0.95, 'name match → 0.95 confidence')
  assert(a.foldLines.length === 1 && a.foldLines[0]?.type === 'VALLEY', 'fold line detected')
  assert(a.unrecognized.some((u) => u.startsWith('circle')), 'stray circle flagged unrecognized (coverage)')
  assert(a.parseAccuracyScore >= 0.9, 'high score for clean named file')

  // 2. Color-based: no names, industry stroke colors (cyan trim, gray bleed, green safe).
  const colored = `
    <svg viewBox="0 0 100 100">
      <rect x="0" y="0" width="100" height="100" stroke="#9AA0A6" />
      <rect x="3" y="3" width="94" height="94" stroke="#00AEEF" />
      <rect x="6" y="6" width="88" height="88" stroke="#34A853" />
    </svg>`
  const b = parseDielineSvg(colored)
  assert(b.trimBox?.w === 94 && b.confidence.trim === 0.8, 'cyan stroke → trim @ color confidence')
  assert(b.bleedBox?.w === 100, 'gray stroke → bleed')
  assert(b.safeBox?.w === 88, 'green stroke → safe')

  // 3. Geometry fallback: unnamed, uncolored rects → size rank (big=bleed, mid=trim, small=safe).
  const geo = `
    <svg viewBox="0 0 50 50">
      <rect x="0" y="0" width="50" height="50" />
      <rect x="2" y="2" width="46" height="46" />
      <rect x="5" y="5" width="40" height="40" />
    </svg>`
  const c = parseDielineSvg(geo)
  assert(c.bleedBox?.w === 50 && c.trimBox?.w === 46 && c.safeBox?.w === 40, 'geometry size-rank fallback')
  assert(c.confidence.trim === 0.5, 'geometry inference → 0.5 confidence')

  // 4. Degenerate: empty svg → no crash, zero score.
  const empty = parseDielineSvg('<svg viewBox="0 0 10 10"></svg>')
  assert(empty.trimBox === null && empty.parseAccuracyScore === 0, 'empty → null spec, 0 score')
}
