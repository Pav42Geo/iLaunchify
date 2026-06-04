'use client'

// InfoTip — a small "i" icon that toggles a popover with helper text on click.
// Used to keep the Label drawer compact: section guidance lives behind the icon
// instead of as always-on paragraphs. Closes on a second click or outside click.

import * as React from 'react'
import { Info } from 'lucide-react'

export function InfoTip({ text, label = 'More info' }: { text: string; label?: string }) {
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
          'inline-flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors ' +
          (open ? 'text-pink-600' : 'text-ink-400 hover:text-ink-700')
        }
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-5 z-30 w-56 rounded-md border border-ink-200 bg-white p-2.5 text-[11px] font-normal normal-case leading-[1.45] tracking-normal text-ink-600 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}
