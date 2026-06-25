'use client'

// Admin editor for the §7 marketplace FILTER dimensions on a template:
// Format (single) · Manufacturing processes · Allergen-free claims · Markets.
// Values come from the shared option lists in @ilaunchify/types — the same
// source the marketplace sidebar filters on — so what's set here always
// matches what buyers can filter by.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  FORMAT_OPTIONS,
  MANUFACTURING_PROCESS_OPTIONS,
  ALLERGEN_FREE_OPTIONS,
  MARKET_FILTER_OPTIONS,
  type FilterOption,
} from '@ilaunchify/types'
import { adminSetMarketplaceAttributes } from '../actions'

export interface MarketplaceAttributesInitial {
  manufacturingFormat: string | null
  manufacturingProcesses: string[]
  allergenFreeClaims: string[]
  marketCodes: string[]
  ratingAvg: number | null
  ratingCount: number
}

export function MarketplaceAttributesPanel({
  productTemplateId,
  initial,
}: {
  productTemplateId: string
  initial: MarketplaceAttributesInitial
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [format, setFormat] = useState<string | null>(initial.manufacturingFormat)
  const [processes, setProcesses] = useState<Set<string>>(new Set(initial.manufacturingProcesses))
  const [allergenFree, setAllergenFree] = useState<Set<string>>(new Set(initial.allergenFreeClaims))
  const [markets, setMarkets] = useState<Set<string>>(
    new Set(initial.marketCodes.length ? initial.marketCodes : ['US']),
  )
  const [ratingAvg, setRatingAvg] = useState<string>(initial.ratingAvg == null ? '' : String(initial.ratingAvg))
  const [ratingCount, setRatingCount] = useState<string>(String(initial.ratingCount ?? 0))
  const [status, setStatus] = useState<string | null>(null)

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    set((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    setStatus(null)
  }

  function save() {
    start(async () => {
      const res = await adminSetMarketplaceAttributes({
        productTemplateId,
        manufacturingFormat: format,
        manufacturingProcesses: [...processes],
        allergenFreeClaims: [...allergenFree],
        marketCodes: [...markets],
        ratingAvg: ratingAvg.trim() === '' ? null : Number(ratingAvg),
        ratingCount: Number(ratingCount) || 0,
      })
      if (res.ok) {
        setStatus('Saved')
        toast.success('Marketplace attributes saved')
        router.refresh()
      } else {
        setStatus(res.error)
        toast.error(res.error)
      }
    })
  }

  return (
    <section className="rounded-3xl border border-ink-200 bg-white">
      <div className="flex items-center gap-2 rounded-t-3xl border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
        <SlidersHorizontal className="h-4 w-4 text-ink-600" />
        <h3 className="font-display text-[15px] font-semibold text-ink-900">Marketplace filters</h3>
        <span className="ml-auto text-[11.5px] text-ink-500">Drives the §7 catalog filters</span>
      </div>

      <div className="space-y-5 p-5">
        {/* Format — single-select */}
        <div>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-[12px] font-semibold text-ink-800">Format</span>
            <span className="text-[11.5px] text-ink-500">Physical production form (single).</span>
            {format && (
              <button
                type="button"
                onClick={() => { setFormat(null); setStatus(null) }}
                className="ml-auto text-[11px] font-semibold text-pink-700 hover:text-pink-600"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FORMAT_OPTIONS.map((o) => (
              <Pill key={o.value} active={format === o.value} onClick={() => { setFormat(o.value); setStatus(null) }}>
                {o.label}
              </Pill>
            ))}
          </div>
        </div>

        <CheckboxField
          label="Manufacturing process"
          hint="How it's produced. Multi-select."
          options={MANUFACTURING_PROCESS_OPTIONS}
          active={processes}
          onToggle={(v) => toggle(setProcesses, v)}
        />

        <CheckboxField
          label="Allergen-free claims"
          hint="An explicit free-from CLAIM — only check what the product is verified to be."
          options={ALLERGEN_FREE_OPTIONS}
          active={allergenFree}
          onToggle={(v) => toggle(setAllergenFree, v)}
        />

        <CheckboxField
          label="Markets"
          hint="Markets this template is available in. V1: US only is ACTIVE."
          options={MARKET_FILTER_OPTIONS}
          active={markets}
          onToggle={(v) => toggle(setMarkets, v)}
        />

        <div>
          <div className="mb-2">
            <span className="text-[12px] font-semibold text-ink-800">Rating</span>
            <span className="ml-2 text-[11.5px] text-ink-500">
              Curated for V1. Leave avg blank (or count 0) → the storefront shows “New”, not a score.
            </span>
          </div>
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-[13px] text-ink-700">
              Avg (0–5)
              <input
                type="number" min={0} max={5} step={0.1}
                value={ratingAvg}
                onChange={(e) => { setRatingAvg(e.target.value); setStatus(null) }}
                className="w-20 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-700">
              Count
              <input
                type="number" min={0} step={1}
                value={ratingCount}
                onChange={(e) => { setRatingCount(e.target.value); setStatus(null) }}
                className="w-24 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-ink-100 pt-4">
          {status && <span className="text-[12px] text-ink-500">{status}</span>}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            {pending ? 'Saving…' : 'Save attributes'}
          </button>
        </div>
      </div>
    </section>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'h-7 rounded-full border px-3 text-[12px] font-semibold transition-colors ' +
        (active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400')
      }
    >
      {children}
    </button>
  )
}

function CheckboxField({
  label,
  hint,
  options,
  active,
  onToggle,
}: {
  label: string
  hint?: string
  options: FilterOption[]
  active: Set<string>
  onToggle: (value: string) => void
}) {
  return (
    <div>
      <div className="mb-2">
        <span className="text-[12px] font-semibold text-ink-800">{label}</span>
        {hint && <span className="ml-2 text-[11.5px] text-ink-500">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((o) => {
          const on = active.has(o.value)
          return (
            <label key={o.value} className={'flex cursor-pointer items-center gap-2 text-[13px] ' + (on ? 'text-ink-900' : 'text-ink-600')}>
              <button
                type="button"
                onClick={() => onToggle(o.value)}
                aria-pressed={on}
                className={
                  'relative h-4 w-4 flex-shrink-0 rounded border-[1.5px] transition-colors ' +
                  (on ? 'border-pink-500 bg-pink-500' : 'border-ink-300 hover:border-ink-500')
                }
              >
                {on && (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">
                    ✓
                  </span>
                )}
              </button>
              {o.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}
