// Admin → Channels → On-demand enablements (CHANNEL_MANAGEMENT_SPEC §3.4
// oversight). Every creator×product×manufacturer on-demand approval across the
// platform — the gate that decides whether a channel sale may auto-route into
// production. Read-only oversight: manufacturers decide in their partner queue;
// this page answers "where is enablement stuck platform-wide?".
// OnDemandEnablement uses soft FKs — names batch-resolved. Cast-guarded.

import Link from 'next/link'
import { Zap, Clock4, CheckCircle2, XCircle, PauseCircle } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'On-demand enablements — Admin' }

const STATUSES = ['REQUESTED', 'ENABLED', 'DECLINED', 'SUSPENDED'] as const
type Status = (typeof STATUSES)[number]
const PAGE_SIZE = 50

type EnablementRow = {
  id: string
  creatorUserId: string
  productId: string
  manufacturerServiceId: string
  status: string
  partnerNote: string | null
  capacityPerDay: number | null
  decidedAt: Date | null
  createdAt: Date
}
type Delegate = {
  findMany?: (a: unknown) => Promise<EnablementRow[]>
  count?: (a?: unknown) => Promise<number>
  groupBy?: (a: unknown) => Promise<Array<{ status: string; _count: { _all: number } }>>
}
const enablementDelegate = () => ((prisma as unknown as { onDemandEnablement?: Delegate }).onDemandEnablement ?? null)

export default async function AdminEnablementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const sp = await searchParams
  const status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : undefined
  const page = Math.max(1, Number(sp.page) || 1)
  const en = enablementDelegate()

  const [rows, total, groups] = await Promise.all([
    en
      ?.findMany?.({
        where: status ? { status } : undefined,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      })
      .catch(() => [] as EnablementRow[]) ?? Promise.resolve([] as EnablementRow[]),
    en?.count?.({ where: status ? { status } : undefined }).catch(() => 0) ?? Promise.resolve(0),
    en?.groupBy?.({ by: ['status'], _count: { _all: true } }).catch(() => []) ?? Promise.resolve([]),
  ])

  // Batch-resolve the soft FKs → display names.
  const [users, products, services] = await Promise.all([
    rows.length
      ? prisma.user.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.creatorUserId))] } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([]),
    rows.length
      ? prisma.product.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.productId))] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    rows.length
      ? prisma.partnerService.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.manufacturerServiceId))] } },
          select: { id: true, partner: { select: { companyName: true } } },
        })
      : Promise.resolve([]),
  ])
  const userBy = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]))
  const productBy = new Map(products.map((p) => [p.id, p.name]))
  const serviceBy = new Map(services.map((s) => [s.id, s.partner.companyName]))

  const countBy = new Map(groups.map((g) => [g.status, g._count._all]))
  const all = [...countBy.values()].reduce((a, b) => a + b, 0)

  // Aging: REQUESTED rows older than 3 days are where creators are stuck.
  const staleCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operate · Channels"
        title="On-demand enablements"
        description="Manufacturer approvals for on-demand channel selling, platform-wide. Manufacturers decide in their partner queue — use this to spot requests going stale and nudge."
        actions={
          <Link href="/channels" className="rounded-full border border-ink-300 px-3.5 py-1.5 text-[12px] font-semibold text-ink-800 hover:bg-ink-50">
            ← Channel operations
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Zap} label="All" value={all} href="/channels/enablements" active={!status} />
        <Kpi icon={Clock4} label="Requested" value={countBy.get('REQUESTED') ?? 0} href="/channels/enablements?status=REQUESTED" active={status === 'REQUESTED'} tone="warn" />
        <Kpi icon={CheckCircle2} label="Enabled" value={countBy.get('ENABLED') ?? 0} href="/channels/enablements?status=ENABLED" active={status === 'ENABLED'} tone="ok" />
        <Kpi icon={XCircle} label="Declined" value={countBy.get('DECLINED') ?? 0} href="/channels/enablements?status=DECLINED" active={status === 'DECLINED'} />
        <Kpi icon={PauseCircle} label="Suspended" value={countBy.get('SUSPENDED') ?? 0} href="/channels/enablements?status=SUSPENDED" active={status === 'SUSPENDED'} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip href="/channels/enablements" active={!status}>
          All
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} href={`/channels/enablements?status=${s}`} active={status === s}>
            {s.toLowerCase()}
            {countBy.get(s) ? ` · ${countBy.get(s)}` : ''}
          </Chip>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
              <th className="px-3 py-2.5">Requested</th>
              <th className="px-3 py-2.5">Creator</th>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Manufacturer</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Cap/day</th>
              <th className="px-3 py-2.5">Decided</th>
              <th className="px-3 py-2.5">Partner note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const stale = r.status === 'REQUESTED' && r.createdAt.getTime() < staleCutoff
              return (
                <tr key={r.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/50">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">
                    {r.createdAt.toISOString().slice(0, 10)}
                    {stale && (
                      <span className="ml-1 rounded-full bg-warning-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-warning-700" title="Requested more than 3 days ago — creator is blocked">
                        stale
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-700">{userBy.get(r.creatorUserId) ?? r.creatorUserId.slice(0, 8)}</td>
                  <td className="px-3 py-2 font-semibold text-ink-900">{productBy.get(r.productId) ?? r.productId.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-ink-700">{serviceBy.get(r.manufacturerServiceId) ?? r.manufacturerServiceId.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-700">{r.capacityPerDay ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">{r.decidedAt ? r.decidedAt.toISOString().slice(0, 10) : '—'}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-ink-500" title={r.partnerNote ?? undefined}>
                    {r.partnerNote ?? '—'}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-ink-400">
                  No enablement requests{status ? ` with status ${status.toLowerCase()}` : ' yet — they appear when creators request on-demand selling (needs db:push)'}.
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
              <Link href={`/channels/enablements?${status ? `status=${status}&` : ''}page=${page - 1}`} className="rounded-full border border-ink-200 px-3 py-1 font-semibold hover:bg-ink-50">
                ← Prev
              </Link>
            )}
            {page * PAGE_SIZE < total && (
              <Link href={`/channels/enablements?${status ? `status=${status}&` : ''}page=${page + 1}`} className="rounded-full border border-ink-200 px-3 py-1 font-semibold hover:bg-ink-50">
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
  icon: typeof Zap
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
    status === 'ENABLED'
      ? 'bg-success-50 text-success-700'
      : status === 'REQUESTED'
        ? 'bg-warning-50 text-warning-700'
        : status === 'SUSPENDED'
          ? 'bg-info-50 text-info-700'
          : 'bg-danger-50 text-danger-700'
  return <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase', cls)}>{status}</span>
}
