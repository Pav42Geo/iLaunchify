'use client'

// Track C / C6 — eligible-claims surface for the Label drawer.
//
// Runs the pure suggestNutrientClaims() engine against the product's Nutrition
// Facts data and lists the nutrient-content claims the product MAY print, each
// with its 21 CFR citation + numeric basis. Clicking one drops it on the canvas
// as an editable marketing text. V1 evaluates the sample/placeholder dataset
// (same as the panels themselves) — real values bind at print/export, so the
// list re-derives then.

import * as React from 'react'
import { Plus } from 'lucide-react'
import { addText, type FabricCanvas, type NutritionPanelData } from '@ilaunchify/ui'
import { InfoTip } from '../InfoTip'
import {
  suggestNutrientClaims,
  type NutrientClaim,
  type ClaimStrength,
} from '../lib/nutrientClaims'

const STRENGTH_BADGE: Record<ClaimStrength, string> = {
  free: 'bg-emerald-100 text-emerald-800',
  excellent: 'bg-emerald-100 text-emerald-800',
  low: 'bg-teal-100 text-teal-800',
  good: 'bg-amber-100 text-amber-800',
  none: 'bg-zinc-100 text-zinc-600',
}

const STRENGTH_ORDER: Record<ClaimStrength, number> = {
  free: 0,
  excellent: 1,
  low: 2,
  good: 3,
  none: 4,
}

export function ClaimSuggestions({
  canvas,
  data,
}: {
  canvas: FabricCanvas | null
  data: NutritionPanelData
}) {
  const claims = React.useMemo(() => {
    const list = suggestNutrientClaims(data)
    return list.sort(
      (a, b) =>
        STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength] ||
        a.nutrient.localeCompare(b.nutrient),
    )
  }, [data])

  function addClaim(claim: NutrientClaim) {
    if (!canvas) return
    addText(canvas, claim.claim, { fontSize: 18, fontWeight: 700, fill: '#0F1116' })
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        Eligible claims
        <InfoTip
          text="Nutrient-content claims this product qualifies to print, per 21 CFR 101.54/101.60/101.61/101.62, based on the panel values. Eligibility only — some claims carry extra conditions (shown on hover). Real product values bind at print, so the list re-derives then."
        />
      </div>

      {claims.length === 0 ? (
        <p className="text-[11px] italic leading-[1.45] text-ink-400">
          No nutrient-content claims qualify for the current values.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {claims.map((c, i) => (
            <li
              key={`${c.claim}-${i}`}
              className="flex items-start gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-ink-900">{c.claim}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide ${STRENGTH_BADGE[c.strength]}`}
                  >
                    {c.strength}
                  </span>
                  {c.caveat && <InfoTip text={c.caveat} />}
                </div>
                <p className="mt-0.5 truncate text-[10.5px] text-ink-500" title={c.basis}>
                  {c.basis}
                </p>
                <p className="font-mono text-[9.5px] text-ink-400">{c.cfr}</p>
              </div>
              <button
                type="button"
                onClick={() => addClaim(c)}
                disabled={!canvas}
                className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-ink-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-ink-700 disabled:opacity-40"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
