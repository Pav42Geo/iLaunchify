'use client'

// Client helpers to download / print the regulated label SVGs. Browser
// "Save as PDF" from printLabels() produces a true VECTOR PDF containing every
// label (all flavors), so no PDF library or server round-trip is needed.

const SVG_NS = 'http://www.w3.org/2000/svg'

function cloneForExport(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', SVG_NS)
  return clone
}

/** Download one SVG element as a `.svg` file. */
export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  const markup = cloneForExport(svg).outerHTML
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${markup}`], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Open a clean print window with EVERY svg inside `node`, at a physical label
 *  width, and trigger print → the user saves a single PDF with all labels. */
export function printLabels(node: HTMLElement, title = 'Labels'): void {
  const svgs = Array.from(node.querySelectorAll('svg'))
  if (svgs.length === 0) return
  const body = svgs.map((s) => `<div class="lbl">${cloneForExport(s as SVGSVGElement).outerHTML}</div>`).join('')
  const w = window.open('', '_blank', 'width=880,height=1000')
  if (!w) return
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>@page{margin:12mm}html,body{margin:0}` +
      `body{padding:16px;display:flex;flex-wrap:wrap;gap:18px;justify-content:center;align-items:flex-start;font-family:Helvetica,Arial,sans-serif}` +
      `.lbl{page-break-inside:avoid}.lbl svg{width:74mm;height:auto}</style></head>` +
      `<body>${body}</body></html>`,
  )
  w.document.close()
  w.focus()
  setTimeout(() => { try { w.print() } catch { /* window closed */ } }, 300)
}
