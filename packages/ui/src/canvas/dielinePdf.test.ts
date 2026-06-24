// Golden self-test for parsePdfDieline. Run via:
//   tsc --module commonjs ... dielinePdf.test.ts && node dielinePdf.test.js
import { parsePdfDieline } from './dielinePdf'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

export function runPdfDielineSelfTest(): void {
  // A 100×60mm trim with 3mm bleed. In points: 1mm = 2.83465pt.
  //   trim  100×60mm  → 283.46 × 170.08 pt, origin (8.5, 8.5) [= 3mm]
  //   bleed 106×66mm  → 300.47 × 187.09 pt, origin (0, 0)
  //   art   94×54mm   → 266.46 × 153.07 pt, origin (17.01, 17.01) [= 6mm]
  const pdf = `%PDF-1.6
1 0 obj << /Type /Page
/MediaBox [0 0 300.47 187.09]
/BleedBox [0 0 300.47 187.09]
/TrimBox [8.5 8.5 291.96 178.58]
/ArtBox [17.01 17.01 283.46 170.08]
/Resources << /ColorSpace << /CS0 [/Separation /CutContour /DeviceCMYK 2 0 R]
                              /CS1 [/Separation /Crease /DeviceCMYK 3 0 R] >> >>
>> endobj
4 0 obj << /Type /OCG /Name (Dieline) >> endobj
trailer << /Root 5 0 R >>`

  const r = parsePdfDieline(pdf)

  // 1. Trim from TrimBox, ~100×60mm.
  assert(r.trimSource === 'trimbox', 'trim source is TrimBox')
  assert(Math.abs(r.widthMm - 100) < 0.2, `trim width ≈100mm (got ${r.widthMm})`)
  assert(Math.abs(r.heightMm - 60) < 0.2, `trim height ≈60mm (got ${r.heightMm})`)
  assert(r.confidence.trim === 0.9, 'trim confidence 0.9')

  // 2. Bleed = 3mm (TrimBox llx 8.5pt = 3mm inside BleedBox at 0).
  assert(Math.abs(r.bleedMm - 3) < 0.2, `bleed ≈3mm (got ${r.bleedMm})`)
  assert(r.confidence.bleed === 0.9, 'bleed confidence 0.9')

  // 3. Safe inset = 3mm (ArtBox 17.01pt = 6mm, TrimBox 8.5pt = 3mm → 3mm inset).
  assert(Math.abs(r.safeAreaMm - 3) < 0.2, `safe inset ≈3mm (got ${r.safeAreaMm})`)
  assert(r.confidence.safe === 0.7, 'safe confidence 0.7')

  // 4. Separations + layer names recovered + classified.
  assert(r.separations.includes('CutContour'), 'CutContour separation found')
  assert(r.separations.includes('Crease'), 'Crease separation found')
  assert(r.separations.includes('Dieline'), 'Dieline OCG layer found')
  assert(r.lineTypes.cut && r.lineTypes.crease, 'cut + crease line types flagged')
  assert(r.confidence.folds === 0.6, 'folds confidence 0.6 (declared, geometry not lifted)')

  // 5. Name hex-escape decoding: "Cut#20Contour" → "Cut Contour".
  const esc = parsePdfDieline('/Separation /Cut#20Contour /DeviceCMYK')
  assert(esc.separations.includes('Cut Contour'), 'hex-escaped separation name decoded')

  // 6. Fallback: only a MediaBox → mediabox source, lower confidence, coverage notes.
  const media = parsePdfDieline('/MediaBox [0 0 283.46 170.08]')
  assert(media.trimSource === 'mediabox', 'falls back to MediaBox')
  assert(media.confidence.trim === 0.6, 'mediabox trim confidence 0.6')
  assert(media.confidence.bleed === 0, 'no bleed box → 0 bleed confidence')
  assert(media.unrecognized.some((u) => /No TrimBox/.test(u)), 'flags missing TrimBox')
  assert(media.unrecognized.some((u) => /No BleedBox/.test(u)), 'flags missing BleedBox')

  // 7. Degenerate: no boxes at all → score 0, clear note, no crash.
  const empty = parsePdfDieline('%PDF-1.4\n(compressed object streams only)')
  assert(empty.trimSource === 'none' && empty.parseAccuracyScore === 0, 'empty → none source, 0 score')
  assert(empty.unrecognized.some((u) => /compressed/.test(u)), 'empty flags possible compression')

  console.log('PdfDieline golden: PASS')
}

runPdfDielineSelfTest()
