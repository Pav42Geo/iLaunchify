'use client'

// Channels hub client (CHANNEL_MANAGEMENT_SPEC §3.4) — card per enabled channel
// with connect / disconnect + connection health. Tier cap surfaced as "n of cap".

import * as React from 'react'
import { Plug, Unplug, CheckCircle2, AlertTriangle, Loader2, Store } from 'lucide-react'
import { connectChannel, disconnectChannel, loadChannelsHub, type ChannelsHubData, type ChannelCardData } from './actions'

const STATUS_LABEL: Record<string, { label: string; tone: 'ok' | 'warn' | 'idle' }> = {
  CONNECTED: { label: 'Connected', tone: 'ok' },
  TOKEN_EXPIRED: { label: 'Reconnect needed', tone: 'warn' },
  ERROR: { label: 'Sync error', tone: 'warn' },
  DISCONNECTED: { label: 'Disconnected', tone: 'idle' },
  NOT_CONNECTED: { label: 'Not connected', tone: 'idle' },
}

/** Friendly copy for the callback's allowlisted ?connect_error= codes
 *  (/api/channels/oauth/[channel]/callback, Track B2). */
const CONNECT_ERROR_COPY: Record<string, string> = {
  signin: 'Sign in first, then connect your channel.',
  session: 'That connection was started from a different account. Sign in with the same account and try again.',
  state: 'That connect link expired or was already used. Click Connect to try again.',
  channel: 'That channel is not available right now.',
  config: 'This channel’s integration is not configured yet.',
  cap: 'Your plan’s channel limit is reached. Upgrade to connect more.',
  denied: 'Authorization was declined on the marketplace side. Nothing was connected.',
  exchange: 'The marketplace rejected the authorization. Please try again.',
  setup: 'Channel connect needs a pending platform update. Please try again shortly.',
}

export function ChannelsHubClient({ initial }: { initial: ChannelsHubData }) {
  const [data, setData] = React.useState(initial)
  const [busyCode, setBusyCode] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  function flash(msg: string, holdMs = 3200) {
    setNotice(msg)
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), holdMs)
  }

  async function refresh() {
    const fresh = await loadChannelsHub().catch(() => null)
    if (fresh) setData(fresh)
  }

  // OAuth callback banners: the callback route lands on
  // /channels?connected=<code> or ?connect_error=<code>. Read once, flash,
  // and clean the URL so refresh/back doesn't replay the banner.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const err = params.get('connect_error')
    if (!connected && !err) return
    if (connected) {
      const name = initial.channels.find((c) => c.code === connected)?.displayName ?? connected
      flash(`${name} connected.`)
    } else if (err) {
      flash(CONNECT_ERROR_COPY[err] ?? 'The connection could not be completed. Please try again.', 6000)
    }
    params.delete('connected')
    params.delete('connect_error')
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onConnect(card: ChannelCardData) {
    // Shopify OAuth starts on the store's own domain: ask for it first.
    let shopHint: string | undefined
    if (card.code === 'shopify') {
      const input = window.prompt('Your Shopify store domain (e.g. my-store or my-store.myshopify.com):')
      if (input === null) return
      shopHint = input.trim()
      if (!shopHint) {
        flash('A store domain is needed to connect Shopify.', 6000)
        return
      }
    }
    setBusyCode(card.code)
    try {
      const res = await connectChannel(card.code, shopHint)
      if (!res.ok) {
        flash(res.error, 6000)
        setBusyCode(null)
        return
      }
      // Hand the browser to the marketplace consent screen (full-page redirect,
      // never a popup: blockers eat popups - SHOP_CONNECT_E2E §2). The stub
      // adapter bounces straight back through the callback, so dev sees the
      // same round trip. Keep the spinner on while navigation happens.
      window.location.assign(res.authUrl)
    } catch {
      flash('Could not start the connection. Please try again.', 6000)
      setBusyCode(null)
    }
  }

  async function onDisconnect(card: ChannelCardData) {
    if (!card.connection) return
    const ok = window.confirm(`Disconnect ${card.displayName}? Listings stay on the channel; syncing stops.`)
    if (!ok) return
    setBusyCode(card.code)
    try {
      const res = await disconnectChannel(card.connection.id)
      if (!res.ok) {
        flash(res.error ?? 'Could not disconnect.')
        return
      }
      flash(`${card.displayName} disconnected.`)
      await refresh()
    } finally {
      setBusyCode(null)
    }
  }

  const capLabel = data.connectionCap < 0 ? 'all channels' : `${data.connectionCap} channel${data.connectionCap === 1 ? '' : 's'}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3">
        <p className="text-[12.5px] text-ink-600">
          <span className="font-semibold text-ink-900">{data.connectedCount}</span> connected · your plan includes{' '}
          <span className="font-semibold text-ink-900">{capLabel}</span>
        </p>
        {data.connectionCap >= 0 && data.connectedCount >= data.connectionCap && (
          <a href="/subscriptions" className="text-[12px] font-semibold text-pink-700 hover:underline">
            Upgrade for more →
          </a>
        )}
      </div>

      {notice && (
        <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-[12.5px] font-medium text-pink-900">{notice}</div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.channels.map((card) => {
          const st = STATUS_LABEL[card.connection?.status ?? 'NOT_CONNECTED'] ?? STATUS_LABEL.NOT_CONNECTED!
          const isConnected = card.connection?.status === 'CONNECTED'
          const busy = busyCode === card.code
          return (
            <div key={card.code} className="flex flex-col rounded-2xl border border-ink-200 bg-white p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-50">
                  <Store className="h-4.5 w-4.5 text-ink-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink-900">{card.displayName}</p>
                  <p
                    className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                      st.tone === 'ok' ? 'text-success-700' : st.tone === 'warn' ? 'text-warning-700' : 'text-ink-500'
                    }`}
                  >
                    {st.tone === 'ok' ? <CheckCircle2 className="h-3 w-3" /> : st.tone === 'warn' ? <AlertTriangle className="h-3 w-3" /> : null}
                    {st.label}
                  </p>
                </div>
              </div>

              {card.paused && (
                <p className="mt-2 rounded-lg border border-warning-200 bg-warning-50 px-2.5 py-1.5 text-[11px] font-medium text-warning-800">
                  Syncing temporarily paused by iLaunchify{card.maintenanceNote ? ` — ${card.maintenanceNote}` : '.'}
                </p>
              )}
              {card.connection?.externalAccountId && isConnected && (
                <p className="mt-2 truncate text-[11.5px] text-ink-500">{card.connection.externalAccountId}</p>
              )}
              {!card.oauthConfigured && !isConnected && (
                <p className="mt-2 text-[11px] text-ink-400">Integration arriving — connect uses the dev sandbox for now.</p>
              )}

              <div className="mt-3 flex gap-2">
                {isConnected ? (
                  <button
                    type="button"
                    onClick={() => onDisconnect(card)}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:border-ink-400 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />} Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnect(card)}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Connect
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {data.channels.length === 0 && (
        <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-[12.5px] text-ink-500">
          No channels are enabled yet — the admin can switch them on in the Channels registry.
        </p>
      )}
    </div>
  )
}
