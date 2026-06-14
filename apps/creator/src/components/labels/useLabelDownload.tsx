'use client'

// Shared label-download flow (task #125). Recomputes every label for a product
// (one per flavor for multi-flavor variants), renders each as a print-grade
// NutritionFactsSvg into a hidden holder, then opens a print view with them all
// → the creator saves one PDF with every label. Used by both the Design Studio
// button and the product-card 3-dot menu so the logic lives in one place.

import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { NutritionFactsSvg } from '@ilaunchify/ui'
import { computeProductLabel, type ProductLabel } from './label-actions'
import { printLabels } from './label-export'

export function useLabelDownload(productId: string, productName: string): { trigger: () => Promise<void>; busy: boolean; holder: ReactNode } {
  const [labels, setLabels] = useState<ProductLabel[] | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function trigger() {
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
      if (ref.current) printLabels(ref.current, productName)
      toast.success(`${res.data.length} label${res.data.length === 1 ? '' : 's'} ready — choose “Save as PDF”.`)
    }, 60)
  }

  const holder: ReactNode = (
    <div ref={ref} aria-hidden style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
      {labels?.map((l, i) => (
        <div key={i}>
          <NutritionFactsSvg data={l.panel} ingredientStatement={l.ingredientStatement} contains={l.contains} widthPx={300} />
        </div>
      ))}
    </div>
  )

  return { trigger, busy, holder }
}
