// Admin certificate library — list view (#129 + Pavel 2026-06-01 advancement).
//
// Cream-header pattern matching other advanced admin pages + the platform
// 3-dot RowActionsMenu standard on every row (View / Edit / Deprecate /
// More → Copy slug / Copy ID / Audit log).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import {
  ShieldCheck,
  FileImage,
  Award,
  Plus,
  Users,
  CheckCircle2,
  AlertOctagon,
} from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { CertificateTypeRowActions } from './CertificateTypeRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certificate library — iLaunchify Admin' }

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function CertificateTypesListPage({ searchParams }: PageProps) {
  const { status: statusParam } = await searchParams
  const status =
    statusParam === 'ACTIVE' || statusParam === 'DEPRECATED'
      ? (statusParam as 'ACTIVE' | 'DEPRECATED')
      : null

  const [types, activeCount, deprecatedCount, withThumbnail, totalClaims] =
    await Promise.all([
      prisma.certificateType.findMany({
        where: status ? { status } : {},
        include: { _count: { select: { partnerInstances: true } } },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      prisma.certificateType.count({ where: { status: 'ACTIVE' } }),
      prisma.certificateType.count({ where: { status: 'DEPRECATED' } }),
      prisma.certificateType.count({ where: { thumbnailFileId: { not: null } } }),
      prisma.partnerCertificateInstance.count(),
    ])

  const totalCount = activeCount + deprecatedCount

  return (
    <div className="space-y-6">
      <Header
        totalCount={totalCount}
        activeCount={activeCount}
        withThumbnail={withThumbnail}
        totalClaims={totalClaims}
      />

      <FilterChips
        active={status}
        totalCount={totalCount}
        activeCount={activeCount}
        deprecatedCount={deprecatedCount}
      />

      {types.length === 0 ? (
        <EmptyState filtered={status !== null} />
      ) : (
        <CertificateTypesTable rows={types} />
      )}
    </div>
  )
}

// =============================================================================
// Header
// =============================================================================

function Header({
  totalCount,
  activeCount,
  withThumbnail,
  totalClaims,
}: {
  totalCount: number
  activeCount: number
  withThumbnail: number
  totalClaims: number
}) {
  return (
    <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-[#F3EFE8] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-500">
            Manage › Asset Management
          </p>
          <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-ink-900">
            Certificate library
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] text-ink-600">
            Admin-curated canonical cert types (NSF, USDA Organic, etc.).
            Partners pick from this list when claiming certificates. Branded
            thumbnail required before badges appear publicly.
          </p>
        </div>
        <Link
          href="/certificate-types/new"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[13px] font-semibold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Add certificate type
        </Link>
      </div>
      <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100 sm:grid-cols-4">
        <Kpi icon={Award} label="Total types" value={totalCount} tone="ink" />
        <Kpi icon={CheckCircle2} label="Active" value={activeCount} tone="success" />
        <Kpi icon={ShieldCheck} label="With thumbnail" value={withThumbnail} tone="pink" />
        <Kpi icon={Users} label="Partner claims" value={totalClaims} tone="info" />
      </div>
    </header>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Award
  label: string
  value: number
  tone: 'ink' | 'pink' | 'info' | 'success'
}) {
  const numeralTone = {
    ink: 'text-ink-900',
    pink: 'text-pink-700',
    info: 'text-blue-700',
    success: 'text-emerald-700',
  }[tone]
  return (
    <div className="px-5 py-3.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-display text-[22px] font-semibold tabular-nums leading-none tracking-tight',
          numeralTone,
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  )
}

// =============================================================================
// Filter chips
// =============================================================================

function FilterChips({
  active,
  totalCount,
  activeCount,
  deprecatedCount,
}: {
  active: 'ACTIVE' | 'DEPRECATED' | null
  totalCount: number
  activeCount: number
  deprecatedCount: number
}) {
  const filters: Array<{
    value: 'ACTIVE' | 'DEPRECATED' | null
    label: string
    count: number
  }> = [
    { value: null, label: 'All', count: totalCount },
    { value: 'ACTIVE', label: 'Active', count: activeCount },
    { value: 'DEPRECATED', label: 'Deprecated', count: deprecatedCount },
  ]
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
      {filters.map((f) => {
        const isActive = active === f.value
        const href = f.value
          ? `/certificate-types?status=${f.value}`
          : '/certificate-types'
        return (
          <Link
            key={f.label}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
              isActive
                ? 'border-pink-500 bg-pink-500 text-white'
                : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900',
            )}
          >
            {f.label}
            <span
              className={cn(
                'inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums',
                isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-700',
              )}
            >
              {f.count}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

// =============================================================================
// Table
// =============================================================================

interface CertTypeRow {
  id: string
  name: string
  slug: string
  description: string
  thumbnailFileId: string | null
  status: 'ACTIVE' | 'DEPRECATED'
  _count: { partnerInstances: number }
}

function CertificateTypesTable({ rows }: { rows: CertTypeRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Name</Th>
            <Th>Slug</Th>
            <Th>Badge</Th>
            <Th>Status</Th>
            <Th className="text-right">Partners claiming</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((t) => (
            <tr key={t.id} className="group hover:bg-ink-50/40">
              <td className="px-4 py-3 align-top">
                <Link
                  href={`/certificate-types/${t.id}`}
                  className="-mx-2 -my-1 block rounded-md px-2 py-1 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                >
                  <p className="font-semibold text-ink-900">{t.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-500">
                    {t.description}
                  </p>
                </Link>
              </td>
              <td className="px-4 py-3 align-top">
                <code className="rounded border border-ink-200 bg-zinc-50 px-1.5 py-[2px] font-mono text-[11px] text-ink-700">
                  {t.slug}
                </code>
              </td>
              <td className="px-4 py-3 align-top">
                {t.thumbnailFileId ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Uploaded
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider text-amber-800">
                    <FileImage className="h-2.5 w-2.5" />
                    Missing
                  </span>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                {t.status === 'ACTIVE' ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-100 px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider text-ink-700">
                    <AlertOctagon className="h-2.5 w-2.5" />
                    Deprecated
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right align-top tabular-nums">
                <span
                  className={
                    t._count.partnerInstances > 0
                      ? 'font-semibold text-ink-900'
                      : 'text-ink-400'
                  }
                >
                  {t._count.partnerInstances.toLocaleString()}
                </span>
              </td>
              <td className="px-3 py-3 text-right align-top">
                <CertificateTypeRowActions
                  id={t.id}
                  name={t.name}
                  slug={t.slug}
                  status={t.status}
                  instanceCount={t._count.partnerInstances}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =============================================================================
// Local helpers
// =============================================================================

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={'px-4 py-2.5 text-left font-semibold ' + (className ?? '')}>
      {children}
    </th>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-zinc-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
      >
        <ShieldCheck className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
        {filtered ? 'No certificate types in this status' : 'No certificate types yet'}
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
        {filtered
          ? 'Try a different filter or clear it to see everything.'
          : 'Run pnpm seed:certificate-types to load the 12 starter types, or add one manually.'}
      </p>
      {!filtered && (
        <Link
          href="/certificate-types/new"
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3 w-3" />
          Add your first
        </Link>
      )}
    </div>
  )
}
