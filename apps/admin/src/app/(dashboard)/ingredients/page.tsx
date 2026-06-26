// Admin Ingredients — advanced verification queue (Pavel 2026-06-01 v2).
//
// Follows the locked admin surface pattern (cream rounded-3xl hero band +
// 5-card KPI strip + URL-driven filter chips + sortable status-pill table +
// RowActionsMenu trailing cell). See memory: ilaunchify-admin-surface-pattern.
//
// Query params:
//   ?q=ascorbic    — search internalName / labelDeclarationName / name
//   ?status=SELF_ATTESTED|ADMIN_VERIFIED|LIBRARY_PROMOTED
//   ?source=USDA|LIBRARY|PARTNER_PRIVATE
//   ?sort=used|newest|oldest — default "used" (most-used first)
//   ?page=2        — pagination (50 / page)
//
// We surface every Ingredient row here (not just SELF_ATTESTED) so admin can
// audit promotions, demote rows, and chase down ingredients with high usage
// that are still SELF_ATTESTED past the urgent threshold.

import { prisma } from '@ilaunchify/db'
import Link from 'next/link'
import {
  FlaskConical,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Library,
  Search,
  Ban,
  CheckCircle2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { VerificationStatus, IngredientSource } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { IngredientRowActions } from './IngredientRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ingredient queue — Admin' }

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const STATUS_ORDER: VerificationStatus[] = [
  'SELF_ATTESTED',
  'ADMIN_VERIFIED',
  'LIBRARY_PROMOTED',
]

const STATUS_LABELS: Record<VerificationStatus, string> = {
  SELF_ATTESTED: 'Self-attested',
  ADMIN_VERIFIED: 'Verified',
  LIBRARY_PROMOTED: 'Promoted',
}

const STATUS_TONE: Record<
  VerificationStatus,
  { dot: string; bg: string; text: string; border: string }
> = {
  SELF_ATTESTED: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200' },
  ADMIN_VERIFIED: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
  LIBRARY_PROMOTED: { dot: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200' },
}

const SOURCE_ORDER: IngredientSource[] = ['USDA', 'LIBRARY', 'PARTNER_PRIVATE', 'DSLD', 'INCI', 'AAFCO']

const SOURCE_LABELS: Record<IngredientSource, string> = {
  USDA: 'USDA',
  LIBRARY: 'Curated',
  PARTNER_PRIVATE: 'Partner-private',
  DSLD: 'NIH DSLD',
  INCI: 'INCI',
  AAFCO: 'AAFCO',
}

const SOURCE_TONE: Record<
  IngredientSource,
  { dot: string; bg: string; text: string; border: string }
> = {
  USDA: { dot: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200' },
  LIBRARY: { dot: 'bg-pink-500', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  PARTNER_PRIVATE: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200' },
  DSLD: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
  INCI: { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-900', border: 'border-violet-200' },
  AAFCO: { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-200' },
}

const PAGE_SIZE = 50
const STUCK_REVIEW_DAYS = 14
const STUCK_USAGE_THRESHOLD = 5

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    source?: string
    sort?: string
    page?: string
  }>
}

function isValidStatus(s: string | undefined): s is VerificationStatus {
  return !!s && (STATUS_ORDER as readonly string[]).includes(s)
}
function isValidSource(s: string | undefined): s is IngredientSource {
  return !!s && (SOURCE_ORDER as readonly string[]).includes(s)
}
function parseSort(s: string | undefined): 'used' | 'newest' | 'oldest' {
  if (s === 'newest' || s === 'oldest') return s
  return 'used'
}

export default async function IngredientsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = sp.q?.trim() || ''
  const status = isValidStatus(sp.status) ? sp.status : undefined
  const source = isValidSource(sp.source) ? sp.source : undefined
  const sort = parseSort(sp.sort)
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  // Free-form where clause, narrowed by Prisma typing at the query site.
  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { internalName: { contains: q, mode: 'insensitive' } },
      { labelDeclarationName: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (status) where.verificationStatus = status
  if (source) where.source = source

  // Window for the "Promoted this month" KPI (last 30 days).
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalAll,
    statusCounts,
    sourceCounts,
    promotedRecent,
    curatedCount,
    oldestStuckRaw,
    total,
    rows,
  ] = await Promise.all([
    prisma.ingredient.count(),
    prisma.ingredient.groupBy({ by: ['verificationStatus'], _count: { _all: true } }),
    prisma.ingredient.groupBy({ by: ['source'], _count: { _all: true } }),
    prisma.ingredient.count({
      where: {
        verificationStatus: 'LIBRARY_PROMOTED',
        updatedAt: { gte: thirtyDaysAgo },
      } as never,
    }),
    prisma.ingredient.count({ where: { source: 'LIBRARY' } as never }),
    prisma.ingredient.findFirst({
      where: {
        verificationStatus: 'SELF_ATTESTED',
        source: 'PARTNER_PRIVATE',
      } as never,
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, _count: { select: { recipeIngredients: true } } },
    }),
    prisma.ingredient.count({ where: where as never }),
    prisma.ingredient.findMany({
      where: where as never,
      select: {
        id: true,
        name: true,
        internalName: true,
        labelDeclarationName: true,
        source: true,
        verificationStatus: true,
        bioengineeredStatus: true,
        allergenFlags: true,
        createdAt: true,
        updatedAt: true,
        coaFileId: true,
        ownerPartner: { select: { companyName: true } },
        _count: { select: { recipeIngredients: true } },
      },
      orderBy:
        sort === 'newest'
          ? { createdAt: 'desc' }
          : sort === 'oldest'
            ? { createdAt: 'asc' }
            : { createdAt: 'desc' }, // server fallback; we sort by usage in-process below
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ])

  // Banned-name detection — match against active BannedIngredient rows.
  // Privacy-safe (no joins) and capped at 500 for cheap in-process check.
  const bannedRows = await prisma.bannedIngredient.findMany({
    where: { isActive: true },
    select: { matchName: true, casNumber: true },
    take: 500,
  })
  const bannedNames = new Set(
    bannedRows
      .map((b) => b.matchName?.toLowerCase().trim())
      .filter((n): n is string => !!n),
  )

  // If sort = used, re-sort the page in-memory by usage count.
  const sortedRows =
    sort === 'used'
      ? [...rows].sort((a, b) => b._count.recipeIngredients - a._count.recipeIngredients)
      : rows

  const statusCountMap = new Map(
    statusCounts.map((c) => [c.verificationStatus as VerificationStatus, c._count._all]),
  )
  const sourceCountMap = new Map(
    sourceCounts.map((c) => [c.source as IngredientSource | null, c._count._all]),
  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const selfAttestedCount = statusCountMap.get('SELF_ATTESTED') ?? 0
  const oldestStuckDays = oldestStuckRaw
    ? Math.floor((Date.now() - new Date(oldestStuckRaw.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : null
  const oldestStuckUsage = oldestStuckRaw?._count.recipeIngredients ?? 0
  const urgentCondition =
    oldestStuckDays != null &&
    oldestStuckDays >= STUCK_REVIEW_DAYS &&
    oldestStuckUsage >= STUCK_USAGE_THRESHOLD

  return (
    <div className="space-y-6">
      <Header
        totalAll={totalAll}
        selfAttestedCount={selfAttestedCount}
        flaggedCount={0 /* schema has no FLAGGED status today; placeholder card below */}
        promotedRecent={promotedRecent}
        curatedCount={curatedCount}
      />

      {urgentCondition && (
        <Link
          href="/ingredients?status=SELF_ATTESTED&source=PARTNER_PRIVATE&sort=oldest"
          className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-3 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-rose-900">
              Self-attested ingredient stuck {oldestStuckDays} days · already in {oldestStuckUsage} recipes
            </p>
            <p className="text-[11.5px] text-rose-700">
              Triage the partner-private queue oldest-first to keep cross-partner repeats from piling up.
            </p>
          </div>
          <Sparkles className="h-4 w-4 text-rose-700" />
        </Link>
      )}

      <FilterBar
        q={q}
        status={status}
        source={source}
        sort={sort}
        statusCountMap={statusCountMap}
        sourceCountMap={sourceCountMap}
        total={total}
      />

      {sortedRows.length === 0 ? (
        <EmptyState filtered={Boolean(q || status || source)} />
      ) : (
        <IngredientsTable rows={sortedRows} sort={sort} bannedNames={bannedNames} />
      )}

      <Pagination page={page} totalPages={totalPages} sp={sp} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Header({
  totalAll,
  selfAttestedCount,
  flaggedCount,
  promotedRecent,
  curatedCount,
}: {
  totalAll: number
  selfAttestedCount: number
  flaggedCount: number
  promotedRecent: number
  curatedCount: number
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Asset Management · Ingredient verification
          </p>
          <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Ingredient queue
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            Partner-private + curated-library ingredients pending verification. Promote good ones to the shared library, flag suspect ones, leave self-attested ones in place.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/ingredients"
          label="Total in queue"
          value={totalAll}
          icon={FlaskConical}
          active
        />
        <KpiCard
          href="/ingredients?status=SELF_ATTESTED"
          label="Self-attested"
          value={selfAttestedCount}
          icon={ShieldCheck}
          tone="amber"
        />
        <KpiCard
          href="/ingredients?status=SELF_ATTESTED&source=PARTNER_PRIVATE&sort=oldest"
          label="Flagged"
          value={flaggedCount}
          icon={AlertTriangle}
          tone="rose"
        />
        <KpiCard
          href="/ingredients?status=LIBRARY_PROMOTED"
          label="Promoted (30d)"
          value={promotedRecent}
          icon={Sparkles}
          tone="emerald"
        />
        <KpiCard
          href="/ingredients?source=LIBRARY"
          label="Curated library"
          value={curatedCount}
          icon={Library}
          tone="sky"
        />
      </div>
    </div>
  )
}

function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  tone,
  active,
  subline,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose'
  active?: boolean
  subline?: string
}) {
  const ring: Record<'amber' | 'emerald' | 'sky' | 'rose', string> = {
    amber: 'group-hover:ring-amber-300/60',
    emerald: 'group-hover:ring-emerald-300/60',
    sky: 'group-hover:ring-sky-300/60',
    rose: 'group-hover:ring-rose-300/60',
  }
  const iconTone: Record<'amber' | 'emerald' | 'sky' | 'rose', string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    rose: 'bg-rose-100 text-rose-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        'ring-1 ring-transparent',
        tone ? ring[tone] : 'group-hover:ring-pink-300/40',
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
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">{value}</p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// -----------------------------------------------------------------------------
// FilterBar
// -----------------------------------------------------------------------------

function FilterBar({
  q,
  status,
  source,
  sort,
  statusCountMap,
  sourceCountMap,
  total,
}: {
  q: string
  status: VerificationStatus | undefined
  source: IngredientSource | undefined
  sort: 'used' | 'newest' | 'oldest'
  statusCountMap: Map<VerificationStatus, number>
  sourceCountMap: Map<IngredientSource | null, number>
  total: number
}) {
  const buildHref = (overrides: Partial<{ status: string; source: string; sort: string; q: string }>) => {
    const params = new URLSearchParams()
    const finalQ: string = overrides.q !== undefined ? overrides.q : q
    const finalStatus: string = overrides.status !== undefined ? overrides.status : status ?? ''
    const finalSource: string = overrides.source !== undefined ? overrides.source : source ?? ''
    const finalSort: string = overrides.sort !== undefined ? overrides.sort : sort
    if (finalQ) params.set('q', finalQ)
    if (finalStatus) params.set('status', finalStatus)
    if (finalSource) params.set('source', finalSource)
    if (finalSort && finalSort !== 'used') params.set('sort', finalSort)
    const qs = params.toString()
    return `/ingredients${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      <form className="flex flex-wrap items-center gap-2" method="GET">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search internal name, label name…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        {source && <input type="hidden" name="source" value={source} />}
        {sort !== 'used' && <input type="hidden" name="sort" value={sort} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Search
        </button>
        {(q || status || source || sort !== 'used') && (
          <Link
            href="/ingredients"
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Clear
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-600">
          <span className="hidden md:inline">{total.toLocaleString()} results</span>
          <SortToggle currentSort={sort} buildHref={buildHref} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Status
        </span>
        <FilterChip href={buildHref({ status: '' })} active={!status} label="All" count={null} />
        {STATUS_ORDER.map((s) => (
          <FilterChip
            key={s}
            href={buildHref({ status: s })}
            active={status === s}
            label={STATUS_LABELS[s]!}
            count={statusCountMap.get(s) ?? 0}
            tone={STATUS_TONE[s]!}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Source
        </span>
        <FilterChip href={buildHref({ source: '' })} active={!source} label="All" count={null} />
        {SOURCE_ORDER.map((s) => (
          <FilterChip
            key={s}
            href={buildHref({ source: s })}
            active={source === s}
            label={SOURCE_LABELS[s]!}
            count={sourceCountMap.get(s) ?? 0}
            tone={SOURCE_TONE[s]!}
          />
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string
  active: boolean
  label: string
  count: number | null
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
      {count !== null && (
        <span className={cn('text-[10.5px] tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>
          {count}
        </span>
      )}
    </Link>
  )
}

function SortToggle({
  currentSort,
  buildHref,
}: {
  currentSort: 'used' | 'newest' | 'oldest'
  buildHref: (o: Partial<{ status: string; source: string; sort: string; q: string }>) => string
}) {
  const options: { value: 'used' | 'newest' | 'oldest'; label: string }[] = [
    { value: 'used', label: 'Most used' },
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
  ]
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white p-0.5">
      {options.map((o) => (
        <Link
          key={o.value}
          href={buildHref({ sort: o.value })}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
            currentSort === o.value
              ? 'bg-ink-900 text-white'
              : 'text-ink-600 hover:bg-ink-50',
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Table
// -----------------------------------------------------------------------------

type IngredientRow = {
  id: string
  name: string
  internalName: string | null
  labelDeclarationName: string | null
  source: IngredientSource | null
  verificationStatus: VerificationStatus
  bioengineeredStatus: string
  allergenFlags: string[]
  createdAt: Date
  updatedAt: Date
  coaFileId: string | null
  ownerPartner: { companyName: string } | null
  _count: { recipeIngredients: number }
}

function IngredientsTable({
  rows,
  sort,
  bannedNames,
}: {
  rows: IngredientRow[]
  sort: 'used' | 'newest' | 'oldest'
  bannedNames: Set<string>
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Ingredient</Th>
            <Th>Source</Th>
            <Th>Status</Th>
            <Th className="text-right">Usage</Th>
            <Th>Flags</Th>
            <Th>Added</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => {
            const statusTone = STATUS_TONE[r.verificationStatus]!
            const sourceTone = r.source ? SOURCE_TONE[r.source]! : null
            const internalDisplay = r.internalName ?? r.name
            const banned = bannedNames.has(internalDisplay.toLowerCase().trim())
            const hasAllergen = r.allergenFlags.length > 0
            const hasBio =
              r.bioengineeredStatus === 'BIOENGINEERED' ||
              r.bioengineeredStatus === 'DERIVED_FROM_BIOENGINEERED'
            const age = daysAgo(r.createdAt)

            return (
              <tr key={r.id} className="transition-colors hover:bg-pink-50/20">
                <td className="px-3 py-3 align-top">
                  <p className="font-semibold text-ink-900">{internalDisplay}</p>
                  {r.labelDeclarationName && r.labelDeclarationName !== internalDisplay && (
                    <p className="mt-0.5 text-[10.5px] italic text-ink-500">
                      Label: &ldquo;{r.labelDeclarationName}&rdquo;
                    </p>
                  )}
                  {r.ownerPartner?.companyName && (
                    <p className="mt-0.5 text-[10.5px] text-ink-400">{r.ownerPartner.companyName}</p>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  {sourceTone ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                        sourceTone.bg,
                        sourceTone.text,
                        sourceTone.border,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', sourceTone.dot)} />
                      {SOURCE_LABELS[r.source!]}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                      statusTone.bg,
                      statusTone.text,
                      statusTone.border,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', statusTone.dot)} />
                    {STATUS_LABELS[r.verificationStatus]}
                  </span>
                </td>
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  <span
                    className={
                      r._count.recipeIngredients > 0
                        ? 'font-semibold text-ink-900'
                        : 'text-ink-400'
                    }
                  >
                    {r._count.recipeIngredients}
                  </span>
                  <p className="text-[10.5px] text-ink-500">
                    {r._count.recipeIngredients === 1 ? 'product' : 'products'}
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-wrap gap-1">
                    {banned && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-rose-800">
                        <Ban className="h-2.5 w-2.5" />
                        Banned
                      </span>
                    )}
                    {hasBio && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        BE
                      </span>
                    )}
                    {hasAllergen && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                        Allergen
                      </span>
                    )}
                    {!banned && !hasBio && !hasAllergen && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-400">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Clean
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-[11.5px] text-ink-600">
                  {age != null ? formatAge(age) : '—'}
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <IngredientRowActions
                    ingredientId={r.id}
                    internalName={internalDisplay}
                    existingLabelDeclarationName={r.labelDeclarationName}
                    existingBioengineeredStatus={
                      r.bioengineeredStatus as
                        | 'NOT_APPLICABLE'
                        | 'BIOENGINEERED'
                        | 'DERIVED_FROM_BIOENGINEERED'
                    }
                    source={r.source}
                    status={r.verificationStatus}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sort === 'used' && (
        <p className="border-t border-ink-100 bg-zinc-50/40 px-4 py-2 text-[11px] italic text-ink-500">
          Sort by Most used ranks rows within the current page only. Across pages the underlying order is newest-first.
        </p>
      )}
    </div>
  )
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
  )
}

// -----------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------

function Pagination({
  page,
  totalPages,
  sp,
}: {
  page: number
  totalPages: number
  sp: { q?: string; status?: string; source?: string; sort?: string }
}) {
  if (totalPages <= 1) return null

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    if (sp.q) params.set('q', sp.q)
    if (sp.status) params.set('status', sp.status)
    if (sp.source) params.set('source', sp.source)
    if (sp.sort) params.set('sort', sp.sort)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/ingredients${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
      <span className="text-ink-500">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={buildHref(page - 1)}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {page < totalPages && (
          <Link
            href={buildHref(page + 1)}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------------

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <FlaskConical className="h-5 w-5" />
      </span>
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No ingredients match' : 'No ingredients yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'New entries surface here as partners create them.'}
      </p>
      {filtered && (
        <Link
          href="/ingredients"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Reset filters
        </Link>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function daysAgo(d: Date | null | undefined): number | null {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24))
}

function formatAge(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
