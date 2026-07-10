// Partner Packaging Catalog — list view.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md + task #128.
//
// Shows every PackagingSystem owned by the current partner, grouped by
// status (Active first, then Draft, then Retired). Each row links to the
// edit page where the partner manages core fields + surfaces.
//
// V1 admin-curated PackagingType library is empty at launch; partners
// always create from scratch. As the library grows (#135 promotion queue),
// new packaging systems will auto-link via the picker on the New page.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { Plus, Box, Layers, FileBox, CheckCircle2, FileEdit, Archive } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { topologyLabel } from './constants'
import { getPartnerRoleWord } from '@/lib/partner-role'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packaging — iLaunchify Partners' }

// v2 status pills — semantic tones (replaces legacy ring badges on this surface)
const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'border-success-200 bg-success-50 text-success-800' },
  DRAFT: { label: 'Draft', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
  RETIRED: { label: 'Retired', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
}

// Catalog-review lifecycle pills (docs/PACKAGING_REVIEW.md).
const REVIEW_PILL: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'In review', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
  APPROVED: { label: 'In catalog', cls: 'border-success-200 bg-success-50 text-success-800' },
  REJECTED: { label: 'Changes requested', cls: 'border-danger-200 bg-danger-50 text-danger-700' },
}

export default async function PackagingListPage() {
  const roleWord = await getPartnerRoleWord()
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      packagingSystems: {
        include: { _count: { select: { surfaces: true } } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      },
    },
  })

  if (!partner) return null

  // Group by status so admin queue mirrors what creator sees on marketplace
  const active = partner.packagingSystems.filter((s) => s.status === 'ACTIVE')
  const drafts = partner.packagingSystems.filter((s) => s.status === 'DRAFT')
  const retired = partner.packagingSystems.filter((s) => s.status === 'RETIRED')

  // Catalog-review submissions (docs/PACKAGING_REVIEW.md). Cast-guarded — the
  // review columns ship with a pending migration; .catch → [] keeps it safe.
  const submissions = await (prisma as unknown as {
    packagingSystem: {
      findMany: (a: unknown) => Promise<Array<{ id: string; partnerName: string; overrideDisplayName: string | null; reviewStatus: string | null; reviewNotes: string | null; submittedForReviewAt: Date | null }>>
    }
  }).packagingSystem
    .findMany({
      where: { partnerId: partner.id, reviewStatus: { in: ['SUBMITTED', 'APPROVED', 'REJECTED'] } },
      select: { id: true, partnerName: true, overrideDisplayName: true, reviewStatus: true, reviewNotes: true, submittedForReviewAt: true },
      orderBy: { submittedForReviewAt: 'desc' },
    })
    .catch(() => [] as Array<{ id: string; partnerName: string; overrideDisplayName: string | null; reviewStatus: string | null; reviewNotes: string | null; submittedForReviewAt: Date | null }>)

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              {roleWord} · Packaging
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Packaging catalog
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
              The packaging you offer. Each system lists one SKU&apos;s worth of physical packaging
              (a 16oz jar, a 12oz can, a stick pack, etc.). Active items are visible to creators
              when they pick packaging for a product.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/packaging/offerings"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Decoration offerings
            </Link>
            <Link
              href="/packaging/dielines"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <FileBox className="h-3.5 w-3.5" aria-hidden="true" /> Dielines
            </Link>
            <Link
              href="/packaging/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add packaging
            </Link>
          </div>
        </div>

        {partner.packagingSystems.length > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Kpi label="Active" value={active.length} icon={CheckCircle2} tone="emerald" />
            <Kpi label="Drafts" value={drafts.length} icon={FileEdit} tone="ink" />
            <Kpi label="Retired" value={retired.length} icon={Archive} tone="amber" />
          </div>
        )}
      </div>

      {/* Catalog-review submissions — the partner's own tracker for custom packaging
          they sent to the iLaunchify team to add to the shared Library. */}
      {submissions.length > 0 && (
        <div className="rounded-3xl border border-ink-200 bg-white px-6 py-5">
          <h2 className="font-display text-[16px] font-semibold tracking-tight text-ink-900">Catalog submissions</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-600">Custom packaging you submitted for the iLaunchify team to prep mockups and add to the shared Library.</p>
          <ul className="mt-3 space-y-2">
            {submissions.map((s) => {
              const pill = REVIEW_PILL[s.reviewStatus ?? ''] ?? { label: 'In review', cls: 'border-warning-200 bg-warning-50 text-warning-800' }
              const phase = s.reviewStatus === 'APPROVED' ? 'In catalog' : s.reviewStatus === 'REJECTED' ? 'Changes requested' : 'Pending review'
              return (
                <li key={s.id} className="rounded-2xl border border-ink-200 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-ink-900">{s.overrideDisplayName ?? s.partnerName}</span>
                    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', pill.cls)}>{pill.label}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-500">
                    Submitted{s.submittedForReviewAt ? ` ${new Date(s.submittedForReviewAt).toLocaleDateString()}` : ''} → admin review → {phase}
                  </div>
                  {s.reviewStatus === 'REJECTED' && s.reviewNotes && (
                    <p className="mt-1.5 rounded-lg border border-danger-200 bg-danger-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-danger-700">{s.reviewNotes}</p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {partner.packagingSystems.length === 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
            <Box className="h-6 w-6 text-pink-700" aria-hidden="true" />
          </div>
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">No packaging yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            Add your first packaging system so creators can pick it when customizing a product.
            You can save drafts and activate them when ready.
          </p>
          <Link
            href="/packaging/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add your first
          </Link>
        </section>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <Section title="Active" count={active.length}>
              <PackagingTable rows={active} />
            </Section>
          )}
          {drafts.length > 0 && (
            <Section title="Drafts" count={drafts.length}>
              <PackagingTable rows={drafts} />
            </Section>
          )}
          {retired.length > 0 && (
            <Section title="Retired" count={retired.length}>
              <PackagingTable rows={retired} />
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: 'ink' | 'emerald' | 'amber'
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    emerald: 'bg-success-100 text-success-700',
    amber: 'bg-warning-100 text-warning-700',
  }
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex items-baseline gap-2 border-b border-ink-100 px-5 py-3">
        <h2 className="font-display text-[14px] font-semibold tracking-tight text-ink-900">{title}</h2>
        <span className="text-[12px] font-normal tabular-nums text-ink-500">{count}</span>
      </header>
      {children}
    </section>
  )
}

import type { PackagingTopology, PackagingStatus } from '@ilaunchify/db'

type Row = {
  id: string
  partnerName: string
  topology: PackagingTopology
  status: PackagingStatus
  unitCount: number
  moq: number
  _count: { surfaces: number }
}

function PackagingTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
            <th className="px-5 py-2.5 font-semibold">Name</th>
            <th className="px-3 py-2.5 font-semibold">Topology</th>
            <th className="px-3 py-2.5 font-semibold">Units / pack</th>
            <th className="px-3 py-2.5 font-semibold">MOQ</th>
            <th className="px-3 py-2.5 font-semibold">Surfaces</th>
            <th className="px-5 py-2.5 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pill = STATUS_PILL[r.status] ?? {
              label: r.status,
              cls: 'border-ink-200 bg-ink-100 text-ink-700',
            }
            return (
              <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                <td className="px-5 py-3">
                  <div className="font-medium text-ink-900">{r.partnerName}</div>
                  <div className="mt-1">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                        pill.cls,
                      )}
                    >
                      {pill.label}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-ink-700">{topologyLabel(r.topology)}</td>
                <td className="px-3 py-3 tabular-nums text-ink-700">{r.unitCount}</td>
                <td className="px-3 py-3 tabular-nums text-ink-700">{r.moq.toLocaleString()}</td>
                <td className="px-3 py-3 tabular-nums text-ink-700">{r._count.surfaces}</td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/packaging/${r.id}`}
                    className="inline-flex items-center rounded-full border border-ink-200 bg-white px-3 py-1 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
