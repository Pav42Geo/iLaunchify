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

export function ChannelsHubClient({ initial }: { initial: ChannelsHubData }) {
  const [data, setData] = React.useState(initial)
  const [busyCode, setBusyCode] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3200)
  }

  async function refresh() {
    const fresh = await loadChannelsHub().catch(() => null)
    if (fresh) setData(fresh)
  }

  async function onConnect(card: ChannelCardData) {
    setBusyCode(card.code)
    try {
      const res = await connectChannel(card.code)
      if (!res.ok) {
        flash(res.error)
        return
      }
      flash(`${card.displayName} connected${res.externalAccountId ? ` (${res.externalAccountId})` : ''}.`)
      await refresh()
    } finally {
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
