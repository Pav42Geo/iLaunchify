'use client'

// Phase L1.2a — "Stored at manufacturer" panel for HOLD_AT_MANUFACTURER orders
// (docs/LOGISTICS_AND_FULFILLMENT.md §4 + §9). Shows the storage agreement
// (mode / balance / grace clock / estimated accrued charges), the release
// history, and the "Release stock" form. All data arrives pre-serialized from
// storage-panel-data.ts; the two mutations live in ../storage-release-actions.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Warehouse, PackageOpen, Info } from 'lucide-react'
import { createStorageRelease, cancelStorageRelease } from '../storage-release-actions'
import type { StoragePanelData, StorageReleaseRow } from './storage-panel-data'

// Release-status pills — same inline-palette grammar as the page's dispatch
// vocabulary so the two tables read consistently.
const RELEASE_STATUS: Record<
  StorageReleaseRow['status'],
  { label: string; bg: string; fg: string; border: string; dot: string }
> = {
  REQUESTED: { label: 'Requested',  bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  PICKING:   { label: 'Picking',    bg: '#FAEEDA', fg: '#854F0B', border: '#FAC775', dot: '#BA7517' },
  SHIPPED:   { label: 'Shipped',    bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  DELIVERED: { label: 'Delivered',  bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
  CANCELLED: { label: 'Cancelled',  bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7', dot: '#888780' },
}

const AGREEMENT_STATUS: Record<StoragePanelData['status'], { label: string; cls: string }> = {
  ACTIVE:    { label: 'In storage',          cls: 'border-[#9FE1CB] bg-[#E1F5EE] text-[#085041]' },
  RELEASING: { label: 'Release in progress', cls: 'border-[#B5D4F4] bg-[#E6F1FB] text-[#0C447C]' },
  CLOSED:    { label: 'Closed',              cls: 'border-ink-300 bg-ink-100 text-ink-700' },
}

const MODE_LABEL: Record<StoragePanelData['mode'], string> = {
  ON_DEMAND: 'On-demand fulfillment',
  STOCK_RELEASE: 'Stock release',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function StoredStockPanel({ data }: { data: StoragePanelData }) {
  const statusPill = AGREEMENT_STATUS[data.status]
  const canRelease = data.status === 'ACTIVE' && data.unitsRemaining > 0

  return (
    <section
      aria-labelledby="stored-stock-heading"
      className="overflow-hidden rounded-xl border border-ink-200 bg-white"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-ink-100 bg-[#FAF8F2] px-4 py-2.5">
        <h2
          id="stored-stock-heading"
          className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700"
        >
          <Warehouse className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
          Stored at manufacturer
        </h2>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em] ${statusPill.cls}`}
        >
          {statusPill.label}
        </span>
        <span className="ml-auto text-[11.5px] text-ink-500">{data.partnerName}</span>
      </header>

      <div className="space-y-4 px-5 py-4">
        {/* Agreement facts */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label="Mode" value={MODE_LABEL[data.mode]} />
          <Fact
            label="Units remaining"
            value={data.unitsRemaining.toLocaleString()}
            hint={data.palletsRemaining != null ? `${data.palletsRemaining} pallet${data.palletsRemaining === 1 ? '' : 's'}` : undefined}
          />
          <Fact label="Stored since" value={fmtDate(data.startedAt)} />
          <Fact
            label="Free grace ends"
            value={data.accrual ? fmtDate(data.accrual.graceEndsOn) : '—'}
          />
        </dl>

        {/* Accrued charges */}
        {data.accrual ? (
          <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
                Estimated storage charges to date — billed monthly
              </p>
              <p className="font-display text-[18px] font-bold tabular-nums text-ink-900">
                {dollars(data.accrual.totalCents)}
              </p>
            </div>
            <p className="mt-1 text-[11.5px] tabular-nums text-ink-600">
              {data.accrual.monthsAccrued === 0
                ? 'Inside the free grace period — nothing has accrued yet.'
                : `${data.accrual.monthsAccrued} billing month${data.accrual.monthsAccrued === 1 ? '' : 's'} · storage ${dollars(data.accrual.storageCents)}${data.accrual.pickPackCents > 0 ? ` · pick & pack ${dollars(data.accrual.pickPackCents)}` : ''}`}
            </p>
            <p className="mt-2 inline-flex items-start gap-1 text-[11px] text-ink-500">
              <Info className="mt-[1px] h-3 w-3 flex-shrink-0" aria-hidden="true" />
              Billing execution is pending payments verification — no storage charge has been made yet.
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-ink-300 bg-ink-50/40 p-3 text-[12px] text-ink-500">
            Storage fee details are unavailable for this agreement — contact support if this persists.
          </p>
        )}

        {/* Release history */}
        {data.releases.length > 0 && (
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
              Release history
            </h3>
            <table className="mt-2 w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-100 text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="py-1.5 pr-3 font-semibold">Status</th>
                  <th className="py-1.5 pr-3 font-semibold">Qty</th>
                  <th className="py-1.5 pr-3 font-semibold">Destination</th>
                  <th className="py-1.5 pr-3 font-semibold">Requested</th>
                  <th className="py-1.5 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.releases.map((r) => (
                  <ReleaseRow key={r.id} release={r} orderId={data.orderId} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Release form */}
        {canRelease ? (
          <ReleaseForm
            orderId={data.orderId}
            unitsRemaining={data.unitsRemaining}
            defaultAddress={data.defaultAddress}
          />
        ) : data.status === 'RELEASING' ? (
          <p className="text-[12px] text-ink-600">
            A release is in progress — you can request the next one once it ships (or cancel the
            open request above).
          </p>
        ) : data.status === 'CLOSED' ? (
          <p className="text-[12px] text-ink-600">
            All stored stock has been released
            {data.endedAt ? ` — agreement closed ${fmtDate(data.endedAt)}` : ''}.
          </p>
        ) : null}
      </div>
    </section>
  )
}

// =============================================================================
// Small fact cell for the agreement-summary grid
// =============================================================================

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-widest text-ink-600">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-semibold tabular-nums text-ink-900">{value}</dd>
      {hint && <p className="mt-0.5 text-[10.5px] text-ink-500">{hint}</p>}
    </div>
  )
}

// =============================================================================
// Release-history row (with cancel on REQUESTED)
// =============================================================================

function ReleaseRow({ release: r, orderId }: { release: StorageReleaseRow; orderId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const palette = RELEASE_STATUS[r.status]

  function cancel() {
    start(async () => {
      const res = await cancelStorageRelease({ orderId, releaseId: r.id })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Release cancelled.')
      router.refresh()
    })
  }

  return (
    <tr className="border-b border-ink-50 last:border-0">
      <td className="py-2 pr-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
          style={{ background: palette.bg, color: palette.fg, borderColor: palette.border }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: palette.dot }} />
          {palette.label}
        </span>
      </td>
      <td className="py-2 pr-3 tabular-nums text-ink-800">{r.quantity.toLocaleString()}</td>
      <td className="max-w-[220px] truncate py-2 pr-3 text-ink-700" title={r.destinationSummary}>
        {r.destinationSummary}
        {r.tracking && (
          <span className="ml-1.5 font-mono text-[10.5px] text-ink-500">· {r.tracking}</span>
        )}
      </td>
      <td className="py-2 pr-3 text-ink-500">{fmtDate(r.requestedAt)}</td>
      <td className="py-2 text-right">
        {r.status === 'REQUESTED' && (
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-full px-2.5 py-1 text-[11.5px] font-medium text-danger-700 hover:bg-danger-50 disabled:opacity-50"
          >
            {pending ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </td>
    </tr>
  )
}

// =============================================================================
// Release-stock form — quantity + destination (V1: my address only)
// =============================================================================

function ReleaseForm({
  orderId,
  unitsRemaining,
  defaultAddress,
}: {
  orderId: string
  unitsRemaining: number
  defaultAddress: { label: string; summary: string } | null
}) {
  const router = useRouter()
  const [quantity, setQuantity] = useState('')
  const [pending, start] = useTransition()

  const qty = Math.floor(Number(quantity))
  const qtyValid = Number.isFinite(qty) && qty > 0 && qty <= unitsRemaining
  const canSubmit = qtyValid && defaultAddress !== null && !pending

  function submit() {
    if (!canSubmit) return
    start(async () => {
      const res = await createStorageRelease({ orderId, quantity: qty })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Release requested — the partner will pick and ship your stock.')
      setQuantity('')
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-ink-200 p-3.5">
      <h3 className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-ink-700">
        <PackageOpen className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
        Release stock
      </h3>

      <div className="mt-3 grid gap-3 sm:grid-cols-[140px,1fr]">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-600">
            Quantity
          </span>
          <input
            type="number"
            min={1}
            max={unitsRemaining}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={`≤ ${unitsRemaining.toLocaleString()}`}
            className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[13px] tabular-nums focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </label>

        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-ink-600">
            Destination
          </legend>
          <div className="mt-1 space-y-1.5">
            <label className="flex items-start gap-2 rounded-md border border-ink-200 px-2.5 py-1.5">
              <input
                type="radio"
                name="release-destination"
                checked
                readOnly
                className="mt-[3px] accent-pink-600"
              />
              <span className="min-w-0 text-[12.5px] text-ink-800">
                My address
                {defaultAddress ? (
                  <span className="block truncate text-[11.5px] text-ink-500">
                    {defaultAddress.label} — {defaultAddress.summary}
                  </span>
                ) : (
                  <span className="block text-[11.5px] text-danger-700">
                    No saved address — add one during checkout first.
                  </span>
                )}
              </span>
            </label>
            <label
              className="flex items-start gap-2 rounded-md border border-dashed border-ink-200 px-2.5 py-1.5 opacity-60"
              title="Releasing into a fulfillment center lands with the platform shipping rail"
            >
              <input type="radio" name="release-destination" disabled className="mt-[3px]" />
              <span className="text-[12.5px] text-ink-500">
                To a fulfillment center
                <span className="ml-1.5 inline-flex rounded-full bg-ink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-ink-500">
                  Coming soon
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center justify-center rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Requesting…' : 'Request release'}
        </button>
        {quantity !== '' && !qtyValid && (
          <p className="text-[11.5px] text-danger-700">
            Enter a whole number between 1 and {unitsRemaining.toLocaleString()}.
          </p>
        )}
      </div>
    </div>
  )
}
