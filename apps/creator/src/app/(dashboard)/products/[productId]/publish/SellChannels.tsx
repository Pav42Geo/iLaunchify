'use client'

// Sell-to-channel section (CHANNEL_MANAGEMENT_SPEC §3.4, Phase C0) — one card
// per CONNECTED channel: mode (on-demand / bulk), price with a live margin hint
// against the production unit cost, Save + Push. Mode rules surface inline:
// on-demand needs the manufacturer's enablement (C2); bulk goes live only after
// delivered stock is received (C2). Push runs the adapter seam (stub in dev).

import * as React from 'react'
import { UploadCloud, Loader2, ExternalLink, AlertTriangle, Factory, Boxes, CheckCircle2, Clock } from 'lucide-react'
import { configureListing, pushListing, loadSellData, requestOnDemandEnablement, receiveDelivery, type SellData, type SellChannelRow } from './actions'

const STATE_BADGE: Record<string, string> = {
  DRAFT: 'bg-ink-100 text-ink-600',
  PUSHED: 'bg-info-50 text-info-700',
  LIVE: 'bg-success-50 text-success-700',
  PAUSED: 'bg-warning-50 text-warning-700',
  ERROR: 'bg-danger-50 text-danger-700',
}

export function SellChannels({ productId, initial }: { productId: string; initial: SellData }) {
  const [data, setData] = React.useState(initial)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3200)
  }

  async function refresh() {
    const fresh = await loadSellData(productId).catch(() => null)
    if (fresh) setData(fresh)
  }

  if (data.channels.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-6 text-center text-[12.5px] text-ink-500">
        No connected channels yet.{' '}
        <a href="/channels" className="font-semibold text-pink-700 hover:underline">
          Connect one on the Channels page →
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-[12.5px] font-medium text-pink-900">{notice}</div>
      )}

      {/* On-demand enablement (LOCKED gate #1) — one agreement per product,
          shared by every channel selling it on-demand. */}
      <OnDemandGate
        state={data.onDemand}
        busy={busy === '__enablement__'}
        onRequest={async () => {
          setBusy('__enablement__')
          try {
            const res = await requestOnDemandEnablement(productId)
            flash(res.ok ? 'Request sent — your manufacturer will review the branding.' : res.error)
            if (res.ok) await refresh()
          } finally {
            setBusy(null)
          }
        }}
      />

      {/* Bulk stock (gate #2) — from-stock listings go live only when available > 0. */}
      <StockBar
        stock={data.stock}
        busy={busy === '__stock__'}
        onReceive={async (qty) => {
          setBusy('__stock__')
          try {
            const res = await receiveDelivery({ productId, quantity: qty })
            flash(res.ok ? `Recorded ${qty} unit${qty === 1 ? '' : 's'} received.` : res.error)
            if (res.ok) await refresh()
          } finally {
            setBusy(null)
          }
        }}
      />

      {data.channels.map((row) => (
        <SellChannelCard
          key={row.code}
          row={row}
          unitCostCents={data.unitCostCents}
          flavorCount={data.flavors.length}
          onDemandBlockers={data.onDemand.eligible ? null : data.onDemand.blockers}
          busy={busy === row.code}
          onSave={async (mode, price) => {
            setBusy(row.code)
            try {
              const res = await configureListing({ productId, channelCode: row.code, mode, price })
              flash(res.ok ? `${row.displayName} listing saved.` : res.error)
              if (res.ok) await refresh()
            } finally {
              setBusy(null)
            }
          }}
          onPush={async () => {
            setBusy(row.code)
            try {
              const res = await pushListing({ productId, channelCode: row.code })
              flash(res.ok ? `Pushed to ${row.displayName}.` : res.error)
              await refresh()
            } finally {
              setBusy(null)
            }
          }}
        />
      ))}
    </div>
  )
}

function SellChannelCard({
  row,
  unitCostCents,
  flavorCount,
  onDemandBlockers,
  busy,
  onSave,
  onPush,
}: {
  row: SellChannelRow
  unitCostCents: number
  flavorCount: number
  /** Full-service gate: non-null = on-demand is unavailable for this product,
   *  with creator-facing reasons (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md). */
  onDemandBlockers: string[] | null
  busy: boolean
  onSave: (mode: 'ON_DEMAND' | 'BULK', price: string) => Promise<void>
  onPush: () => Promise<void>
}) {
  // Blocked products default to From-stock: the on-demand tile is not a choice.
  const savedMode = (row.link?.mode as 'ON_DEMAND' | 'BULK') ?? 'ON_DEMAND'
  const [mode, setMode] = React.useState<'ON_DEMAND' | 'BULK'>(onDemandBlockers && savedMode === 'ON_DEMAND' ? 'BULK' : savedMode)
  const [price, setPrice] = React.useState(row.link?.price ?? '')

  const unitCost = unitCostCents / 100
  const priceNum = Number(price)
  const margin = Number.isFinite(priceNum) && priceNum > 0 ? priceNum - unitCost : null
  const state = row.link?.publishState ?? 'DRAFT'
  const configured = !!row.link?.price

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink-900">{row.displayName}</p>
          <p className="truncate text-[11px] text-ink-500">{row.externalAccountId ?? 'connected'}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${STATE_BADGE[state] ?? STATE_BADGE.DRAFT}`}>
          {state}
        </span>
      </div>

      {row.link?.lastError && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-danger-50 px-2.5 py-1.5 text-[11.5px] text-danger-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {row.link.lastError}
        </p>
      )}

      {/* Mode */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ModeButton
          active={mode === 'ON_DEMAND'}
          onClick={() => setMode('ON_DEMAND')}
          disabled={!!onDemandBlockers}
          icon={<Factory className="h-3.5 w-3.5" />}
          title="On-demand"
          hint={
            onDemandBlockers
              ? `Unavailable: ${onDemandBlockers.join(' ')}`
              : 'Each sale triggers a production order. Made and shipped entirely by your manufacturer.'
          }
        />
        <ModeButton
          active={mode === 'BULK'}
          onClick={() => setMode('BULK')}
          icon={<Boxes className="h-3.5 w-3.5" />}
          title="From stock"
          hint="Sells delivered inventory. Goes live once stock is received."
        />
      </div>

      {/* Price + margin hint */}
      <div className="mt-3 flex items-center gap-3">
        <div className="relative w-36">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12.5px] text-ink-400">$</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full rounded-lg border border-ink-200 py-1.5 pl-6 pr-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </div>
        <p className="text-[11.5px] text-ink-500">
          Unit cost <span className="font-semibold text-ink-700">${unitCost.toFixed(2)}</span>
          {margin !== null && (
            <>
              {' '}
              · margin{' '}
              <span className={`font-semibold ${margin < 0 ? 'text-danger-700' : 'text-success-700'}`}>
                ${margin.toFixed(2)}
              </span>
              {margin < 0 && ' — below cost'}
            </>
          )}
        </p>
      </div>

      {flavorCount > 1 && (
        <p className="mt-2 text-[11px] text-ink-400">
          Pushes {flavorCount} variants (one per flavor) at this price — per-variant pricing arrives with the full mapping editor.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onSave(mode, price)}
          disabled={busy}
          className="rounded-full border border-ink-300 px-3.5 py-1.5 text-[12px] font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => void onPush()}
          disabled={busy || !configured}
          title={configured ? 'Create/update the listing on the channel' : 'Save a price first'}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} Push listing
        </button>
        {row.link?.externalUrl && (
          <a
            href={row.link.externalUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-500 hover:text-ink-900"
          >
            View listing <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  )
}

function OnDemandGate({
  state,
  busy,
  onRequest,
}: {
  state: SellData['onDemand']
  busy: boolean
  onRequest: () => Promise<void>
}) {
  if (state.status === 'ENABLED') {
    return (
      <p className="flex items-center gap-1.5 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-[12px] text-success-800">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> On-demand enabled by your manufacturer — consumer orders route to
        production automatically.
      </p>
    )
  }
  if (state.status === 'REQUESTED' || state.status === 'PARTNER_REVIEW') {
    return (
      <p className="flex items-center gap-1.5 rounded-lg border border-info-200 bg-info-50 px-3 py-2 text-[12px] text-info-800">
        <Clock className="h-3.5 w-3.5 shrink-0" /> On-demand request pending — your manufacturer is reviewing the branding.
      </p>
    )
  }
  // Full-service gate (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md): on-demand
  // is only offered when the pinned manufacturer runs the WHOLE order in-house.
  // Blocked = explain what to fix; the request button stays off.
  if (!state.eligible) {
    return (
      <div className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2">
        <p className="flex items-start gap-1.5 text-[12px] text-warning-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">On-demand isn’t available for this product yet.</span> It requires your
            manufacturer to produce, print, pack and ship each order in-house.
          </span>
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-8 text-[11.5px] text-warning-800">
          {state.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
      <p className="text-[12px] text-ink-600">
        <span className="font-semibold text-ink-800">On-demand needs manufacturer sign-off</span>
        {state.status === 'DECLINED' && state.partnerNote ? ` — declined: “${state.partnerNote}”` : state.status === 'SUSPENDED' ? ' — currently paused by the manufacturer' : ' — one-time branding review'}
        {!state.hasManufacturer && ' (no pinned manufacturer yet)'}
      </p>
      <button
        type="button"
        onClick={() => void onRequest()}
        disabled={busy || !state.hasManufacturer}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Factory className="h-3 w-3" />}
        {state.status === 'DECLINED' || state.status === 'SUSPENDED' ? 'Request again' : 'Request enablement'}
      </button>
    </div>
  )
}

function StockBar({
  stock,
  busy,
  onReceive,
}: {
  stock: SellData['stock']
  busy: boolean
  onReceive: (qty: number) => Promise<void>
}) {
  const [qty, setQty] = React.useState('')
  const n = Math.floor(Number(qty))
  const valid = Number.isFinite(n) && n > 0
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
      <p className="text-[12px] text-ink-600">
        <Boxes className="mr-1 inline h-3.5 w-3.5 text-ink-400" />
        <span className="font-semibold text-ink-800">{stock.available}</span> available to sell
        {stock.reserved > 0 && <> · {stock.reserved} reserved</>}
        {stock.onHand === 0 && ' — from-stock listings go live once a delivery is recorded'}
      </p>
      <div className="flex items-center gap-1.5">
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="numeric"
          placeholder="Qty"
          className="w-20 rounded-lg border border-ink-200 px-2 py-1 text-[12px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        />
        <button
          type="button"
          onClick={async () => {
            if (!valid) return
            await onReceive(n)
            setQty('')
          }}
          disabled={busy || !valid}
          className="inline-flex items-center gap-1 rounded-full border border-ink-300 px-3 py-1 text-[11.5px] font-semibold text-ink-800 hover:bg-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Record delivery
        </button>
      </div>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  title,
  hint,
  disabled = false,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  hint: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-xl border p-2.5 text-left transition ${
        disabled
          ? 'cursor-not-allowed border-ink-200 bg-ink-50 opacity-60'
          : active
            ? 'border-pink-500 bg-pink-50'
            : 'border-ink-200 bg-white hover:border-ink-300'
      }`}
    >
      <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${active ? 'text-pink-700' : 'text-ink-800'}`}>
        {icon} {title}
      </span>
      <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-500">{hint}</span>
    </button>
  )
}
