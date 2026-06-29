'use client'

// PDP redesign — lightweight right-side drawer that hosts the existing
// SampleOrderCard. The configure box's "Order a sample →" secondary button
// opens it; all sample logic stays in SampleOrderCard (this is chrome only).
//
// Self-contained: owns its open/close state and exposes a trigger render-prop
// so the configure box can place the opener wherever it likes.

import * as React from 'react'
import { X } from 'lucide-react'
import { SampleOrderCard } from './SampleOrderCard'
import type { SampleOption } from '@/lib/sample-quote'

export interface SampleDrawerProps {
  options: SampleOption[]
  flavorNames: string[]
  isMultiFlavor: boolean
  dielineReady: boolean
  isAuthenticated: boolean
  ownedProductId: string | null
  /** Renders the opener. Receives an `open` callback to wire to a button. */
  trigger: (open: () => void) => React.ReactNode
}

export function SampleDrawer({
  options,
  flavorNames,
  isMultiFlavor,
  dielineReady,
  isAuthenticated,
  ownedProductId,
  trigger,
}: SampleDrawerProps) {
  const [open, setOpen] = React.useState(false)

  // Lock body scroll while the drawer is open.
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {trigger(() => setOpen(true))}

      {/* Scrim */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden={!open}
        className={
          'fixed inset-0 z-40 bg-ink-900/45 transition-opacity duration-base ' +
          (open ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Order a sample"
        className={
          'fixed inset-y-0 right-0 z-50 w-[400px] max-w-[92vw] overflow-y-auto bg-white p-5 shadow-xl transition-transform duration-base ease-out-quart ' +
          (open ? 'translate-x-0' : 'translate-x-full')
        }
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[18px] font-bold text-ink-900">
            Order a sample
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <SampleOrderCard
          options={options}
          flavorNames={flavorNames}
          isMultiFlavor={isMultiFlavor}
          dielineReady={dielineReady}
          isAuthenticated={isAuthenticated}
          ownedProductId={ownedProductId}
        />
      </aside>
    </>
  )
}
