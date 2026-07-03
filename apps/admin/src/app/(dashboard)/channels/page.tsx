// Admin /channels — channel-ops console (CHANNEL_MANAGEMENT_SPEC §3.4a).
//
// The ChannelEngine/Linnworks-style operator view: one row per channel with
// live health (connections, listings, orders 7d, sync errors 24h, last
// activity) and three levels of control —
//   enabled switch (visibility) → ingest/push pause (capability kill switches)
//   → per-connection force-disconnect (on the Connections page).
// All post-C0 model access is cast-guarded so the page renders before db:push.

import Link from 'next/link'
import { Plug, KeyRound, ShoppingBag, AlertTriangle, Power } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ChannelToggle } from './ChannelToggle'
import { ChannelOpsControls } from './ChannelOpsControls'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channels — Admin' }

const DAY = 24 * 60 * 60 * 1000

// --- cast-guarded delegates (degrade before db:push) --------------------------
type GroupRow = Record<string, unknown>
type AnyDelegate = {
  groupBy?: (a: unknown) => Promise<GroupRow[]>
  findMany?: (a: unknown) => Promise<GroupRow[]>
  count?: (a?: unknown) => Promise<number>
}
const d = (name: string): AnyDelegate | null =>
  ((prisma as unknown as Record<string, AnyDelegate | undefined>)[name] ?? null)

export default async function ChannelsPage() {
  const now = Date.now()
  const since7d = new Date(now - 7 * DAY)
  const since24h = new Date(now - DAY)

  const [channels, connGroups, liveLinkGroups, orderGroups, errorGroups, lastEventGroups] = await Promise.all([
    prisma.channel.findMany({
      orderBy: { displayName: 'asc' },
      include: { _count: { select: { connections: true, productLinks: true } } },
    }),
    // connections by channel × status
    prisma.channelConnection.groupBy({ by: ['channelId', 'status'], _count: { _all: true } }).catch(() => []),
    // LIVE listings by channel (publishState is a C0 column — cast-guarded)
    d('channelProductLink')
      ?.groupBy?.({ by: ['channelId'], where: { publishState: 'LIVE' }, _count: { _all: true } })
      .catch(() => [] as GroupRow[]) ?? Promise.resolve([] as GroupRow[]),
    // orders (7d) by connection
    d('channelOrder')
      ?.groupBy?.({ by: ['channelConnectionId'], where: { placedAt: { gte: since7d } }, _count: { _all: true } })
      .catch(() => [] as GroupRow[]) ?? Promise.resolve([] as GroupRow[]),
    // sync errors (24h) by connection
    d('channelSyncEvent')
      ?.groupBy?.({ by: ['channelConnectionId'], where: { outcome: 'ERROR', createdAt: { gte: since24h } }, _count: { _all: true } })
      .catch(() => [] as GroupRow[]) ?? Promise.resolve([] as GroupRow[]),
    // most recent sync event by connection
    d('channelSyncEvent')
      ?.groupBy?.({ by: ['channelConnectionId'], _max: { createdAt: true } })
      .catch(() => [] as GroupRow[]) ?? Promise.resolve([] as GroupRow[]),
  ])

  // connection id → channel id map so per-connection stats roll up per channel
  const connRows = await prisma.channelConnection.findMany({ select: { id: true, channelId: true } })
  const connToChannel = new Map(connRows.map((c) => [c.id, c.channelId]))

  const connectedBy = new Map<string, number>()
  const problemBy = new Map<string, number>()
  for (const g of connGroups as Array<{ channelId: string; status: string; _count: { _all: number } }>) {
    if (g.status === 'CONNECTED') connectedBy.set(g.channelId, (connectedBy.get(g.channelId) ?? 0) + g._count._all)
    if (g.status === 'TOKEN_EXPIRED' || g.status === 'ERROR') problemBy.set(g.channelId, (problemBy.get(g.channelId) ?? 0) + g._count._all)
  }

  const liveBy = new Map<string, number>()
  for (const g of liveLinkGroups) {
    liveBy.set(String(g.channelId), Number((g._count as { _all?: number } | undefined)?._all ?? 0))
  }

  const rollup = (groups: GroupRow[], pick: (g: GroupRow) => number) => {
    const by = new Map<string, number>()
    for (const g of groups) {
      const chId = connToChannel.get(String(g.channelConnectionId))
      if (!chId) continue
      by.set(chId, (by.get(chId) ?? 0) + pick(g))
    }
    return by
  }
  const orders7dBy = rollup(orderGroups, (g) => Number((g._count as { _all?: number } | undefined)?._all ?? 0))
  const errors24hBy = rollup(errorGroups, (g) => Number((g._count as { _all?: number } | undefined)?._all ?? 0))

  const lastEventBy = new Map<string, Date>()
  for (const g of lastEventGroups) {
    const chId = connToChannel.get(String(g.channelConnectionId))
    const at = (g._max as { createdAt?: Date | string | null } | undefined)?.createdAt
    if (!chId || !at) continue
    const date = new Date(at)
    const prev = lastEventBy.get(chId)
    if (!prev || date > prev) lastEventBy.set(chId, date)
  }

  const enabledCount = channels.filter((c) => c.enabled).length
  const oauthReadyCount = channels.filter((c) => c.oauthConfigured).length
  const totalConnected = [...connectedBy.values()].reduce((a, b) => a + b, 0)
  const totalOrders7d = [...orders7dBy.values()].reduce((a, b) => a + b, 0)
  const totalErrors24h = [...errors24hBy.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operate · Channels"
        title="Channel operations"
        description="Registry + health per channel. Enabled = visible to creators · Ingest/Push = platform-wide kill switches for vendor incidents (channel stays visible, traffic stops) · single-store problems → force-disconnect on Connections."
        actions={
          <div className="flex gap-2">
            <Link
              href="/developer"
              className="rounded-full border border-ink-300 px-3.5 py-1.5 text-[12px] font-semibold text-ink-800 hover:bg-ink-50"
            >
              API keys →
            </Link>
            <Link
              href="/channels/connections"
              className="rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700"
            >
              Connections &amp; sync →
            </Link>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Power} label="Enabled" value={`${enabledCount}/${channels.length}`} />
        <Kpi icon={KeyRound} label="OAuth ready" value={String(oauthReadyCount)} tone={oauthReadyCount === 0 ? 'warn' : 'ok'} />
        <Kpi icon={Plug} label="Connected stores" value={String(totalConnected)} />
        <Kpi icon={ShoppingBag} label="Orders (7d)" value={String(totalOrders7d)} />
        <Kpi icon={AlertTriangle} label="Sync errors (24h)" value={String(totalErrors24h)} tone={totalErrors24h > 0 ? 'warn' : undefined} />
      </div>

      {/* Channel table */}
      <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
              <th className="px-3 py-2.5">Channel</th>
              <th className="px-3 py-2.5">OAuth</th>
              <th className="px-3 py-2.5">Stores</th>
              <th className="px-3 py-2.5">Live listings</th>
              <th className="px-3 py-2.5">Orders 7d</th>
              <th className="px-3 py-2.5">Errors 24h</th>
              <th className="px-3 py-2.5">Last activity</th>
              <th className="px-3 py-2.5">Ops</th>
              <th className="px-3 py-2.5 text-right">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => {
              const ops = c as unknown as { ingestPaused?: boolean; pushPaused?: boolean; maintenanceNote?: string | null }
              const connected = connectedBy.get(c.id) ?? 0
              const problems = problemBy.get(c.id) ?? 0
              const errors = errors24hBy.get(c.id) ?? 0
              const last = lastEventBy.get(c.id)
              return (
                <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/50">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-ink-900">{c.displayName}</div>
                    <div className="font-mono text-[10.5px] text-ink-400">{c.code}</div>
                    {ops.maintenanceNote && (
                      <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-info-700" title={ops.maintenanceNote}>
                        📣 {ops.maintenanceNote}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase',
                        c.oauthConfigured ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-500',
                      )}
                    >
                      {c.oauthConfigured ? 'ready' : 'no keys'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-ink-700">
                    {connected}
                    {problems > 0 && <span className="ml-1 font-semibold text-danger-600">+{problems}⚠</span>}
                    <span className="text-ink-400"> / {c._count.connections}</span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-ink-700">
                    {liveBy.get(c.id) ?? 0}
                    <span className="text-ink-400"> / {c._count.productLinks}</span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-ink-700">{orders7dBy.get(c.id) ?? 0}</td>
                  <td className={cn('px-3 py-2.5 font-semibold tabular-nums', errors > 0 ? 'text-danger-600' : 'text-ink-400')}>
                    {errors}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-500">
                    {last ? last.toISOString().slice(0, 16).replace('T', ' ') : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <ChannelOpsControls
                      channelId={c.id}
                      initialIngestPaused={ops.ingestPaused ?? false}
                      initialPushPaused={ops.pushPaused ?? false}
                      initialNote={ops.maintenanceNote ?? null}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ChannelToggle channelId={c.id} initialEnabled={c.enabled} />
                  </td>
                </tr>
              )
            })}
            {channels.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-ink-400">
                  No channels registered — run pnpm db:seed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] text-ink-400">
        OAuth readiness is derived from env keys — manage them under{' '}
        <Link href="/developer" className="underline hover:text-ink-600">
          Developer &amp; API
        </Link>
        . Pausing writes an audit row; set a maintenance note so creators see why their syncs stopped.
      </p>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Plug
  label: string
  value: string
  tone?: 'ok' | 'warn'
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-3.5 py-3">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
        <Icon className={cn('h-3.5 w-3.5', tone === 'ok' ? 'text-success-600' : tone === 'warn' ? 'text-warning-600' : 'text-ink-400')} />
        {label}
      </span>
      <span className="mt-1 block text-xl font-bold tabular-nums text-ink-900">{value}</span>
    </div>
  )
}
