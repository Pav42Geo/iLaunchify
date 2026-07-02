'use client'

// Channel-orders inbox client (C2.1): status-chip filtering, Sync now (pull via
// the adapter seam), approve for manual-confirm holds. Reload-after-action keeps
// it simple — volumes are small at this stage.

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, PauseCircle, Clock, Factory } from 'lucide-react'
import { importOrdersForAllConnections, approveChannelOrder } from './ingest'
import { routeChannelOrderToProduction, fulfillChannelOrder, cancelChannelOrder } from './route-actions'

export interface ChannelOrderRow {
  id: string
  externalOrderId: string
  channel: string
  status: string
  statusReason: string | null
  financialStatus: string
  total: string
  placedAtIso: string
  manualConfirmRequired: boolean
  itemSummary: string
}

const FILTERS = ['ALL', 'READY', 'NEEDS_ATTENTION', 'ON_HOLD', 'IN_FULFILLMENT', 'FULFILLED'] as const

const STATUS_TONE: Record<string, string> = {
  READY: 'bg-success-50 text-success-700',
  ROUTED: 'bg-info-50 text-info-700',
  IN_FULFILLMENT: 'bg-info-50 text-info-700',
  FULFILLED: 'bg-success-50 text-success-700',
  CLOSED: 'bg-ink-100 text-ink-600',
  ON_HOLD: 'bg-warning-50 text-warning-700',
  NEEDS_ATTENTION: 'bg-danger-50 text-danger-700',
  CANCELLED: 'bg-ink-100 text-ink-500',
  IMPORTED: 'bg-ink-100 text-ink-600',
  MAPPED: 'bg-ink-100 text-ink-600',
}

export function ChannelOrdersClient({ initial, migrated }: { initial: ChannelOrderRow[]; migrated: boolean }) {
  const router = useRouter()
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>('ALL')
  const [syncing, setSyncing] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4200)
  }

  async function syncNow() {
    setSyncing(true)
    try {
      const s = await importOrdersForAllConnections()
      flash(
        s.errors.length > 0
          ? `Sync finished with issues: ${s.errors[0]}`
          : `Synced — ${s.imported} new (${s.ready} ready · ${s.onHold} on hold · ${s.needsAttention} need attention).`,
      )
      router.refresh()
    } finally {
      setSyncing(false)
    }
  }

  async function approve(id: string) {
    setBusyId(id)
    try {
      const res = await approveChannelOrder(id)
      flash(res.ok ? 'Order approved — hit “Route & pay” to send it to production.' : res.error ?? 'Could not approve.')
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function fulfill(id: string) {
    const carrier = window.prompt('Carrier (e.g. USPS, UPS):')
    if (carrier === null) return
    const trackingNumber = window.prompt('Tracking number:')
    if (trackingNumber === null) return
    setBusyId(id)
    try {
      const res = await fulfillChannelOrder({ channelOrderId: id, carrier, trackingNumber })
      flash(res.ok ? 'Fulfilled — tracking pushed to the channel, stock updated.' : res.error)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function cancel(id: string) {
    const reason = window.prompt('Cancel this channel order? Optional reason:')
    if (reason === null) return
    setBusyId(id)
    try {
      const res = await cancelChannelOrder(id, reason || undefined)
      flash(res.ok ? 'Cancelled — reserved stock released.' : res.error)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function route(id: string) {
    setBusyId(id)
    try {
      const res = await routeChannelOrderToProduction(id)
      if (!res.ok) {
        flash(res.error)
      } else {
        flash('Routed to production — complete payment in the opened tab.')
        if (res.checkoutUrl) window.open(res.checkoutUrl, '_blank', 'noopener')
      }
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  const shown = initial.filter((o) => filter === 'ALL' || o.status === filter)
  const confirmQueue = initial.filter((o) => o.status === 'READY' && o.manualConfirmRequired).length

  return (
    <div className="space-y-4">
      {!migrated && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12.5px] text-warning-800">
          Channel-order tables aren’t migrated yet — run <code>pnpm db:push</code> and restart to activate the inbox.
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold capitalize transition ${
                filter === f ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'
              }`}
            >
              {f === 'ALL' ? 'All' : f.replace(/_/g, ' ').toLowerCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => void syncNow()}
          disabled={syncing || !migrated}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync now
        </button>
      </div>

      {confirmQueue > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-info-200 bg-info-50 px-3 py-2 text-[12.5px] text-info-800">
          <Clock className="h-3.5 w-3.5" /> {confirmQueue} order{confirmQueue === 1 ? '' : 's'} awaiting your approval (manual-confirm is on
          for your first 10 orders per channel).
        </div>
      )}

      {notice && <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-[12.5px] font-medium text-pink-900">{notice}</div>}

      <div className="space-y-2">
        {shown.map((o) => (
          <div key={o.id} className="rounded-2xl border border-ink-200 bg-white p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink-900">
                  {o.channel} · <span className="font-mono text-[12px]">{o.externalOrderId}</span>
                </p>
                <p className="truncate text-[11.5px] text-ink-500">
                  {new Date(o.placedAtIso).toLocaleString()} · {o.itemSummary || 'no lines'} · {o.total}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${STATUS_TONE[o.status] ?? STATUS_TONE.IMPORTED}`}>
                {o.status.replace(/_/g, ' ')}
              </span>
            </div>

            {o.statusReason && (
              <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-ink-600">
                {o.status === 'NEEDS_ATTENTION' ? (
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-danger-600" />
                ) : (
                  <PauseCircle className="mt-0.5 h-3 w-3 shrink-0 text-warning-600" />
                )}
                {o.statusReason}
              </p>
            )}

            {(o.status === 'READY' || o.status === 'ROUTED' || o.status === 'IN_FULFILLMENT') && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {o.status === 'READY' && o.manualConfirmRequired ? (
                  <button
                    onClick={() => void approve(o.id)}
                    disabled={busyId === o.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
                  >
                    {busyId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Approve for production
                  </button>
                ) : (
                  <>
                    {o.status === 'READY' && (
                      <button
                        onClick={() => void route(o.id)}
                        disabled={busyId === o.id}
                        title="On-demand: creates the production order and opens payment"
                        className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
                      >
                        {busyId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Factory className="h-3 w-3" />} Route &amp; pay
                      </button>
                    )}
                    <button
                      onClick={() => void fulfill(o.id)}
                      disabled={busyId === o.id}
                      title="From stock: enter tracking — pushes to the channel + updates inventory"
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 px-3 py-1.5 text-[11.5px] font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
                    >
                      Mark fulfilled (self-ship)
                    </button>
                  </>
                )}
                <button
                  onClick={() => void cancel(o.id)}
                  disabled={busyId === o.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[11.5px] font-semibold text-ink-500 hover:border-ink-400 hover:text-ink-800 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-[12.5px] text-ink-500">
            {filter === 'ALL' ? 'No channel orders yet — hit Sync now once a listing is live.' : 'Nothing with this status.'}
          </p>
        )}
      </div>
    </div>
  )
}
