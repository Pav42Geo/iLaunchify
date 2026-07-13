// Dependency-free self-check for the label-proof SVG composer. Same convention
// as dielineSvg.test.ts — packages/ui has no test runner wired, so import and
// call runLabelProofSvgSelfTest() from a node/tsx context. Node-verified.

import { composeLabelProofSvg, extractSvgInner } from './labelProofSvg'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`labelProofSvg self-check failed: ${msg}`)
}

export function runLabelProofSvgSelfTest(): void {
  // --- extractSvgInner ---------------------------------------------------
  const doc =
    '<svg xmlns="http://www.w3.org/2000/svg" width="86.00mm" height="126.00mm" viewBox="0 0 86.00 126.00"><rect x="0" y="0"/><line/></svg>'
  const inner = extractSvgInner(doc)
  assert(inner === '<rect x="0" y="0"/><line/>', 'unwraps the outer <svg>, keeps inner markup')
  assert(!inner.includes('<svg'), 'inner fragment has no <svg> wrapper')
  assert(extractSvgInner('no svg here') === '', 'no <svg> → empty fragment')
  assert(extractSvgInner('<svg viewBox="0 0 1 1"></svg>') === '', 'empty <svg> → empty fragment')

  // --- composeLabelProofSvg: full three-layer stack ----------------------
  const svg = composeLabelProofSvg(
    { substrate: '<rect data-sub/>', brand: '<image data-brand/>', regulated: '<g data-nutri/>' },
    { widthMm: 86, heightMm: 126 },
  )
  assert(svg.startsWith('<svg'), 'returns an svg document')
  assert(svg.includes('width="86.00mm"') && svg.includes('height="126.00mm"'), 'dims carried through in mm')
  assert(svg.includes('viewBox="0 0 86.00 126.00"'), 'viewBox is the full mm canvas')
  assert(svg.includes('<g data-layer="substrate"><rect data-sub/></g>'), 'substrate layer wrapped + tagged')
  assert(svg.includes('<g data-layer="brand"><image data-brand/></g>'), 'brand layer wrapped + tagged')
  assert(svg.includes('<g data-layer="regulated"><g data-nutri/></g>'), 'regulated layer wrapped + tagged')

  // Layer ORDER (back → front) is the regulated-content guarantee: brand can
  // never obscure regulated panels because regulated is painted last.
  const iSub = svg.indexOf('data-layer="substrate"')
  const iBrand = svg.indexOf('data-layer="brand"')
  const iReg = svg.indexOf('data-layer="regulated"')
  assert(iSub < iBrand && iBrand < iReg, 'order: substrate → brand → regulated (regulated on top)')

  // --- optional regulated layer ------------------------------------------
  const noReg = composeLabelProofSvg(
    { substrate: '<rect/>', brand: '<image/>' },
    { widthMm: 50, heightMm: 50 },
  )
  assert(!noReg.includes('data-layer="regulated"'), 'omitted regulated layer → no regulated group')
  const emptyReg = composeLabelProofSvg(
    { substrate: '<rect/>', brand: '<image/>', regulated: '   ' },
    { widthMm: 50, heightMm: 50 },
  )
  assert(!emptyReg.includes('data-layer="regulated"'), 'whitespace-only regulated layer → no regulated group')

  // --- degenerate dims never throw ---------------------------------------
  const degenerate = composeLabelProofSvg({ substrate: '<rect/>', brand: '<image/>' }, { widthMm: 0, heightMm: 120 })
  assert(degenerate.startsWith('<svg') && degenerate.includes('viewBox="0 0 1 1"'), 'zero dim → minimal valid svg')

  // --- round-trip: unwrapped normalizedSvg folds into the substrate layer -
  const folded = composeLabelProofSvg(
    { substrate: extractSvgInner(doc), brand: '<image/>' },
    { widthMm: 86, heightMm: 126 },
  )
  assert(
    folded.includes('<g data-layer="substrate"><rect x="0" y="0"/><line/></g>'),
    'stored normalizedSvg unwraps + folds into substrate cleanly',
  )
}

// Allow direct execution: `tsx labelProofSvg.test.ts`
if (typeof require !== 'undefined' && require.main === module) {
  runLabelProofSvgSelfTest()
  // eslint-disable-next-line no-console
  console.log('✓ labelProofSvg self-check passed')
}
