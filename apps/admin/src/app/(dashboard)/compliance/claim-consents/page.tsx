// Admin — Label-claim consent audit trail (C6). Every time a creator consents
// to place a certification badge on a label, a LabelClaimConsent row is written.
// This is the liability record (who claimed what, when, from where).
//
// Locked admin v2 surface. Query params: ?state=active|revoked

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { BadgeCheck, ShieldCheck, Undo2, Users, Package } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Label-claim consents — Admin' }

interface PageProps {
  searchParams: Promise<{ state?: string }>
}

export default async function ClaimConsentsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const state = sp.state === 'revoked' ? 'revoked' : sp.state === 'active' ? 'active' : undefined

  const where =
    state === 'active' ? { revokedAt: null } : state === 'revoked' ? { revokedAt: { not: null } } : {}

  const [rows, total, activeCount, revokedCount] = await Promise.all([
    prisma.labelClaimConsent.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.labelClaimConsent.count(),
    prisma.labelClaimConsent.count({ where: { revokedAt: null } }),
    prisma.labelClaimConsent.count({ where: { revokedAt: { not: null } } }),
  ])

  const userIds = [...new Set(rows.map((r) => r.userId))]
  const productIds = [...new Set(rows.map((r) => r.productId).filter((x): x is string => !!x))]
  const [users, products] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    productIds.length
      ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const productById = new Map(products.map((p) => [p.id, p]))

  const distinctCreators = new Set(rows.map((r) => r.userId)).size
  const distinctProducts = new Set(rows.map((r) => r.productId).filter(Boolean)).size

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Compliance & Data Rights · Liability record"
        title="Label-claim consents"
        description="Every certification badge a creator places on a label is recorded here — who consented, which product + cert, the consent wording version, and the IP/device. Badges never auto-stamp; this is the proof."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Total consents" value={total} icon={BadgeCheck} active />
        <Kpi label="Active" value={activeCount} icon={ShieldCheck} tone="emerald" />
        <Kpi label="Revoked" value={revokedCount} icon={Undo2} tone="rose" />
        <Kpi label="Creators (shown)" value={distinctCreators} icon={Users} tone="sky" />
        <Kpi label="Products (shown)" value={distinctProducts} icon={Package} tone="violet" />
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">State</span>
          <Chip href="/compliance/claim-consents" active={!state} label="All" count={total} />
          <Chip href="/compliance/claim-consents?state=active" active={state === 'active'} label="Active" count={activeCount} />
          <Chip href="/compliance/claim-consents?state=revoked" active={state === 'revoked'} label="Revoked" count={revokedCount} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center text-[13px] text-ink-500">
          No label-claim consents{state ? ` (${state})` : ' recorded yet'}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">When</th>
                <th className="px-3 py-2.5 text-left font-semibold">Creator</th>
                <th className="px-3 py-2.5 text-left font-semibold">Certification</th>
                <th className="px-3 py-2.5 text-left font-semibold">Product</th>
                <th className="px-3 py-2.5 text-left font-semibold">Origin</th>
                <th className="px-3 py-2.5 text-left font-semibold">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => {
                const u = userById.get(r.userId)
                const p = r.productId ? productById.get(r.productId) : null
                const revoked = !!r.revokedAt
                return (
                  <tr key={r.id} className="align-top transition-colors hover:bg-pink-50/20">
                    <td className="px-3 py-3 whitespace-nowrap text-[11.5px] text-ink-600">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-ink-900">{u?.name ?? 'Unknown'}</div>
                      {u?.email && <div className="text-[11px] text-ink-500">{u.email}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-ink-900">{r.certName}</div>
                      <div className="text-[10.5px] text-ink-400">consent v{r.consentTextVersion}</div>
                    </td>
                    <td className="px-3 py-3 text-ink-700">{p?.name ?? '—'}</td>
                    <td className="px-3 py-3 text-[11px] text-ink-500">
                      {r.ipAddress ?? '—'}
                      {r.userAgent && (
                        <span className="block max-w-[200px] truncate" title={r.userAgent}>
                          {r.userAgent}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                          revoked
                            ? 'border-rose-200 bg-rose-50 text-rose-900'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-900',
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', revoked ? 'bg-rose-500' : 'bg-emerald-500')} />
                        {revoked ? `Revoked ${new Date(r.revokedAt!).toLocaleDateString()}` : 'Active'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Chip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {label}
      <span className={cn('text-[10.5px] tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>{count}</span>
    </Link>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  active,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone?: 'emerald' | 'rose' | 'sky' | 'violet'
  active?: boolean
}) {
  const iconTone: Record<'emerald' | 'rose' | 'sky' | 'violet', string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700',
    sky: 'bg-sky-100 text-sky-700',
    violet: 'bg-violet-100 text-violet-700',
  }
  return (
    <div className={cn('rounded-2xl border border-ink-200 bg-white px-4 py-3.5 ring-1 ring-transparent', active && 'ring-pink-300/40')}>
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', tone ? iconTone[tone] : 'bg-pink-100 text-pink-700')}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">{value}</p>
        </div>
      </div>
    </div>
  )
}
