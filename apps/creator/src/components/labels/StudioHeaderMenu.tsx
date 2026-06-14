'use client'

// Three-line menu for the Design Studio top bar (next to the logo). Studio-scoped
// actions only — the studio edits ONE product, so there's no "new product" here
// (creators add products via the marketplace, from the dashboard). Items gate
// themselves. The header is due a refactor; this is the lean V1 set.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Menu, Download, Eye, MessageSquarePlus, Loader2 } from 'lucide-react'
import { useLabelDownload } from './useLabelDownload'

const FEEDBACK_MAILTO = 'mailto:ilaunchify@gmail.com?subject=Design%20Studio%20feedback'

export function StudioHeaderMenu({ productId, productName, canDownloadLabels }: { productId: string; productName: string; canDownloadLabels: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { trigger, busy, holder } = useLabelDownload(productId, productName)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const itemClass =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-ink-800 transition-colors hover:bg-ink-50 disabled:opacity-60'

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Studio menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-md border border-ink-200 bg-white text-ink-700 transition-colors hover:bg-ink-50"
      >
        <Menu className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
          <Link role="menuitem" href={`/products/${productId}`} onClick={() => setOpen(false)} className={itemClass}>
            <Eye className="h-4 w-4 text-ink-400" />
            Product details
          </Link>

          {canDownloadLabels && (
            <>
              <div className="my-1 h-px bg-ink-100" />
              <button
                role="menuitem"
                type="button"
                disabled={busy}
                onClick={() => { void trigger(); setOpen(false) }}
                className={itemClass}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin text-ink-400" /> : <Download className="h-4 w-4 text-ink-400" />}
                Download labels
              </button>
            </>
          )}

          <div className="my-1 h-px bg-ink-100" />
          <a role="menuitem" href={FEEDBACK_MAILTO} onClick={() => setOpen(false)} className={itemClass}>
            <MessageSquarePlus className="h-4 w-4 text-ink-400" />
            Send feedback
          </a>
        </div>
      )}
      {holder}
    </div>
  )
}
