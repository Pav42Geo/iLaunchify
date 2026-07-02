/**
 * Golden checks for the Design Reshape severity router + focal cover-crop
 * (docs/DESIGN_RESHAPE_CROSS_DIELINE.md §Severity routing rules). Self-contained
 * (no `vitest` import — matches lead.test.ts / pack-model.test.ts so the ui
 * package typechecks without a vitest dep). Run directly:
 *   npx tsc --module commonjs --target es2020 --outDir /tmp/reshape \
 *     packages/ui/src/lib/template-match.ts packages/ui/src/lib/template-match.reshape.test.ts
 *   node /tmp/reshape/template-match.reshape.test.js
 * Also executed by scripts/run-vitest-suites.mjs.
 */
import { classifyReshape, containerShapeKind, reshapeCropSvg, reshapeFidelity, aspectBucketFor } from './template-match'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}

// --- containerShapeKind: container categories → coarse 3D shape kinds ---
assert(containerShapeKind('CAN') === 'CYLINDER', 'CAN → CYLINDER')
assert(containerShapeKind('BOTTLE') === 'CYLINDER', 'BOTTLE → CYLINDER')
assert(containerShapeKind('JAR') === 'CYLINDER', 'JAR → CYLINDER')
assert(containerShapeKind('BOX') === 'BOX', 'BOX → BOX')
assert(containerShapeKind('CARTON') === 'BOX', 'CARTON → BOX')
assert(containerShapeKind('POUCH') === 'FLAT', 'POUCH → FLAT')
assert(containerShapeKind(null) === 'FLAT', 'null → FLAT')

// --- S0: same bucket + unroll-compatible → direct apply, never AI ---
{
  const r = classifyReshape({ containerCategory: 'CAN', aspectBucket: 'WRAP' }, { containerCategory: 'CAN', aspectBucket: 'WRAP' })
  assert(r.severity === 'S0' && r.method === 'DIRECT' && r.bucketDelta === 0, 'S0 same family → DIRECT')
}
{
  // FLAT↔CYLINDER at equal bucket is pure unrolling — spec forbids spending AI on it.
  const r = classifyReshape({ containerCategory: 'POUCH', aspectBucket: 'PANEL_TALL' }, { containerCategory: 'BOTTLE', aspectBucket: 'PANEL_TALL' })
  assert(r.severity === 'S0' && r.method === 'DIRECT', 'S0 FLAT↔CYLINDER equal bucket → DIRECT (unrolling)')
}

// --- S1: adjacent bucket / BOX-incompatible at equal bucket / unknown → crop ---
{
  const r = classifyReshape({ containerCategory: 'CAN', aspectBucket: 'WRAP' }, { containerCategory: 'POUCH', aspectBucket: 'PANEL_WIDE' })
  assert(r.severity === 'S1' && r.method === 'CROP' && r.bucketDelta === 1, 'S1 adjacent bucket → CROP')
}
{
  const r = classifyReshape({ containerCategory: 'CAN', aspectBucket: 'PANEL_WIDE' }, { containerCategory: 'BOX', aspectBucket: 'PANEL_WIDE' })
  assert(r.severity === 'S1' && r.method === 'CROP', 'S1 equal bucket but BOX target (not unroll-compatible) → CROP')
}
{
  const r = classifyReshape({ containerCategory: 'CAN', aspectBucket: null }, { containerCategory: 'POUCH', aspectBucket: 'WRAP' })
  assert(r.severity === 'S1' && r.method === 'CROP' && r.bucketDelta === 0, 'S1 unknown source bucket → conservative CROP')
}

// --- S2: Δbucket ≥ 2 with a stored brief → outpaint ---
{
  // Can wrap (WRAP) → tall pouch panel (PANEL_TALL): Δ = 3.
  const r = classifyReshape(
    { containerCategory: 'CAN', aspectBucket: 'WRAP', hasBrief: true },
    { containerCategory: 'POUCH', aspectBucket: 'PANEL_TALL' },
  )
  assert(r.severity === 'S2' && r.method === 'OUTPAINT' && r.bucketDelta === 3, 'S2 big delta with brief → OUTPAINT')
}

// --- S3: multi-panel target, or big delta without a brief → reference regen ---
{
  const r = classifyReshape(
    { containerCategory: 'CAN', aspectBucket: 'WRAP', hasBrief: true },
    { containerCategory: 'BOX', aspectBucket: 'WRAP', multiPanel: true },
  )
  assert(r.severity === 'S3' && r.method === 'REF_REGEN', 'S3 multi-panel box target → REF_REGEN')
}
{
  const r = classifyReshape(
    { containerCategory: 'CAN', aspectBucket: 'WRAP', hasBrief: false },
    { containerCategory: 'POUCH', aspectBucket: 'PANEL_SQUARE' },
  )
  assert(r.severity === 'S3' && r.method === 'REF_REGEN', 'S3 big delta without brief → REF_REGEN')
}

// --- reshapeCropSvg: target-sized cover-crop wrapper ---
{
  const out = reshapeCropSvg('https://cdn.example.com/art.png?a=1&b=2', 100, 150)
  assert(out.includes('viewBox="0 0 100 150"'), 'crop SVG carries the target viewBox')
  assert(out.includes('preserveAspectRatio="xMidYMid slice"'), 'crop SVG uses slice (cover-crop)')
  assert(out.includes('a=1&amp;b=2'), 'crop SVG attribute-escapes the href')
}
{
  const out = reshapeCropSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', 120, 40)
  assert(out.includes('data:image/svg+xml;charset=utf-8,'), 'raw SVG source embeds as a data URL')
  assert(out.includes('viewBox="0 0 120 40"'), 'raw SVG crop carries target viewBox')
}

// --- focal crop (P3): explicit cover window keeps the focal point in frame ---
{
  // Source 3:1 wide, target 1:1 (100×100). Cover render: 300×100. Focal at x=0.9
  // wants center 270 → clamped to max offset 200.
  const out = reshapeCropSvg('https://cdn.example.com/wide.png', 100, 100, { sourceAspect: 3, focal: { x: 0.9, y: 0.5 } })
  assert(out.includes('preserveAspectRatio="none"'), 'focal crop uses an explicit window (no PAR alignment)')
  assert(out.includes('width="300"') && out.includes('x="-200"'), 'focal x=0.9 on 3:1→1:1 clamps to the right edge (offset 200)')
}
{
  // Focal at dead center reproduces the centered window: offset (300-100)/2 = 100.
  const out = reshapeCropSvg('https://cdn.example.com/wide.png', 100, 100, { sourceAspect: 3, focal: { x: 0.5, y: 0.5 } })
  assert(out.includes('x="-100"'), 'centered focal reproduces the center crop window')
}
{
  // No focal info → unchanged legacy center-slice behavior.
  const out = reshapeCropSvg('https://cdn.example.com/art.png', 100, 150)
  assert(out.includes('preserveAspectRatio="xMidYMid slice"'), 'without focal info the center slice is preserved')
}

// --- reshape fidelity (P3): honest survival indicator per method ---
{
  assert(reshapeFidelity('DIRECT').score === 100 && reshapeFidelity('DIRECT').label === 'exact', 'DIRECT → 100 exact')
  const crop = reshapeFidelity('CROP', 3, 1) // 3:1 → 1:1 cover keeps 1/3 of the art
  assert(crop.score === 33 && crop.label === 'cropped', 'CROP 3:1→1:1 → 33 cropped')
  const ext = reshapeFidelity('OUTPAINT', 1, 2) // extended canvas: original is half the output
  assert(ext.score === 50 && ext.label === 'extended', 'OUTPAINT 1:1→2:1 → 50 extended')
  assert(reshapeFidelity('REF_REGEN', 1, 1).label === 'reinterpreted', 'REF_REGEN → reinterpreted')
  assert(reshapeFidelity('CROP').score === 100, 'unknown aspects degrade to method-only signal')
}

// --- driving example: 4×12in can wrap (304.8 × 101.6 mm) buckets as WRAP ---
assert(aspectBucketFor(304.8, 101.6) === 'WRAP', '4×12in can wrap → WRAP bucket')

if (failures > 0) {
  console.error(`\n${failures} reshape golden(s) FAILED`)
  process.exit(1)
} else {
  console.log('\nAll reshape goldens pass.')
}
