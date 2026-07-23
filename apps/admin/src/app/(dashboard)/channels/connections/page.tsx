// Admin → Channels → Connections & sync (CHANNEL_MANAGEMENT_SPEC §3.4, C0).
// Admin-v2 surface: hero header + KPI strip + URL status chips + plain table +
// recent ChannelSyncEvent log.

import Link from 'next/link'
import { Plug, CheckCircle2, AlertTriangle, Activity, ShoppingBag } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ConnectionForceDisconnect } from './ConnectionForceDisconnect'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channel connections · Admin' }

const STATUSES = ['CONNECTED', 'TOKEN_EXPIRED', 'ERROR', 'DISCONNECTED', 'NOT_CONNECTED'] as const
type Status = (typeof STATUSES)[number]
const PAGE_SIZE = 50

export default async function ChannelConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const sp = await searchParams
  const status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : undefined
  const page = Math.max(1, Number(sp.page) || 1)

  const [connections, total, connectedCount, problemCount, syncEvents, ordersImported] = await Promise.all([
    prisma.channelConnection.findMany({
      where: status ? { status } : undefined,
      include: { channel: { select: { code: true, displayName: true } }, creator: { select: { email: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.channelConnection.count({ where: status ? { status } : undefined }),
    prisma.channelConnection.count({ where: { status: 'CONNECTED' } }),
    prisma.channelConnection.count({ where: { status: { in: ['TOKEN_EXPIRED', 'ERROR'] } } }),
    prisma.channelSyncEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.channelOrder.count(),
  ])

  const errorEvents = syncEvents.filter((e) => e.outcome === 'ERROR').length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operate · Channels"
        title="Connections & sync"
        description="Every creator↔channel connection with health, plus the most recent adapter interactions. Channel-wide pauses live on the registry; here you can force-disconnect a single misbehaving store (audited, creator can reconnect)."
        actions={
          <Link href="/channels" className="rounded-full border border-ink-300 px-3.5 py-1.5 text-[12px] font-semibold text-ink-800 hover:bg-ink-50">
            Channel registry →
          </Link>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Plug} label="Connections" value={total} href="/channels/connections" active={!status} />
        <Kpi icon={CheckCircle2} label="Connected" value={connectedCount} href="/channels/connections?status=CONNECTED" active={status === 'CONNECTED'} tone="ok" />
        <Kpi icon={AlertTriangle} label="Needs attention" value={problemCount} href="/channels/connections?status=ERROR" active={status === 'ERROR' || status === 'TOKEN_EXPIRED'} tone="warn" />
        <Kpi icon={ShoppingBag} label="Channel orders" value={ordersImported} href="/channels/connections" />
        <Kpi icon={Activity} label="Sync errors (recent)" value={errorEvents} href="/channels/connections" tone={errorEvents > 0 ? 'warn' : undefined} />
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5">
        <Chip href="/channels/connections" active={!status}>
          All
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} href={`/channels/connections?status=${s}`} active={status === s}>
            {s.replace(/_/g, ' ').toLowerCase()}
          </Chip>
        ))}
      </div>

      {/* Connections table */}
      <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
              <th className="px-3 py-2.5">Channel</th>
              <th className="px-3 py-2.5">Creator</th>
              <th className="px-3 py-2.5">External account</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Connected</th>
              <th className="px-3 py-2.5">Last sync</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/50">
                <td className="px-3 py-2 font-semibold text-ink-900">{c.channel.displayName}</td>
                <td className="px-3 py-2 text-ink-700">{c.creator.name ?? c.creator.email ?? '-'}</td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-ink-600">{c.externalAccountId ?? '-'}</td>
                <td className="px-3 py-2">
                  <StatusPill status={c.status} />
                </td>
                <td className="px-3 py-2 text-ink-500">{c.connectedAt ? c.connectedAt.toISOString().slice(0, 10) : '-'}</td>
                <td className="px-3 py-2 text-ink-500">{c.lastSyncAt ? c.lastSyncAt.toISOString().slice(0, 16).replace('T', ' ') : '-'}</td>
                <td className="px-3 py-2 text-right">
                  {c.status !== 'DISCONNECTED' && c.status !== 'NOT_CONNECTED' ? (
                    <ConnectionForceDisconnect
                      connectionId={c.id}
                      label={`${c.channel.displayName} · ${c.creator.name ?? c.creator.email ?? c.id}`}
                    />
                  ) : (
                    <span className="text-ink-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {connections.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-400">
                  No connections{status ? ` with status ${status}` : ' yet'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginator */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[12px] text-ink-500">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/channels/connections?${status ? `status=${status}&` : ''}page=${page - 1}`} className="rounded-full border border-ink-200 px-3 py-1 font-semibold hover:bg-ink-50">
                ← Prev
              </Link>
            )}
            {page * PAGE_SIZE < total && (
              <Link href={`/channels/connections?${status ? `status=${status}&` : ''}page=${page + 1}`} className="rounded-full border border-ink-200 px-3 py-1 font-semibold hover:bg-ink-50">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Recent sync events */}
      <div className="space-y-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-700">Recent sync events</h2>
        <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-200 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Direction</th>
                <th className="px-3 py-2.5">Topic</th>
                <th className="px-3 py-2.5">Outcome</th>
                <th className="px-3 py-2.5">Detail</th>
              </tr>
            </thead>
            <tbody>
              {syncEvents.map((e) => (
                <tr key={e.id} className="border-b border-ink-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">{e.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-3 py-2 text-ink-600">{e.direction}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-ink-700">{e.topic}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase',
                        e.outcome === 'OK' ? 'bg-success-50 text-success-700' : e.outcome === 'RETRY' ? 'bg-warning-50 text-warning-700' : 'bg-danger-50 text-danger-700',
                      )}
                    >
                      {e.outcome}
                    </span>
                  </td>
                  <td className="max-w-[360px] truncate px-3 py-2 text-ink-500">{e.detail ?? '-'}</td>
                </tr>
              ))}
              {syncEvents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-ink-400">
                    No sync events yet - they appear once listings push or orders import (needs db:push).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  href,
  active,
  tone,
}: {
  icon: typeof Plug
  label: string
  value: number
  href: string
  active?: boolean
  tone?: 'ok' | 'warn'
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-2xl border bg-[var(--bg-hero)] px-3.5 py-3 transition',
        active ? 'border-pink-400 ring-1 ring-pink-200' : 'border-ink-200 hover:border-ink-300',
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
        <Icon className={cn('h-3.5 w-3.5', tone === 'ok' ? 'text-success-600' : tone === 'warn' ? 'text-warning-600' : 'text-ink-400')} />
        {label}
      </span>
      <span className="mt-1 block text-xl font-bold tabular-nums text-ink-900">{value}</span>
    </Link>
  )
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11.5px] font-semibold capitalize transition',
        active ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400',
      )}
    >
      {children}
    </Link>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'CONNECTED'
      ? 'bg-success-50 text-success-700'
      : status === 'TOKEN_EXPIRED' || status === 'ERROR'
        ? 'bg-danger-50 text-danger-700'
        : 'bg-ink-100 text-ink-600'
  return <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase', cls)}>{status.replace(/_/g, ' ')}</span>
}
