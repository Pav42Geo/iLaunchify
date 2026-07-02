'use client'

// Phase L1.2a — "Storage releases" card on the dispatch detail page.
// Rendered only for HOLD_AT_MANUFACTURER orders where THIS dispatch belongs to
// the storing service (page.tsx enforces that with the partnerServiceId match
// in the StorageAgreement query). The partner works each creator-requested
// release REQUESTED → PICKING → SHIPPED (tracking required) → DELIVERED via
// ./releases-actions.ts; SHIPPED is the step that draws down the stored
// balance server-side.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Warehouse } from 'lucide-react'
import {
  startReleasePicking,
  shipStorageRelease,
  deliverStorageRelease,
} from './releases-actions'

export interface StorageReleaseView {
  id: string
  status: 'REQUESTED' | 'PICKING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
  quantity: number
  destinationSummary: string
  tracking: string | null
  requestedAt: string
}

const RELEASE_PILL: Record<StorageReleaseView['status'], { label: string; cls: string }> = {
  REQUESTED: { label: 'Requested', cls: 'border-info-200 bg-info-50 text-info-800' },
  PICKING: { label: 'Picking', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
  SHIPPED: { label: 'Shipped', cls: 'border-info-200 bg-info-50 text-info-800' },
  DELIVERED: { label: 'Delivered', cls: 'border-success-200 bg-success-50 text-success-800' },
  CANCELLED: { label: 'Cancelled', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
}

const MODE_LABEL: Record<string, string> = {
  ON_DEMAND: 'On-demand fulfillment',
  STOCK_RELEASE: 'Stock release',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function StorageReleasesCard({
  dispatchId,
  mode,
  agreementStatus,
  unitsRemaining,
  releases,
}: {
  dispatchId: string
  mode: string
  agreementStatus: 'ACTIVE' | 'RELEASING' | 'CLOSED'
  unitsRemaining: number
  releases: StorageReleaseView[]
}) {
  const open = releases.filter((r) => r.status === 'REQUESTED' || r.status === 'PICKING')

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
        <Warehouse className="h-4 w-4 text-ink-500" aria-hidden="true" /> Storage releases
      </h2>
      <p className="mt-1 text-[12.5px] text-ink-600">
        This order is stored at your facility ({MODE_LABEL[mode] ?? mode}).{' '}
        <span className="font-medium tabular-nums text-ink-800">
          {unitsRemaining.toLocaleString()} units
        </span>{' '}
        remaining
        {agreementStatus === 'CLOSED'
          ? ' — agreement closed.'
          : open.length > 0
            ? ` · ${open.length} release${open.length === 1 ? '' : 's'} to work.`
            : ' · no open releases.'}
      </p>

      {releases.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink-200 bg-ink-50/40 p-4 text-[12.5px] text-ink-500">
          No releases yet — the creator triggers releases from their order page.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {releases.map((r) => (
            <ReleaseRow key={r.id} release={r} dispatchId={dispatchId} />
          ))}
        </ul>
      )}
    </section>
  )
}

// ===========================================================================
// One release row + its status-appropriate action
// ===========================================================================

function ReleaseRow({
  release: r,
  dispatchId,
}: {
  release: StorageReleaseView
  dispatchId: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [carrier, setCarrier] = useState('')
  const [trackingNo, setTrackingNo] = useState('')
  const pill = RELEASE_PILL[r.status]

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(true)
    try {
      const res = await fn()
      if (!res.ok) {
        toast.error(res.error ?? 'Failed')
        return
      }
      toast.success(success)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-ink-200 p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-wider ${pill.cls}`}
        >
          {pill.label}
        </span>
        <span className="text-[13px] font-semibold tabular-nums text-ink-900">
          {r.quantity.toLocaleString()} units
        </span>
        <span className="min-w-0 truncate text-[12.5px] text-ink-600" title={r.destinationSummary}>
          → {r.destinationSummary}
        </span>
        <span className="ml-auto text-[11.5px] tabular-nums text-ink-500">
          Requested {fmtDate(r.requestedAt)}
        </span>
      </div>

      {r.tracking && (
        <p className="mt-1.5 font-mono text-[11.5px] text-ink-600">Tracking · {r.tracking}</p>
      )}

      {r.status === 'REQUESTED' && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(() => startReleasePicking({ dispatchId, releaseId: r.id }), 'Picking started')
          }
          className="mt-3 inline-flex items-center rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Start picking'}
        </button>
      )}

      {r.status === 'PICKING' && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                Carrier
              </span>
              <input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="UPS / FedEx / freight line"
                className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[13px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                Tracking number
              </span>
              <input
                value={trackingNo}
                onChange={(e) => setTrackingNo(e.target.value)}
                placeholder="1Z… / PRO number"
                className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 font-mono text-[13px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !carrier.trim() || !trackingNo.trim()}
            onClick={() =>
              run(
                () =>
                  shipStorageRelease({
                    dispatchId,
                    releaseId: r.id,
                    trackingCarrier: carrier,
                    trackingNumber: trackingNo,
                  }),
                'Release shipped — stored balance updated',
              )
            }
            className="inline-flex items-center rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Mark shipped'}
          </button>
          <p className="text-[11px] text-ink-500">
            Shipping deducts {r.quantity.toLocaleString()} units from the stored balance.
          </p>
        </div>
      )}

      {r.status === 'SHIPPED' && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(() => deliverStorageRelease({ dispatchId, releaseId: r.id }), 'Marked delivered')
          }
          className="mt-3 inline-flex items-center rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-800 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Mark delivered'}
        </button>
      )}
    </li>
  )
}
