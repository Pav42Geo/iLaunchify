// Quality-dispute queue (PLATFORM_SPEC §Tier 3 B.1). Read-only triage list —
// creators open disputes within the post-delivery window; admins resolve them on
// the order detail page (ResolveDisputeControls). This surface exists so a filed
// dispute is SEEN, not just discoverable by opening the exact order.
//
// OrderDispute is cast-guarded (same as dispute-actions.ts) until the model is
// confirmed in the generated client; drop the cast post-migration.

import Link from 'next/link'
import { requireRole } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import type { OrderDisputeStatus, OrderDisputeCategory } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ArrowRight, Scale } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Disputes — Admin' }

// Anchored to the Prisma enums (SSOT) — this page reads prisma.orderDispute, so
// these are ORDER-dispute values, NOT the Stripe `DisputeStatus` enum they used to
// shadow by name. Aliases so a hand-rolled union can't drift from the DB (M5).
type DisputeStatus = OrderDisputeStatus
type DisputeCategory = OrderDisputeCategory

interface DisputeRow {
  id: string
  orderId: string
  openedById: string
  category: DisputeCategory
  description: string
  status: DisputeStatus
  createdAt: Date
}

const STATUS_PILL: Record<DisputeStatus, string> = {
  OPEN: 'border-warning-200 bg-warning-50 text-warning-800',
  UNDER_REVIEW: 'border-info-200 bg-info-50 text-info-800',
  RESOLVED: 'border-success-200 bg-success-50 text-success-800',
  REJECTED: 'border-danger-200 bg-danger-50 text-danger-800',
}

const CATEGORY_LABEL: Record<DisputeCategory, string> = {
  DAMAGED: 'Damaged',
  NOT_AS_DESCRIBED: 'Not as described',
  NOT_DELIVERED: 'Not delivered',
  QUALITY: 'Quality',
  OTHER: 'Other',
}

const STATUS_CHIPS: Array<{ value: DisputeStatus | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Rejected' },
]

function isStatus(v: string | undefined): v is DisputeStatus {
  return v === 'OPEN' || v === 'UNDER_REVIEW' || v === 'RESOLVED' || v === 'REJECTED'
}

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requireRole('ADMIN')
  const sp = await searchParams
  const activeStatus = isStatus(sp.status) ? sp.status : null

  // Cast-guarded read (OrderDispute pending-migration model — matches dispute-actions.ts).
  const all = (await (
    prisma as unknown as {
      orderDispute: { findMany: (a: unknown) => Promise<DisputeRow[]> }
    }
  ).orderDispute.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 300,
    select: {
      id: true,
      orderId: true,
      openedById: true,
      category: true,
      description: true,
      status: true,
      createdAt: true,
    },
  })) as DisputeRow[]

  const rows = activeStatus ? all.filter((d) => d.status === activeStatus) : all

  const openCount = all.filter((d) => d.status === 'OPEN' || d.status === 'UNDER_REVIEW').length
  const resolved = all.filter((d) => d.status === 'RESOLVED').length
  const rejected = all.filter((d) => d.status === 'REJECTED').length

  // Resolve creator (opener) names in one batch.
  const openerIds = [...new Set(rows.map((d) => d.openedById))]
  const openers = openerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: openerIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const nameById = new Map(openers.map((u) => [u.id, u.name ?? u.email]))

  const chipHref = (status: DisputeStatus | null) => (status ? `/disputes?status=${status}` : '/disputes')

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Inbox · Quality disputes"
        title="Disputes"
        description="Creators open these within the post-delivery window. Open the order to review the report and resolve or reject it — resolving in the creator's favor can issue a refund."
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: all.length, tone: 'text-ink-900' },
          { label: 'Needs review', value: openCount, tone: openCount > 0 ? 'text-warning-700' : 'text-ink-900' },
          { label: 'Resolved', value: resolved, tone: 'text-success-700' },
          { label: 'Rejected', value: rejected, tone: 'text-danger-700' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
            <div className={`font-display text-[26px] font-bold tabular-nums ${k.tone}`}>{k.value}</div>
            <div className="text-[11.5px] text-ink-500">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Status chips */}
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => {
          const isActive = activeStatus === c.value
          return (
            <Link
              key={c.label}
              href={chipHref(c.value)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1.5 text-[11.5px] font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
                isActive
                  ? 'border-success-500 bg-success-50 text-success-800'
                  : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900',
              )}
            >
              {c.label}
            </Link>
          )
        })}
      </nav>

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
              <Scale className="h-6 w-6 text-pink-700" aria-hidden="true" />
            </div>
            <p className="mt-3 text-[13px] text-ink-600">
              {activeStatus ? 'No disputes with this status.' : 'No disputes filed yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 font-semibold">Report</th>
                  <th className="px-4 py-2.5 font-semibold">Opened by</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/orders/${d.orderId}`}
                        className="font-mono text-[11.5px] text-pink-700 hover:underline"
                      >
                        #{d.orderId.slice(-8)}
                      </Link>
                      <p className="mt-0.5 text-[10.5px] text-ink-400">
                        {new Date(d.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-[12.5px] text-ink-700">
                      {CATEGORY_LABEL[d.category] ?? d.category}
                    </td>
                    <td className="max-w-[280px] px-4 py-3 align-top text-[12.5px] text-ink-600">
                      <span className="line-clamp-2">{d.description}</span>
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] text-ink-600">
                      {nameById.get(d.openedById) ?? '—'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                          STATUS_PILL[d.status],
                        )}
                      >
                        {d.status.replace('_', ' ').toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <Link
                        href={`/orders/${d.orderId}`}
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-pink-700 hover:text-pink-800"
                      >
                        {d.status === 'OPEN' || d.status === 'UNDER_REVIEW' ? 'Review' : 'View'}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
