'use client'

// PDP redesign — identity-column accordion. Collapsible rows for the
// "additional info" that doesn't belong in the configure box: ingredients,
// allergens, dimensions, shelf life, shipping/returns. Fed from existing
// detail fields by the page (server) — this component is purely the
// open/close chrome. First row open by default.

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

export interface AccordionRow {
  id: string
  title: string
  /** Plain text / inline content for the row body. */
  body: React.ReactNode
}

export function ProductAccordion({ rows }: { rows: AccordionRow[] }) {
  // First row open by default (per the prototype).
  const [openId, setOpenId] = React.useState<string | null>(rows[0]?.id ?? null)

  if (rows.length === 0) return null

  return (
    <div className="mt-5 overflow-hidden rounded-[var(--card-radius)] border border-[var(--card-border)]">
      {rows.map((row, i) => {
        const isOpen = openId === row.id
        return (
          <div
            key={row.id}
            className={i === 0 ? '' : 'border-t border-ink-100'}
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : row.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-[14px] font-semibold text-ink-900 transition-colors hover:bg-ink-50"
            >
              <span>{row.title}</span>
              <ChevronDown
                className={
                  'h-4 w-4 flex-shrink-0 text-ink-400 transition-transform ' +
                  (isOpen ? 'rotate-180' : '')
                }
              />
            </button>
            {isOpen && (
              <div className="px-3.5 pb-3.5 text-[13px] leading-relaxed text-ink-600">
                {row.body}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
