'use client'

// Track C / C4.b — label-format picker. Surfaces recommendLabelFormats (C4.a)
// in the Label drawer: shows the recommended FDA-approved format for this
// product's labeling type + label surface, and a dropdown of valid alternatives
// (only formats that fit the dieline). Selection is local for now — binding the
// choice to the rendered panel lands with the format-aware renderer (C3).

import * as React from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import type { LabelingType } from '@ilaunchify/db'
import { InfoTip } from '../InfoTip'
import {
  recommendLabelFormats,
  type RecommendedFormat,
  type RecommendFormatsResult,
} from '../label-format-actions'

function humanFormat(f: string): string {
  return f
    .replace(/^FDA_/, 'FDA ')
    .replace(/^AAFCO_/, 'AAFCO ')
    .replace(/^USDA_OLD_FDA_/, 'USDA/Old-FDA ')
    .replace(/^CANADIAN_/, 'Canadian ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Fda/g, 'FDA')
    .replace(/Aafco/g, 'AAFCO')
    .replace(/Usda/g, 'USDA')
}

export function LabelFormatPicker({
  labelingType,
  widthMm,
  heightMm,
  onFormatChange,
}: {
  labelingType: LabelingType
  widthMm: number
  heightMm: number
  /** Fired when the creator picks a format (re-renders the on-canvas panel). */
  onFormatChange?: (format: string) => void
}) {
  const [data, setData] = React.useState<RecommendFormatsResult | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    recommendLabelFormats({ labelingType, widthMm, heightMm, flavorCount: 1 })
      .then((res) => {
        if (!alive) return
        setData(res)
        setSelected(res.recommended?.format ?? null)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [labelingType, widthMm, heightMm])

  const all: RecommendedFormat[] = data
    ? [data.recommended, ...data.alternatives].filter((x): x is RecommendedFormat => !!x)
    : []
  const current = all.find((f) => f.format === selected) ?? data?.recommended ?? null

  return (
    <section>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
        Label format
        {!loading && all.length > 0 && (
          <InfoTip
            text={`${all.length} FDA-approved format${all.length === 1 ? '' : 's'} fit your ${Math.round(widthMm)}×${Math.round(heightMm)} mm label${data ? ` (${data.trimSurfaceAreaSqIn.toFixed(1)} sq in)` : ''}. Switching re-renders the panel once the format-aware renderer ships.`}
          />
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-ink-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding formats for your label…
        </div>
      ) : all.length === 0 ? (
        <p className="text-[11px] text-ink-400 italic leading-[1.45]">
          No FDA-approved format fits this label surface yet. Increase the label size or check the
          product&apos;s labeling type.
        </p>
      ) : (
        <div className="space-y-2">
          <select
            value={selected ?? ''}
            onChange={(e) => {
              setSelected(e.target.value)
              onFormatChange?.(e.target.value)
            }}
            className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          >
            {all.map((f) => (
              <option key={f.format} value={f.format}>
                {humanFormat(f.format)}
                {data?.recommended?.format === f.format ? '  · recommended' : ''}
              </option>
            ))}
          </select>

          {current && (
            <div className="rounded-md border border-ink-200 bg-ink-50/50 px-2.5 py-2 text-[11px] text-ink-600">
              {data?.recommended?.format === current.format && (
                <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-800">
                  <Sparkles className="h-2.5 w-2.5" /> Recommended
                </span>
              )}
              <div className="mt-0.5">
                {current.panelOrientation.charAt(0) + current.panelOrientation.slice(1).toLowerCase()}{' '}
                orientation · <span className="font-mono text-[10px]">{current.cfrCitation}</span>
              </div>
              {current.notes && <p className="mt-1 text-ink-500">{current.notes}</p>}
            </div>
          )}

        </div>
      )}
    </section>
  )
}
