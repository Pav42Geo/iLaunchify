'use client'

// "Order a sample" — marketplace product-detail card (Pavel 2026-06-10).
// Lets a creator de-risk before a full production run. Shows the sample kinds
// the partner enabled (Unbranded / Branded), per-flavor or sampler-set
// selection, and a live quote with the credit-toward-first-order note. Branded
// stays locked until the product's dieline passes compliance.
//
// Order placement (a SAMPLE order that bypasses MOQ + applies the credit) is the
// next slice — the CTA computes the validated quote and is wired there.

import * as React from 'react'
import { Beaker, Package, Minus, Plus, Check } from 'lucide-react'
import { quoteSample, formatCents, hasSamplerSet, type SampleOption, type SampleMode } from '@/lib/sample-quote'
import { creatorUrl } from '@/lib/app-urls'

const CTA_BTN = 'mt-3 block w-full rounded-full bg-ink-900 px-4 py-2.5 text-center text-[13px] font-semibold text-white transition-colors hover:bg-ink-800'

interface SampleOrderCardProps {
  options: SampleOption[] // enabled only
  flavorNames: string[]
  isMultiFlavor: boolean
  dielineReady: boolean
  isAuthenticated: boolean
  /** The creator's owned Product for this template (samples require one). */
  ownedProductId: string | null
}

const KIND_META = {
  UNBRANDED: { label: 'Unbranded', sub: 'Your recipe, plain packaging', Icon: Beaker },
  BRANDED: { label: 'Branded', sub: 'In your packaging + artwork', Icon: Package },
} as const

export function SampleOrderCard({ options, flavorNames, isMultiFlavor, isAuthenticated, ownedProductId }: SampleOrderCardProps) {
  const kinds = options.map((o) => o.kind)
  const [activeKind, setActiveKind] = React.useState(() => (kinds.includes('UNBRANDED') ? 'UNBRANDED' : kinds[0]) as 'UNBRANDED' | 'BRANDED')
  const opt = options.find((o) => o.kind === activeKind) ?? options[0]

  const samplerAvailable = isMultiFlavor && !!opt && hasSamplerSet(opt)
  const [mode, setMode] = React.useState<SampleMode>('PER_FLAVOR')
  // Single-flavor products use one synthetic entry keyed by ''.
  const pool = isMultiFlavor ? flavorNames : ['']
  const [units, setUnits] = React.useState<Record<string, number>>({})

  if (!opt) return null

  const effectiveMode: SampleMode = samplerAvailable ? mode : 'PER_FLAVOR'
  const quote = quoteSample(opt, { mode: effectiveMode, unitsByFlavor: units }, isMultiFlavor)

  // The selection produces a valid, orderable quote (≥1 unit, no blocking
  // errors). This — NOT a die-line — is what enables the CTA. Branded routes
  // into the Design Studio to author the artwork; unbranded routes straight to
  // the existing sample checkout. (The old code disabled the CTA whenever the
  // creator didn't already own a Product, and additionally replaced the whole
  // branded selection UI with a die-line "locked" warning, so a branded sample
  // could never even build a quote — that's why it stayed disabled.)
  const quoteValid = quote.unitCount > 0 && quote.errors.length === 0

  const setUnit = (flavor: string, n: number) => setUnits((u) => ({ ...u, [flavor]: Math.max(0, n) }))

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-50 text-pink-700"><Beaker className="h-4 w-4" /></span>
          <h3 className="font-display text-[16px] font-bold text-ink-900">Order a sample</h3>
        </div>
        <span className="text-[11px] font-medium text-ink-500">Bypasses production MOQ</span>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-600">Try this product before committing to a full run.</p>

      {/* Kind selector */}
      {options.length > 1 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {options.map((o) => {
            const meta = KIND_META[o.kind]
            const on = o.kind === activeKind
            return (
              <button
                key={o.kind}
                type="button"
                onClick={() => setActiveKind(o.kind)}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 hover:border-pink-200'}`}
              >
                <meta.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${on ? 'text-pink-700' : 'text-ink-500'}`} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink-900">{meta.label}</span>
                  <span className="block text-[11px] leading-tight text-ink-500">{meta.sub}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      <>
          {/* Branded note — a branded sample needs the creator's artwork, so the
              CTA below leads into the Design Studio to author it (not a blocker). */}
          {activeKind === 'BRANDED' && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-pink-200 bg-pink-50 px-3 py-2.5 text-[12.5px] text-ink-700">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-pink-700" />
              <span>A branded sample is produced from your packaging artwork. Pick what to sample, then design the label in the Studio.</span>
            </div>
          )}

          {/* Mode toggle (multi-flavor with a sampler-set price) */}
          {samplerAvailable && (
            <div className="mt-4 inline-flex rounded-lg border border-ink-200 p-0.5 text-[12px] font-semibold">
              <button type="button" onClick={() => setMode('PER_FLAVOR')} className={`rounded-md px-3 py-1.5 transition-colors ${mode === 'PER_FLAVOR' ? 'bg-ink-900 text-white' : 'text-ink-600'}`}>Per flavor</button>
              <button type="button" onClick={() => setMode('SAMPLER_SET')} className={`rounded-md px-3 py-1.5 transition-colors ${mode === 'SAMPLER_SET' ? 'bg-ink-900 text-white' : 'text-ink-600'}`}>Sampler set</button>
            </div>
          )}

          {/* Selection */}
          {effectiveMode === 'SAMPLER_SET' ? (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-3">
              <span className="text-[13px] font-medium text-ink-800">All-flavors sampler set <span className="text-ink-500">· {pool.length} flavors</span></span>
              <span className="text-[14px] font-bold text-ink-900">{formatCents(opt.samplerSetCents ?? 0)}</span>
            </div>
          ) : (
            <div className="mt-3 space-y-1.5">
              {pool.map((f) => (
                <div key={f || 'unit'} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2">
                  <span className="min-w-0 truncate text-[13px] text-ink-800">{isMultiFlavor ? f : 'Sample units'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-400">{formatCents(opt.perFlavorCents ?? 0)}/ea</span>
                    <Stepper value={units[f] ?? 0} onChange={(n) => setUnit(f, n)} max={opt.maxUnitsPerFlavor ?? undefined} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quote */}
          <div className="mt-4 border-t border-ink-100 pt-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-ink-600">{quote.unitCount} unit{quote.unitCount === 1 ? '' : 's'} · {opt.leadTimeDays}-day lead</span>
              <span className="font-bold text-ink-900">{formatCents(quote.subtotalCents)}</span>
            </div>
            {quote.creditEnabled && quote.subtotalCents > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-success-700">
                <Check className="h-3.5 w-3.5" />
                {formatCents(quote.creditableCents)} credited toward your first production order
              </div>
            )}
            {quote.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {quote.errors.map((e, i) => <li key={i} className="text-[11.5px] text-warning-700">{e}</li>)}
              </ul>
            )}
          </div>

          {/* CTA — label + destination switch on the selected kind:
              • BRANDED  → "Design a sample"  → Design Studio (author the label/
                           die-line first, since branded needs artwork).
              • UNBRANDED → "Order sample"    → existing sample checkout (no
                           design/die-line required).
              Enabled once a valid quote exists (≥1 unit, no errors). Both routes
              require an owned Product; without one we guide the creator to
              customize first (Launch above creates the product). */}
          {(() => {
            const branded = activeKind === 'BRANDED'
            const ctaLabel = branded ? 'Design a sample →' : 'Order sample →'
            // Branded authors artwork in the Studio; unbranded goes to checkout.
            const href = ownedProductId
              ? branded
                ? creatorUrl(`/products/${ownedProductId}/design/canvas`)
                : creatorUrl(`/products/${ownedProductId}/sample`)
              : null

            if (!isAuthenticated) {
              return <a href={creatorUrl('/login')} className={CTA_BTN}>Sign in to order a sample</a>
            }
            if (!ownedProductId) {
              return (
                <>
                  <span className={`${CTA_BTN} cursor-not-allowed opacity-40`}>{ctaLabel}</span>
                  <p className="mt-2 text-center text-[11px] text-ink-500">Customize this product first (Start launching above) to order a sample.</p>
                </>
              )
            }
            if (!quoteValid) {
              return <span className={`${CTA_BTN} cursor-not-allowed opacity-40`}>{ctaLabel}</span>
            }
            return <a href={href!} className={CTA_BTN}>{ctaLabel}</a>
          })()}
          <p className="mt-2 text-center text-[11px] text-ink-400">Produced to order · not for resale</p>
        </>
    </div>
  )
}

function Stepper({ value, onChange, max }: { value: number; onChange: (n: number) => void; max?: number }) {
  const atMax = max != null && value >= max
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="Decrease" onClick={() => onChange(value - 1)} disabled={value <= 0} className="grid h-7 w-7 place-items-center rounded-md border border-ink-200 text-ink-700 disabled:opacity-40 hover:border-pink-300">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center text-[13px] font-semibold tabular-nums text-ink-900">{value}</span>
      <button type="button" aria-label="Increase" onClick={() => onChange(value + 1)} disabled={atMax} className="grid h-7 w-7 place-items-center rounded-md border border-ink-200 text-ink-700 disabled:opacity-40 hover:border-pink-300">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
