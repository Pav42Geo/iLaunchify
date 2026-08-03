// Admin → Channels → Channel orders (CHANNEL_MANAGEMENT_SPEC §3.4 oversight).
// Every imported consumer order across all creators, with FSM status + reason.
// Read-only oversight per the admin-v2 pattern: fixing an order happens where
// the workflow lives (creator inbox / partner dispatch), never inline here.

import Link from 'next/link'
import { ShoppingBag, AlertTriangle, PauseCircle, CheckCircle2, Truck } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channel orders · Admin' }

const STATUSES = [
  'NEEDS_ATTENTION',
  'ON_HOLD',
  'IMPORTED',
  'MAPPED',
  'READY',
  'ROUTED',
  'IN_FULFILLMENT',
  'FULFILLED',
  'CLOSED',
  'CANCELLED',
] as const
type Status = (typeof STATUSES)[number]
const PAGE_SIZE = 50

export default async function AdminChannelOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const sp = await searchParams
  const status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : undefined
  const page = Math.max(1, Number(sp.page) || 1)

  const [rows, total, groups] = await Promise.all([
    prisma.channelOrder.findMany({
      where: status ? { status } : undefined,
      include: {
        connection: {
          select: {
            channel: { select: { code: true, displayName: true } },
            creator: { select: { email: true, name: true } },
          },
        },
        lines: { select: { quantity: true } },
      },
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.channelOrder.count({ where: status ? { status } : undefined }),
    prisma.channelOrder.groupBy({ by: ['status'], _count: { _all: true } }),
  ])

  const countBy = new Map(groups.map((g) => [g.status, g._count._all]))
  const all = [...countBy.values()].reduce((a, b) => a + b, 0)
  const inFlight = (countBy.get('ROUTED') ?? 0) + (countBy.get('IN_FULFILLMENT') ?? 0)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operate · Channels"
        title="Channel orders"
        description="Every consumer order imported from creators' connected stores, platform-wide. Oversight only: creators resolve their own inbox; production orders live under Orders."
        actions={
          <Link href="/channels" className="rounded-full border border-ink-300 px-3.5 py-1.5 text-[12px] font-semibold text-ink-800 hover:bg-ink-50">
            ← Channel operations
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={ShoppingBag} label="All orders" value={all} href="/channels/orders" active={!status} />
        <Kpi icon={AlertTriangle} label="Needs attention" value={countBy.get('NEEDS_ATTENTION') ?? 0} href="/channels/orders?status=NEEDS_ATTENTION" active={status === 'NEEDS_ATTENTION'} tone="warn" />
        <Kpi icon={PauseCircle} label="On hold" value={countBy.get('ON_HOLD') ?? 0} href="/channels/orders?status=ON_HOLD" active={status === 'ON_HOLD'} tone="warn" />
        <Kpi icon={CheckCircle2} label="Ready" value={countBy.get('READY') ?? 0} href="/channels/orders?status=READY" active={status === 'READY'} tone="ok" />
        <Kpi icon={Truck} label="In fulfillment" value={inFlight} href="/channels/orders?status=IN_FULFILLMENT" active={status === 'IN_FULFILLMENT' || status === 'ROUTED'} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip href="/channels/orders" active={!status}>
          All
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} href={`/channels/orders?status=${s}`} active={status === s}>
            {s.replace(/_/g, ' ').toLowerCase()}
            {countBy.get(s) ? ` · ${countBy.get(s)}` : ''}
          </Chip>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
              <th className="px-3 py-2.5">Placed</th>
              <th className="px-3 py-2.5">Channel</th>
              <th className="px-3 py-2.5">Creator</th>
              <th className="px-3 py-2.5">External order</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Units</th>
              <th className="px-3 py-2.5">Total</th>
              <th className="px-3 py-2.5">Production order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const units = o.lines.reduce((a, l) => a + l.quantity, 0)
              return (
                <tr key={o.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/50">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">{o.placedAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-3 py-2 font-semibold text-ink-900">{o.connection.channel.displayName}</td>
                  <td className="px-3 py-2 text-ink-700">{o.connection.creator.name ?? o.connection.creator.email ?? '-'}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-ink-600">{o.externalOrderId}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={o.status} />
                    {o.manualConfirmRequired && (
                      <span className="ml-1 rounded-full bg-info-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-info-700" title="Manual-confirm training wheels - awaiting creator approval">
                        confirm
                      </span>
                    )}
                    {o.statusReason && (
                      <div className="mt-0.5 max-w-[240px] truncate text-[11px] text-ink-400" title={o.statusReason}>
                        {o.statusReason}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-700">{units}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-700">
                    {o.currency} {String(o.totalPrice)}
                  </td>
                  <td className="px-3 py-2">
                    {o.productionOrderId ? (
                      <Link href={`/orders/${o.productionOrderId}`} className="font-mono text-[11px] text-pink-700 hover:underline">
                        {o.productionOrderId.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="text-ink-300">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-ink-400">
                  No channel orders{status ? ` with status ${status.replace(/_/g, ' ').toLowerCase()}` : ' yet - they appear once creators sync their stores (needs db:push)'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[12px] text-ink-500">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/channels/orders?${status ? `status=${status}&` : ''}page=${page - 1}`} className="rounded-full border border-ink-200 px-3 py-1 font-semibold hover:bg-ink-50">
                ← Prev
              </Link>
            )}
            {page * PAGE_SIZE < total && (
              <Link href={`/channels/orders?${status ? `status=${status}&` : ''}page=${page + 1}`} className="rounded-full border border-ink-200 px-3 py-1 font-semibold hover:bg-ink-50">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
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
  icon: typeof ShoppingBag
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
        active ? 'border-success-500 bg-success-50 text-success-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400',
      )}
    >
      {children}
    </Link>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'NEEDS_ATTENTION' || status === 'CANCELLED'
      ? 'bg-danger-50 text-danger-700'
      : status === 'ON_HOLD'
        ? 'bg-warning-50 text-warning-700'
        : status === 'READY' || status === 'FULFILLED' || status === 'CLOSED'
          ? 'bg-success-50 text-success-700'
          : status === 'ROUTED' || status === 'IN_FULFILLMENT'
            ? 'bg-info-50 text-info-700'
            : 'bg-ink-100 text-ink-600'
  return <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase', cls)}>{status.replace(/_/g, ' ')}</span>
}
