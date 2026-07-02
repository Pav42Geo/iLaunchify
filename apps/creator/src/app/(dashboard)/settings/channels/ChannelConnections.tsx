'use client'

// Phase L3a — channel connection cards + Manual setup (V1) + per-product FNSKU
// table (docs/LOGISTICS_AND_FULFILLMENT.md §7.2). All data comes prepared from
// the server component (env presence is checked server-side and arrives here as
// a boolean — the client never sees env names or values).

import { useState, useTransition } from 'react'
import { Loader2, Plug, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import {
  connectChannelOauth,
  createManualChannelConnection,
  disconnectChannelConnection,
  saveChannelProductFnsku,
} from './actions'

// Mirrors the server heuristic in actions.ts — warn, never block (legacy
// accounts + ASIN-shaped B0 FNSKUs + GS1-UPC labelers all fall outside it).
const FNSKU_RE = /^(X0|B0)[A-Z0-9]{8}$/

export interface ChannelCardData {
  id: string
  code: string
  displayName: string
  /** Connect button clickable (still returns a friendly not-yet error in V1). */
  connectEnabled: boolean
  /** Copy under a disabled Connect button (e.g. Amazon app-approval note). */
  connectDisabledCopy: string | null
  /** amazon / walmart / tiktok — channels with a factory→FC inbound program. */
  supportsInbound: boolean
  connection: {
    id: string
    status: string
    externalAccountId: string | null
  } | null
}

export interface FnskuProductRow {
  id: string
  name: string
  gtin: string
}

export interface ProductLinkData {
  channelConnectionId: string
  productId: string
  fnsku: string | null
  asin: string | null
}

export function ChannelConnections({
  channels,
  products,
  links,
}: {
  channels: ChannelCardData[]
  products: FnskuProductRow[]
  links: ProductLinkData[]
}) {
  return (
    <div className="space-y-4">
      {channels.map((c) => (
        <ChannelCard key={c.id} channel={c} products={products} links={links} />
      ))}
    </div>
  )
}

// =============================================================================
// One channel card
// =============================================================================

function ChannelCard({
  channel,
  products,
  links,
}: {
  channel: ChannelCardData
  products: FnskuProductRow[]
  links: ProductLinkData[]
}) {
  const [isPending, startTransition] = useTransition()
  const connection = channel.connection
  const connected = connection?.status === 'CONNECTED'

  function handleConnect() {
    startTransition(async () => {
      const result = await connectChannelOauth(channel.id)
      // V1: this always returns a friendly not-yet error (real OAuth = later phase).
      if (!result.ok) toast.info(result.error)
    })
  }

  function handleDisconnect() {
    if (!connection) return
    startTransition(async () => {
      const result = await disconnectChannelConnection(connection.id)
      if (!result.ok) toast.error(result.error)
      else toast.success(`${channel.displayName} disconnected.`)
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <h2 className="text-ui-value text-ink-900">{channel.displayName}</h2>
          <StatusPill status={connection?.status ?? 'NOT_CONNECTED'} />
          {channel.supportsInbound && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-ink-600">
              Inbound-capable
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
            >
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </button>
          )}
          <button
            type="button"
            onClick={channel.connectEnabled ? handleConnect : undefined}
            disabled={!channel.connectEnabled || isPending}
            aria-disabled={!channel.connectEnabled}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
            Connect
          </button>
        </div>
      </header>

      <div className="space-y-4 px-5 py-4">
        {!channel.connectEnabled && channel.connectDisabledCopy && (
          <p className="text-[12px] leading-snug text-ink-500">{channel.connectDisabledCopy}</p>
        )}

        <ManualSetupBlock channel={channel} />

        {/* FNSKU capture is Amazon-specific (WFS is GTIN-only; FBT uses its own
            SKU ids that land with the L4 adapters). */}
        {connected && connection && channel.code === 'amazon' && (
          <FnskuTable connectionId={connection.id} products={products} links={links} />
        )}
      </div>
    </section>
  )
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    CONNECTED: 'bg-success-100 text-success-700',
    TOKEN_EXPIRED: 'bg-warning-100 text-warning-800',
    ERROR: 'bg-danger-100 text-danger-700',
    DISCONNECTED: 'bg-ink-100 text-ink-600',
    NOT_CONNECTED: 'bg-ink-100 text-ink-600',
  }
  const labels: Record<string, string> = {
    CONNECTED: 'Connected',
    TOKEN_EXPIRED: 'Reconnect needed',
    ERROR: 'Error',
    DISCONNECTED: 'Disconnected',
    NOT_CONNECTED: 'Not connected',
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[status] ?? 'bg-ink-100 text-ink-600'}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

// =============================================================================
// Manual setup (V1) — paste the seller id so CHANNEL_INBOUND can light up
// before OAuth exists
// =============================================================================

function ManualSetupBlock({ channel }: { channel: ChannelCardData }) {
  const [sellerId, setSellerId] = useState(channel.connection?.externalAccountId ?? '')
  const [isPending, startTransition] = useTransition()
  const connected = channel.connection?.status === 'CONNECTED'

  function submit() {
    startTransition(async () => {
      const result = await createManualChannelConnection({
        channelId: channel.id,
        externalAccountId: sellerId,
      })
      if (!result.ok) toast.error(result.error)
      else toast.success(`${channel.displayName} linked — inbound shipping can now use this account.`)
    })
  }

  const explainer =
    channel.code === 'amazon'
      ? 'Paste your Merchant Token — find it in Seller Central → Settings → Account Info → Merchant Token.'
      : `Paste your ${channel.displayName} seller account id.`

  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50/40 p-4">
      <div className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
        Manual setup (V1)
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-500">
        {connected
          ? 'This account is linked manually. Update the seller id below if it changes.'
          : `Link your account without OAuth: ${explainer} We use it to prepare inbound shipments into this channel.`}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={sellerId}
          onChange={(e) => setSellerId(e.target.value)}
          placeholder={channel.code === 'amazon' ? 'e.g. A1B2C3D4E5F6G7' : 'Seller account id'}
          className="block w-64 rounded-xl border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          aria-label={`${channel.displayName} seller account id`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !sellerId.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {connected ? 'Update seller id' : 'Link account'}
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// FNSKU table — creator's GTIN products × this connection
// =============================================================================

function FnskuTable({
  connectionId,
  products,
  links,
}: {
  connectionId: string
  products: FnskuProductRow[]
  links: ProductLinkData[]
}) {
  if (products.length === 0) {
    return (
      <p className="text-[12px] text-ink-500">
        Add a GTIN (UPC) to a product to map its Amazon FNSKU here — inbound
        shipments need both.
      </p>
    )
  }
  return (
    <div>
      <div className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
        Product FNSKUs
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-500">
        The FNSKU is Amazon&apos;s per-seller fulfillment barcode (Seller Central →
        Manage Inventory). We composite it into your label artwork so units arrive
        FBA-ready. ASIN is optional.
      </p>
      <table className="mt-2 w-full text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-ink-100 text-[10.5px] font-bold uppercase tracking-widest text-ink-500">
            <th className="py-2 pr-3">Product</th>
            <th className="py-2 pr-3">GTIN</th>
            <th className="py-2 pr-3">FNSKU</th>
            <th className="py-2 pr-3">ASIN (optional)</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const link = links.find(
              (l) => l.channelConnectionId === connectionId && l.productId === p.id,
            )
            return (
              <FnskuRow
                key={p.id}
                connectionId={connectionId}
                product={p}
                initialFnsku={link?.fnsku ?? ''}
                initialAsin={link?.asin ?? ''}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FnskuRow({
  connectionId,
  product,
  initialFnsku,
  initialAsin,
}: {
  connectionId: string
  product: FnskuProductRow
  initialFnsku: string
  initialAsin: string
}) {
  const [fnsku, setFnsku] = useState(initialFnsku)
  const [asin, setAsin] = useState(initialAsin)
  const [isPending, startTransition] = useTransition()

  const trimmed = fnsku.trim().toUpperCase()
  const formatHint =
    trimmed && !FNSKU_RE.test(trimmed)
      ? 'Unusual FNSKU shape (expected 10 chars starting X0/B0) — will save anyway.'
      : null
  const dirty = trimmed !== initialFnsku.toUpperCase() || asin.trim().toUpperCase() !== initialAsin.toUpperCase()

  function save() {
    startTransition(async () => {
      const result = await saveChannelProductFnsku({
        channelConnectionId: connectionId,
        productId: product.id,
        fnsku,
        asin,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.data.warning) toast.warning(result.data.warning)
      else toast.success(`FNSKU saved for ${product.name}.`)
    })
  }

  return (
    <tr className="border-b border-ink-50 align-top">
      <td className="py-2 pr-3 font-medium text-ink-900">{product.name}</td>
      <td className="py-2 pr-3 font-mono text-[11.5px] text-ink-600">{product.gtin}</td>
      <td className="py-2 pr-3">
        <input
          value={fnsku}
          onChange={(e) => setFnsku(e.target.value.toUpperCase())}
          placeholder="X000ABC123"
          maxLength={20}
          className="block w-32 rounded-lg border border-ink-200 px-2 py-1.5 font-mono text-[12px] uppercase focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          aria-label={`FNSKU for ${product.name}`}
        />
        {formatHint && (
          <div className="mt-1 max-w-[180px] text-[10.5px] leading-snug text-warning-800">
            {formatHint}
          </div>
        )}
      </td>
      <td className="py-2 pr-3">
        <input
          value={asin}
          onChange={(e) => setAsin(e.target.value.toUpperCase())}
          placeholder="B0…"
          maxLength={20}
          className="block w-28 rounded-lg border border-ink-200 px-2 py-1.5 font-mono text-[12px] uppercase focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          aria-label={`ASIN for ${product.name}`}
        />
      </td>
      <td className="py-2 text-right">
        <button
          type="button"
          onClick={save}
          disabled={isPending || !trimmed || !dirty}
          className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-3 py-1.5 text-[11.5px] font-semibold text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-40"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
      </td>
    </tr>
  )
}
