'use client'

// FinishesDrawer — F3a (DISPLAY-ONLY). Shows the print finishes & coatings THIS
// product offers: the partner's ProductTemplateFinish allow-list, resolved
// server-side in page.tsx#loadStudioFinishes and threaded down through
// CanvasLayoutShell. The drawer only mounts when partnerOffersFinishes is true
// (≥1 offered finish).
//
// Deliberately read-only: no object-level apply, no DesignFinishApplication
// writes, no substrate hard-filter (substrate isn't selected in the Studio yet).
// Those ship in F3b. Finishes are selected/applied at checkout for now — the
// footer note keeps that honest. See docs/PER_DRAFT_FINISHES.md.

import * as React from 'react'
import { Sparkles, Clock } from 'lucide-react'
import type { StudioFinish } from '../page'

// FinishCategory enum → display group label + order. Mirrors the partner
// builder's grouping (PackagingStudioStep.tsx) so creator + partner agree.
const FINISH_CATEGORY_LABEL: Record<string, string> = {
  SURFACE: 'Surface',
  FOIL_METALLIC: 'Foil & metallic',
  EMBOSS_TEXTURE: 'Emboss & texture',
  CUT: 'Cut',
  INK: 'Ink',
  SPECIAL: 'Special',
}
const FINISH_CATEGORY_ORDER = ['SURFACE', 'FOIL_METALLIC', 'EMBOSS_TEXTURE', 'CUT', 'INK', 'SPECIAL']

const sectionLabel = 'text-[12px] font-bold uppercase tracking-wider text-ink-700'

export function FinishesDrawer({ finishes }: { finishes: StudioFinish[] }) {
  // Group by category, preserving the canonical order; unknown categories fall
  // to the end in first-seen order.
  const groups = React.useMemo(() => {
    const by: Record<string, StudioFinish[]> = {}
    for (const f of finishes) (by[f.category] ??= []).push(f)
    const known = FINISH_CATEGORY_ORDER.filter((c) => by[c]?.length).map((c) => ({
      category: c,
      items: by[c]!,
    }))
    const extra = Object.keys(by)
      .filter((c) => !FINISH_CATEGORY_ORDER.includes(c))
      .map((c) => ({ category: c, items: by[c]! }))
    return [...known, ...extra]
  }, [finishes])

  if (finishes.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-ink-200 bg-ink-50/60 p-4">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
          <div>
            <div className="text-[12.5px] font-bold text-ink-900">No finishes offered</div>
            <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-600">
              The manufacturer for this product hasn&rsquo;t published any premium
              print finishes. If you need foil, spot UV, or another effect, message
              your partner or reach out to iLaunchify support.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[13px] font-bold text-ink-900">Finishes</div>
        <p className="mt-0.5 text-[11.5px] leading-[1.5] text-ink-600">
          Print finishes &amp; coatings available for this product.
        </p>
      </div>

      {groups.map((g) => (
        <div key={g.category}>
          <div className={`${sectionLabel} mb-2`}>
            {FINISH_CATEGORY_LABEL[g.category] ?? g.category}
          </div>
          <ul className="space-y-2">
            {g.items.map((f) => (
              <li
                key={f.partnerFinishId}
                className="rounded-md border border-ink-200 bg-[var(--studio-panel-bg)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-ink-900">
                      {f.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-600">
                        {FINISH_CATEGORY_LABEL[f.category] ?? f.category}
                      </span>
                      {f.isDefault && (
                        <span className="rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success-700">
                          Recommended
                        </span>
                      )}
                      {f.isIncludedInPrice && (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-600">
                          Included
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    {f.pricingSummary && (
                      <span className="text-[11px] font-medium text-ink-700">
                        {f.pricingSummary}
                      </span>
                    )}
                    {f.leadTimeDays > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-500">
                        <Clock className="h-3 w-3" />+{f.leadTimeDays}d
                      </span>
                    )}
                  </div>
                </div>
                {f.note && (
                  <p className="mt-2 text-[11px] leading-[1.45] text-ink-500">{f.note}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3">
        <p className="text-[11px] leading-[1.45] text-ink-600">
          Finishes are selected and applied to your order at checkout. Applying a
          finish to specific objects in your design ships in a later update.
        </p>
      </div>
    </div>
  )
}
