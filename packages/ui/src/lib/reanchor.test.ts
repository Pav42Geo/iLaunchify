/**
 * Golden checks for the R1 element re-anchoring engine
 * (docs/DESIGN_RESHAPE_CROSS_DIELINE.md §The three rungs). Self-contained assert
 * harness (no vitest import) — run directly via tsc+node or through
 * scripts/run-vitest-suites.mjs.
 */
import { reanchorCanvasJson, inferCanvasExtent, type ReanchorFrameLayout } from './reanchor'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1
    console.error('  ✗ ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}
function near(a: number | undefined, b: number, eps = 0.01): boolean {
  return typeof a === 'number' && Math.abs(a - b) <= eps
}

// Source surface: 400×600. Target: 800×300 (wide wrap).
const SRC = { widthPx: 400, heightPx: 600 }
const TGT = { widthPx: 800, heightPx: 300 }

// --- proportional re-anchor: uniform object scale, stretched position ---
{
  // Centered decorative rect (origin center) at (200, 300), 100×100.
  const json = { objects: [{ type: 'rect', left: 200, top: 300, width: 100, height: 100, scaleX: 1, scaleY: 1, originX: 'center', originY: 'center' }] }
  const out = reanchorCanvasJson(json, SRC, TGT)
  const o = out.objects![0]!
  assert(near(o.left, 400), 'proportional: center x maps 200/400 → 400/800')
  assert(near(o.top, 150), 'proportional: center y maps 300/600 → 150/300')
  // uniform = min(800/400, 300/600) = 0.5 — object scales uniformly, no distortion.
  assert(near(o.scaleX, 0.5) && near(o.scaleY, 0.5), 'proportional: uniform 0.5 scale on both axes')
  assert(json.objects![0]!.left === 200, 'input json is not mutated')
}

// --- origin handling: left/top-origined objects keep their origin convention ---
{
  const json = { objects: [{ type: 'rect', left: 0, top: 0, width: 100, height: 100, scaleX: 1, scaleY: 1, originX: 'left', originY: 'top' }] }
  const out = reanchorCanvasJson(json, SRC, TGT)
  const o = out.objects![0]!
  // src center (50,50) → (100,25); scaled size 50×50 → left/top = center - 25.
  assert(near(o.left, 75) && near(o.top, 0), 'left/top origin round-trips through center math')
}

// --- role-tagged object re-anchors into its target frame ---
{
  const frames: ReanchorFrameLayout = {
    frames: [{ id: 'logo', kind: 'LOGO', box: { x: 0.75, y: 0.1, w: 0.2, h: 0.2 }, required: false, source: 'PLATFORM' }],
  }
  const json = {
    objects: [{ type: 'image', left: 200, top: 300, width: 200, height: 100, scaleX: 1, scaleY: 1, originX: 'center', originY: 'center', customType: 'brand-logo' }],
  }
  const out = reanchorCanvasJson(json, SRC, { ...TGT, frames })
  const o = out.objects![0]!
  // Frame px: x 600, y 30, w 160, h 60 → center (680, 60); fit = min(160/200, 60/100) = 0.6.
  assert(near(o.left, 680) && near(o.top, 60), 'brand-logo centers into the LOGO frame')
  assert(near(o.scaleX, 0.6) && near(o.scaleY, 0.6), 'brand-logo fits within the frame uniformly')
}

// --- customRole objects map via role → frame kind ---
{
  const frames: ReanchorFrameLayout = {
    frames: [{ id: 'soi', kind: 'STATEMENT_OF_IDENTITY', box: { x: 0, y: 0.8, w: 0.5, h: 0.2 }, required: true, source: 'PLATFORM' }],
  }
  const json = {
    objects: [{ type: 'i-text', left: 10, top: 10, width: 100, height: 20, scaleX: 1, scaleY: 1, originX: 'left', originY: 'top', customRole: 'statement-of-identity' }],
  }
  const out = reanchorCanvasJson(json, SRC, { ...TGT, frames })
  const o = out.objects![0]!
  // Frame px: x 0, y 240, w 400, h 60 → center (200, 270).
  const cx = (o.left ?? 0) + ((o.width ?? 0) * (o.scaleX ?? 1)) / 2
  const cy = (o.top ?? 0) + ((o.height ?? 0) * (o.scaleY ?? 1)) / 2
  assert(near(cx, 200) && near(cy, 270), 'SoI text centers into the STATEMENT_OF_IDENTITY frame')
}

// --- ai-concept background cover-fits the new surface ---
{
  const json = {
    objects: [{ type: 'image', left: 200, top: 300, width: 400, height: 600, scaleX: 1, scaleY: 1, originX: 'center', originY: 'center', customType: 'ai-concept' }],
  }
  const out = reanchorCanvasJson(json, SRC, TGT)
  const o = out.objects![0]!
  // cover = max(800/400, 300/600) = 2 → rendered 800×1200, centered at (400,150).
  assert(near(o.scaleX, 2) && near(o.scaleY, 2), 'ai-concept covers the target surface')
  assert(near(o.left, 400) && near(o.top, 150), 'ai-concept centers on the target')
}

// --- no frames → tagged objects fall back to proportional ---
{
  const json = {
    objects: [{ type: 'image', left: 200, top: 300, width: 200, height: 100, scaleX: 1, scaleY: 1, originX: 'center', originY: 'center', customType: 'brand-logo' }],
  }
  const out = reanchorCanvasJson(json, SRC, TGT)
  const o = out.objects![0]!
  assert(near(o.left, 400) && near(o.top, 150) && near(o.scaleX, 0.5), 'tagged object without frames → proportional')
}

// --- inferCanvasExtent: content bbox as the source-dims fallback ---
{
  const ext = inferCanvasExtent({
    objects: [
      { left: 0, top: 0, width: 100, height: 50, scaleX: 1, scaleY: 1, originX: 'left', originY: 'top' },
      { left: 380, top: 580, width: 40, height: 40, scaleX: 1, scaleY: 1, originX: 'center', originY: 'center' },
    ],
  })
  assert(!!ext && near(ext.widthPx, 400) && near(ext.heightPx, 600), 'extent = max object reach (400×600)')
  assert(inferCanvasExtent({ objects: [] }) === null, 'empty design → null extent')
}

if (failures > 0) {
  console.error(`\n${failures} reanchor golden(s) FAILED`)
  process.exit(1)
} else {
  console.log('\nAll reanchor goldens pass.')
}
