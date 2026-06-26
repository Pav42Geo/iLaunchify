// Admin Certificate type requests — partner-submitted requests for new cert
// types not yet in the library (C2). Follows the locked admin surface pattern:
// cream rounded-3xl hero + KPI strip + URL-driven status chips + plain table.
//
// Query params:
//   ?status=PENDING|APPROVED|REJECTED — default PENDING (the review queue)

import { prisma } from '@ilaunchify/db'
import Link from 'next/link'
import { cn } from '@ilaunchify/ui'
import {
  ScrollText,
  Clock,
  CheckCircle2,
  XCircle,
  Inbox,
  Building2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { RequestReviewActions } from './RequestReviewActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certificate type requests — Admin' }

type ReqStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

const STATUS_ORDER: ReqStatus[] = ['PENDING', 'APPROVED', 'REJECTED']

const STATUS_TONE: Record<ReqStatus, { dot: string; bg: string; text: string; border: string }> = {
  PENDING: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200' },
  APPROVED: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
  REJECTED: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-200' },
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
}

function isStatus(s: string | undefined): s is ReqStatus {
  return s === 'PENDING' || s === 'APPROVED' || s === 'REJECTED'
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function CertificateRequestsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const status: ReqStatus = isStatus(sp.status) ? sp.status : 'PENDING'

  const [counts, rows] = await Promise.all([
    prisma.certificateTypeRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.certificateTypeRequest.findMany({
      where: { status },
      include: { createdByPartner: { select: { id: true, companyName: true } } },
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      take: 200,
    }),
  ])

  const countMap = new Map(counts.map((c) => [c.status as ReqStatus, c._count._all]))
  const pending = countMap.get('PENDING') ?? 0
  const approved = countMap.get('APPROVED') ?? 0
  const rejected = countMap.get('REJECTED') ?? 0
  const total = pending + approved + rejected

  return (
    <div className="space-y-6">
      {/* Hero + KPI strip */}
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Inbox · Certificate library
          </p>
          <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Certificate type requests
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
            Partners can request a certification that isn&apos;t in the library yet. Approve
            to promote it into a CertificateType, or reject with a reason.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Total requests" value={total} icon={ScrollText} active />
          <Kpi label="Pending" value={pending} icon={Clock} tone="amber" />
          <Kpi label="Approved" value={approved} icon={CheckCircle2} tone="emerald" />
          <Kpi label="Rejected" value={rejected} icon={XCircle} tone="rose" />
        </div>
      </div>

      {/* Status chips */}
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
            Status
          </span>
          {STATUS_ORDER.map((s) => (
            <Link
              key={s}
              href={`/certificate-requests?status=${s}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
                status === s
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : `${STATUS_TONE[s].bg} ${STATUS_TONE[s].text} ${STATUS_TONE[s].border} hover:bg-white`,
              )}
            >
              {status !== s && <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_TONE[s].dot)} />}
              {s.charAt(0) + s.slice(1).toLowerCase()}
              <span className={cn('text-[10.5px] tabular-nums', status === s ? 'text-white/70' : 'text-ink-500')}>
                {countMap.get(s) ?? 0}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Requested cert</th>
                <th className="px-3 py-2.5 text-left font-semibold">Partner</th>
                <th className="px-3 py-2.5 text-left font-semibold">Applicability</th>
                <th className="px-3 py-2.5 text-left font-semibold">Submitted</th>
                <th className="px-3 py-2.5 text-right font-semibold">
                  {status === 'PENDING' ? 'Review' : 'Outcome'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top transition-colors hover:bg-pink-50/20">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-ink-900">{r.name}</p>
                    {r.issuingBody && (
                      <p className="mt-0.5 text-[11px] text-ink-500">Issuer: {r.issuingBody}</p>
                    )}
                    {r.description && (
                      <p className="mt-1 max-w-md text-[11.5px] text-ink-600">{r.description}</p>
                    )}
                    <code className="mt-1 inline-block rounded border border-ink-200 bg-zinc-50 px-1.5 py-[1px] font-mono text-[10px] text-ink-500">
                      → {slugify(r.name)}
                    </code>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/partners/${r.createdByPartner.id}`}
                      className="inline-flex items-center gap-1 text-ink-800 hover:text-pink-700"
                    >
                      <Building2 className="h-3 w-3" />
                      {r.createdByPartner.companyName}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <ApplicabilitySummary
                      labeling={r.applicableLabelingTypes}
                      categories={r.applicableCategorySlugs}
                      markets={r.applicableMarketSlugs}
                    />
                  </td>
                  <td className="px-3 py-3 text-[11.5px] text-ink-600">{formatAge(r.createdAt)}</td>
                  <td className="px-3 py-3 text-right">
                    {r.status === 'PENDING' ? (
                      <RequestReviewActions requestId={r.id} suggestedSlug={slugify(r.name)} />
                    ) : (
                      <Outcome status={r.status as ReqStatus} reason={r.rejectionReason} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ApplicabilitySummary({
  labeling,
  categories,
  markets,
}: {
  labeling: string[]
  categories: string[]
  markets: string[]
}) {
  const parts: string[] = []
  if (labeling.length) parts.push(`${labeling.length} labeling`)
  if (categories.length) parts.push(`${categories.length} categories`)
  if (markets.length) parts.push(`${markets.length} markets`)
  if (parts.length === 0) return <span className="text-[11px] text-ink-400">—</span>
  return <span className="text-[11.5px] text-ink-600">{parts.join(' · ')}</span>
}

function Outcome({ status, reason }: { status: ReqStatus; reason: string | null }) {
  const tone = STATUS_TONE[status]
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
          tone.bg,
          tone.text,
          tone.border,
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
        {status.charAt(0) + status.slice(1).toLowerCase()}
      </span>
      {status === 'REJECTED' && reason && (
        <span className="max-w-[220px] text-right text-[11px] text-ink-500">{reason}</span>
      )}
    </div>
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
  tone?: 'amber' | 'emerald' | 'rose'
  active?: boolean
}) {
  const iconTone: Record<'amber' | 'emerald' | 'rose', string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700',
  }
  return (
    <div
      className={cn(
        'rounded-2xl border border-ink-200 bg-white px-4 py-3.5 ring-1 ring-transparent',
        active && 'ring-pink-300/40',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            tone ? iconTone[tone] : 'bg-pink-100 text-pink-700',
          )}
        >
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

function EmptyState({ status }: { status: ReqStatus }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <Inbox className="h-5 w-5" />
      </span>
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {status === 'PENDING' ? 'Inbox zero — no pending requests' : `No ${status.toLowerCase()} requests`}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {status === 'PENDING'
          ? 'When a partner requests a certification not in the library, it lands here.'
          : 'Switch status filters to see the review queue.'}
      </p>
    </div>
  )
}

function formatAge(d: Date): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
