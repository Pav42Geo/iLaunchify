'use client'

// InfoTip — the platform's single, canonical help tooltip. A small Lucide "i"
// icon that toggles a white popover with helper text on click (closes on a
// second click or an outside click). Used everywhere helper text would
// otherwise clutter a label or section. Tokenized via the ink/pink palette
// utilities so it themes consistently across every app.
//
// This is the ONE tooltip style for the whole platform — Design Studio,
// Packaging Studio, and the Add-Product builder all render this component.

import * as React from 'react'
import { Info } from 'lucide-react'

export function InfoTip({ text, label = 'More info' }: { text: React.ReactNode; label?: string }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className={
          'inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors ' +
          (open ? 'text-pink-600' : 'text-ink-400 hover:text-ink-700')
        }
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-6 z-50 w-60 rounded-md border border-ink-200 bg-white p-2.5 text-[11px] font-normal normal-case leading-[1.45] tracking-normal text-ink-600 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}
