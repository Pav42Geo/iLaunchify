// Admin — Document Access Log (P10 / GDPR accountability). Every signed-URL
// read of a private partner document (cert PDFs today) writes a DocumentAccessLog
// row via readPartnerDocument(). This surface makes those reads auditable.
//
// Locked admin v2 surface: cream hero + 5-card KPI strip + reason chips +
// plain sortable table.
//
// Query params:
//   ?reason=VERIFICATION|SUPPORT|AUDIT|PARTNER_DOWNLOAD|LEGAL_HOLD|ADMIN_REVIEW

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import {
  ShieldCheck,
  FileText,
  Users,
  Clock,
  CalendarDays,
  Eye,
  Building2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DocumentAccessReason } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Document access log — Admin' }

const REASONS: DocumentAccessReason[] = [
  'VERIFICATION',
  'ADMIN_REVIEW',
  'SUPPORT',
  'AUDIT',
  'PARTNER_DOWNLOAD',
  'LEGAL_HOLD',
]

const REASON_TONE: Record<DocumentAccessReason, { bg: string; text: string; border: string; dot: string }> = {
  VERIFICATION: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  ADMIN_REVIEW: { bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200', dot: 'bg-sky-500' },
  SUPPORT: { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200', dot: 'bg-amber-500' },
  AUDIT: { bg: 'bg-violet-50', text: 'text-violet-900', border: 'border-violet-200', dot: 'bg-violet-500' },
  PARTNER_DOWNLOAD: { bg: 'bg-zinc-50', text: 'text-ink-700', border: 'border-zinc-200', dot: 'bg-zinc-400' },
  LEGAL_HOLD: { bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-200', dot: 'bg-rose-500' },
}

function isReason(s: string | undefined): s is DocumentAccessReason {
  return !!s && (REASONS as string[]).includes(s)
}

function humanReason(r: DocumentAccessReason): string {
  return r
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

interface PageProps {
  searchParams: Promise<{ reason?: string }>
}

export default async function DocumentAccessLogPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const reason = isReason(sp.reason) ? sp.reason : undefined

  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

  const [rows, totalCount, last7Count, last30Count, reasonCounts] = await Promise.all([
    prisma.documentAccessLog.findMany({
      where: reason ? { accessReason: reason } : {},
      orderBy: { accessedAt: 'desc' },
      take: 200,
    }),
    prisma.documentAccessLog.count(),
    prisma.documentAccessLog.count({ where: { accessedAt: { gte: sevenDaysAgo } } }),
    prisma.documentAccessLog.count({ where: { accessedAt: { gte: thirtyDaysAgo } } }),
    prisma.documentAccessLog.groupBy({ by: ['accessReason'], _count: { _all: true } }),
  ])

  // Resolve the soft FKs (actorUserId → User, fileId → PartnerFile → Partner,
  // productTemplateId → ProductTemplate) in batched lookups.
  const actorIds = [...new Set(rows.map((r) => r.actorUserId))]
  const fileIds = [...new Set(rows.map((r) => r.fileId))]
  const productIds = [...new Set(rows.map((r) => r.productTemplateId).filter((x): x is string => !!x))]

  const [actors, files, products] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }),
    prisma.partnerFile.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, originalFilename: true, partner: { select: { companyName: true } } },
    }),
    productIds.length
      ? prisma.productTemplate.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ])

  const actorById = new Map(actors.map((a) => [a.id, a]))
  const fileById = new Map(files.map((f) => [f.id, f]))
  const productById = new Map(products.map((p) => [p.id, p]))

  const reasonCountMap = new Map(reasonCounts.map((c) => [c.accessReason as DocumentAccessReason, c._count._all]))
  const distinctDocs = new Set(rows.map((r) => r.fileId)).size
  const distinctViewers = new Set(rows.map((r) => r.actorUserId)).size

  return (
    <div className="space-y-6">
      {/* Hero + KPI strip */}
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Compliance &amp; Data Rights · GDPR accountability
          </p>
          <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Document access log
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            Every read of a private partner document (certificate PDFs) is logged here with a
            required reason — the accountability record behind the cert-PDF viewer.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Total reads" value={totalCount} icon={Eye} active />
          <Kpi label="Last 7 days" value={last7Count} icon={Clock} tone="amber" />
          <Kpi label="Last 30 days" value={last30Count} icon={CalendarDays} tone="sky" />
          <Kpi label="Documents (shown)" value={distinctDocs} icon={FileText} tone="violet" />
          <Kpi label="Viewers (shown)" value={distinctViewers} icon={Users} tone="emerald" />
        </div>
      </div>

      {/* Reason chips */}
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
            Reason
          </span>
          <Chip href="/compliance/document-access" active={!reason} label="All" count={totalCount} />
          {REASONS.map((r) => (
            <Chip
              key={r}
              href={`/compliance/document-access?reason=${r}`}
              active={reason === r}
              label={humanReason(r)}
              count={reasonCountMap.get(r) ?? 0}
              tone={REASON_TONE[r]}
            />
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState filtered={!!reason} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">When</th>
                <th className="px-3 py-2.5 text-left font-semibold">Viewer</th>
                <th className="px-3 py-2.5 text-left font-semibold">Document</th>
                <th className="px-3 py-2.5 text-left font-semibold">Reason</th>
                <th className="px-3 py-2.5 text-left font-semibold">Product context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => {
                const actor = actorById.get(r.actorUserId)
                const file = fileById.get(r.fileId)
                const product = r.productTemplateId ? productById.get(r.productTemplateId) : null
                const tone = REASON_TONE[r.accessReason as DocumentAccessReason]
                return (
                  <tr key={r.id} className="align-top transition-colors hover:bg-pink-50/20">
                    <td className="px-3 py-3 text-[11.5px] text-ink-600 whitespace-nowrap">
                      {new Date(r.accessedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-ink-900">{actor?.name ?? 'Unknown'}</div>
                      {actor?.email && <div className="text-[11px] text-ink-500">{actor.email}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 text-ink-800">
                        <FileText className="h-3 w-3 text-ink-400" />
                        <span className="truncate">{file?.originalFilename ?? r.fileId}</span>
                      </div>
                      {file?.partner?.companyName && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ink-500">
                          <Building2 className="h-3 w-3" />
                          {file.partner.companyName}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                          tone.bg,
                          tone.text,
                          tone.border,
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                        {humanReason(r.accessReason as DocumentAccessReason)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[11.5px] text-ink-600">{product?.name ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 200 && (
            <div className="border-t border-ink-100 bg-zinc-50/60 px-3 py-2 text-[11px] text-ink-500">
              Showing the 200 most recent reads{reason ? ` for ${humanReason(reason)}` : ''}. Narrow
              by reason to see older entries.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string
  active: boolean
  label: string
  count: number
  tone?: { bg: string; text: string; border: string; dot: string }
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : tone
            ? `${tone.bg} ${tone.text} ${tone.border} hover:bg-white`
            : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {tone && !active && <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />}
      {label}
      <span className={cn('text-[10.5px] tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>
        {count}
      </span>
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
  tone?: 'amber' | 'emerald' | 'sky' | 'violet'
  active?: boolean
}) {
  const iconTone: Record<'amber' | 'emerald' | 'sky' | 'violet', string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    violet: 'bg-violet-100 text-violet-700',
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

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <ShieldCheck className="h-5 w-5" />
      </span>
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No reads for this reason' : 'No document reads logged yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Switch reason filters, or clear to see everything.'
          : 'When an admin opens a partner cert PDF, the access is recorded here.'}
      </p>
    </div>
  )
}
