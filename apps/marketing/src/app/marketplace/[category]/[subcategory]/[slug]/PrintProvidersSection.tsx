'use client'

// Print-provider cards (docs/PRINT_PROVIDER_SELECTION.md §3, PS-2 — read-only).
// Printify's pattern, our rails: big rating first, real production numbers,
// Provider Details modal fed entirely from onboarding data. "Select this
// provider" ships with PS-3 (binding) — until then the cards inform.

import { useState } from 'react'
import { RatingStars, RatingBreakdownPopover } from '@ilaunchify/ui'
import type { ProviderCardData, PrintProvidersView } from '@/lib/print-providers'

const PROCESS_LABEL: Record<string, string> = {
  DIGITAL: 'Digital',
  OFFSET: 'Offset',
  FLEXO: 'Flexo',
  GRAVURE: 'Gravure',
  SCREEN: 'Screen',
}
const DECORATION_LABEL: Record<string, string> = {
  DIRECT_PRINT: 'Direct print',
  PRESSURE_SENSITIVE_LABEL: 'PS labels',
  SHRINK_SLEEVE: 'Shrink sleeve',
  IN_MOLD_LABEL: 'In-mold label',
  HEAT_TRANSFER: 'Heat transfer',
  FOIL_STAMP: 'Foil',
  EMBOSS: 'Emboss',
  DEBOSS: 'Deboss',
  SPOT_UV: 'Spot UV',
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600">
      {children}
    </span>
  )
}

function DetailsModal({ p, onClose }: { p: ProviderCardData; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${p.companyName} details`}
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900">{p.companyName}</h3>
            <RatingStars mean={p.rating.mean} count={p.rating.count} isNew={p.rating.isNew} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-ink-200 px-2.5 py-1 text-[13px] text-ink-600 hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            ✕
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-500">Avg production</dt>
            <dd className="font-medium text-ink-900">
              {p.avgProductionDays != null ? `${p.avgProductionDays} days (measured)` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-500">Quoted lead time</dt>
            <dd className="font-medium text-ink-900">{p.leadDaysFrom != null ? `from ${p.leadDaysFrom} days` : '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-500">MOQ</dt>
            <dd className="font-medium text-ink-900">{p.moqFrom != null ? `from ${p.moqFrom.toLocaleString()}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-500">Price</dt>
            <dd className="font-medium text-ink-900">
              {p.priceFromCents != null ? `from $${(p.priceFromCents / 100).toFixed(2)}/unit` : '—'}
            </dd>
          </div>
        </dl>

        {p.outputSpec && (
          <div className="mt-5">
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Output spec</h4>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] text-ink-700">
              <div>File: <span className="font-medium text-ink-900">{p.outputSpec.fileFormat}</span></div>
              <div>Color: <span className="font-medium text-ink-900">{p.outputSpec.colorSpace}</span></div>
              <div>Min DPI: <span className="font-medium text-ink-900">{p.outputSpec.minDpi}</span></div>
              <div>Bleed: <span className="font-medium text-ink-900">{p.outputSpec.bleedMm}mm</span></div>
              <div>Spot colors: <span className="font-medium text-ink-900">{p.outputSpec.spotColors ? 'Yes' : 'No'}</span></div>
              <div>TAC limit: <span className="font-medium text-ink-900">{p.outputSpec.tacLimitPct}%</span></div>
            </dl>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-1.5">
          {p.processes.map((x) => <Chip key={x}>{PROCESS_LABEL[x] ?? x}</Chip>)}
          {p.decorationMethods.map((x) => <Chip key={x}>{DECORATION_LABEL[x] ?? x}</Chip>)}
          {p.foodContactSafe && <Chip>Food-contact inks</Chip>}
          <Chip>{p.dielineCount} dieline{p.dielineCount === 1 ? '' : 's'}</Chip>
          <Chip>{p.substrateCount} material{p.substrateCount === 1 ? '' : 's'}</Chip>
        </div>

        {p.rating.dims.length > 0 && (
          <div className="mt-5 border-t border-ink-100 pt-4">
            <RatingBreakdownPopover mean={p.rating.mean ?? 0} count={p.rating.count} dims={p.rating.dims} />
          </div>
        )}
      </div>
    </div>
  )
}

export function PrintProvidersSection({ view }: { view: PrintProvidersView }) {
  const [detailsFor, setDetailsFor] = useState<ProviderCardData | null>(null)

  if (view.providers.length === 0 && view.filteredOutCount === 0) return null

  return (
    <section id="print-providers" className="max-w-[1640px] mx-auto px-8 mb-24 scroll-mt-24">
      <h2 className="font-display text-ui-display mb-2">Print providers</h2>
      <p className="mb-6 max-w-2xl text-[13px] text-ink-600">
        {view.mode === 'EXTERNAL_REQUIRED'
          ? 'This manufacturer works with independent print partners — one of these providers will print your labels and decoration.'
          : 'This manufacturer can print in-house, or one of these independent providers can handle your labels and decoration.'}{' '}
        Ratings come only from creators with delivered orders.
      </p>

      <div className="space-y-3">
        {view.providers.map((p) => (
          <article
            key={p.serviceId}
            className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-ink-200 bg-white px-5 py-4"
          >
            {/* Big score first — the Printify pattern */}
            <div className="min-w-[220px]">
              <div className="flex items-center gap-2">
                <RatingStars mean={p.rating.mean} count={p.rating.count} isNew={p.rating.isNew} size={15}>
                  {!p.rating.isNew && p.rating.mean != null && (
                    <RatingBreakdownPopover mean={p.rating.mean} count={p.rating.count} dims={p.rating.dims} />
                  )}
                </RatingStars>
              </div>
              <h3 className="mt-0.5 font-display text-[16px] font-semibold text-ink-900">{p.companyName}</h3>
            </div>

            <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px] text-ink-600">
              <div>
                <dt className="inline text-ink-400">Price </dt>
                <dd className="inline font-medium text-ink-900">
                  {p.priceFromCents != null ? `from $${(p.priceFromCents / 100).toFixed(2)}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="inline text-ink-400">MOQ </dt>
                <dd className="inline font-medium text-ink-900">{p.moqFrom?.toLocaleString() ?? '—'}</dd>
              </div>
              <div>
                <dt className="inline text-ink-400">Avg production </dt>
                <dd className="inline font-medium text-ink-900">
                  {p.avgProductionDays != null ? `${p.avgProductionDays}d` : p.leadDaysFrom != null ? `~${p.leadDaysFrom}d quoted` : '—'}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-1.5">
              {p.decorationMethods.slice(0, 3).map((x) => <Chip key={x}>{DECORATION_LABEL[x] ?? x}</Chip>)}
              {p.foodContactSafe && <Chip>Food-contact inks</Chip>}
            </div>

            <div className="ml-auto">
              <button
                type="button"
                onClick={() => setDetailsFor(p)}
                className="rounded-full border border-ink-200 bg-white px-4 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                Provider info
              </button>
              {/* "Select this provider" lands with PS-3 (binding). */}
            </div>
          </article>
        ))}
      </div>

      {view.filteredOutCount > 0 && (
        <p className="mt-4 text-[12px] text-ink-500">
          {view.filteredOutCount} provider{view.filteredOutCount === 1 ? ' was' : 's were'} filtered
          out — no offering for this product's format or temporarily unavailable.
        </p>
      )}

      {detailsFor && <DetailsModal p={detailsFor} onClose={() => setDetailsFor(null)} />}
    </section>
  )
}
