'use client'

// Builder+ label-download control (task #125). Recomputes every label for the
// product (one per flavor for multi-flavor variants) via computeProductLabel,
// renders each as a print-grade NutritionFactsSvg into a hidden holder, then
// prints them all → the creator saves one PDF with every label.
//
// The button is only RENDERED for Builder+ (the page passes `canDownload`); the
// server action is also hard-gated, so this is defence-in-depth, not the gate.

import { useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { NutritionFactsSvg } from '@ilaunchify/ui'
import { computeProductLabel, type ProductLabel } from './label-actions'
import { printLabels } from './label-export'

export function LabelDownloadButton({ productId, productName, compact = false }: { productId: string; productName: string; compact?: boolean }): JSX.Element {
  const [labels, setLabels] = useState<ProductLabel[] | null>(null)
  const [busy, setBusy] = useState(false)
  const holderRef = useRef<HTMLDivElement>(null)

  async function onClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    const res = await computeProductLabel(productId).catch(() => null)
    setBusy(false)
    if (!res || !res.ok) {
      toast.error(res && !res.ok ? res.error : 'Could not generate the labels.')
      return
    }
    setLabels(res.data)
    // Let React paint the hidden SVGs, then open the print/PDF view with them all.
    setTimeout(() => {
      if (holderRef.current) printLabels(holderRef.current, productName)
      toast.success(`${res.data.length} label${res.data.length === 1 ? '' : 's'} ready — choose “Save as PDF”.`)
    }, 60)
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title="Download the regulated label files (every flavor)"
        className={
          compact
            ? 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60'
            : 'inline-flex items-center gap-1.5 rounded-full border border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60'
        }
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Labels
      </button>
      {/* Off-screen render holder — the print window reads these SVGs. */}
      <div ref={holderRef} aria-hidden style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        {labels?.map((l, i) => (
          <div key={i}>
            <NutritionFactsSvg data={l.panel} ingredientStatement={l.ingredientStatement} contains={l.contains} widthPx={300} />
          </div>
        ))}
      </div>
    </>
  )
}
