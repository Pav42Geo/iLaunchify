// =============================================================================
// Admin — Facts & label-format templates (LabelFormatRule catalog)
// =============================================================================
//
// Read-only admin surface for roadmap C1: the 20 seed-curated FDA/AAFCO
// label-format presets the creator Studio offers per product type. These are
// editable nowhere here — they're seed data. No actions.ts, no mutations.
//
// Follows the LOCKED v2 surface pattern: cream rounded-3xl hero + 5-card KPI
// strip + URL-driven filter chips + sortable plain <table> + RowActionsMenu +
// Prev/Next paginator. See memory: ilaunchify-admin-surface-pattern.
//
// Query params:
//   ?labelingType=FOOD|DIETARY_SUPPLEMENT|PET_PRODUCT|OTC|COSMETIC
//   ?orientation=VERTICAL|TABULAR|LINEAR|HORIZONTAL
//   ?sort=format|type|cfr|surface|font|score   (default: type)
//   ?dir=asc|desc
//   ?page=1

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import Link from 'next/link'
import {
  FileText,
  Utensils,
  Pill,
  Dog,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Layers,
  Rows3,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LabelFormatRowActions } from './LabelFormatRowActions'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Label templates — Admin' }

const PAGE_SIZE = 50

// -----------------------------------------------------------------------------
// Enum domains + display helpers
// -----------------------------------------------------------------------------

type LabelingType = 'FOOD' | 'DIETARY_SUPPLEMENT' | 'PET_PRODUCT' | 'OTC' | 'COSMETIC'
type Orientation = 'VERTICAL' | 'HORIZONTAL' | 'TABULAR' | 'LINEAR'

const LABELING_TYPES: LabelingType[] = [
  'FOOD',
  'DIETARY_SUPPLEMENT',
  'PET_PRODUCT',
  'OTC',
  'COSMETIC',
]
const ORIENTATIONS: Orientation[] = ['VERTICAL', 'TABULAR', 'LINEAR', 'HORIZONTAL']

function isLabelingType(s: string | undefined): s is LabelingType {
  return !!s && (LABELING_TYPES as string[]).includes(s)
}
function isOrientation(s: string | undefined): s is Orientation {
  return !!s && (ORIENTATIONS as string[]).includes(s)
}

const LABELING_TYPE_META: Record<
  LabelingType,
  { label: string; chip: string; badge: { bg: string; text: string; border: string } }
> = {
  FOOD: {
    label: 'Food',
    chip: 'Nutrition Facts',
    badge: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  },
  DIETARY_SUPPLEMENT: {
    label: 'Supplement',
    chip: 'Supplement Facts',
    badge: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  },
  PET_PRODUCT: {
    label: 'Pet',
    chip: 'AAFCO',
    badge: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  },
  OTC: {
    label: 'OTC',
    chip: 'Drug Facts',
    badge: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  },
  COSMETIC: {
    label: 'Cosmetic',
    chip: 'Cosmetic',
    badge: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  },
}

const ORIENTATION_LABEL: Record<Orientation, string> = {
  VERTICAL: 'Vertical',
  HORIZONTAL: 'Horizontal',
  TABULAR: 'Tabular',
  LINEAR: 'Linear',
}

// FDA_VERTICAL → "FDA Vertical"; AAFCO_PET_FOOD → "AAFCO Pet Food"
const ACRONYMS = new Set(['FDA', 'USDA', 'AAFCO', 'OTC'])
function humanizeFormat(format: string): string {
  return format
    .split('_')
    .map((part) =>
      ACRONYMS.has(part)
        ? part
        : part.charAt(0) + part.slice(1).toLowerCase(),
    )
    .join(' ')
}

type SortKey = 'format' | 'type' | 'cfr' | 'surface' | 'font' | 'score'
function parseSort(s: string | undefined): SortKey {
  const valid: SortKey[] = ['format', 'type', 'cfr', 'surface', 'font', 'score']
  return (valid as string[]).includes(s ?? '') ? (s as SortKey) : 'type'
}
function parseDir(s: string | undefined): 'asc' | 'desc' | 'default' {
  return s === 'asc' ? 'asc' : s === 'desc' ? 'desc' : 'default'
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    labelingType?: string
    orientation?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function LabelFormatsPage({ searchParams }: PageProps) {
  await requireCapability('platform:admin')

  const sp = await searchParams
  const labelingType = isLabelingType(sp.labelingType) ? sp.labelingType : undefined
  const orientation = isOrientation(sp.orientation) ? sp.orientation : undefined
  const sort = parseSort(sp.sort)
  const dirRaw = parseDir(sp.dir)
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)

  const where: Record<string, unknown> = {}
  if (labelingType) where.labelingType = labelingType
  if (orientation) where.panelOrientation = orientation

  const [typeCounts, totalCount, rowsRaw] = await Promise.all([
    prisma.labelFormatRule.groupBy({ by: ['labelingType'], _count: { _all: true } }),
    prisma.labelFormatRule.count({ where: where as never }),
    prisma.labelFormatRule.findMany({
      where: where as never,
      // Default ordering: labelingType, then preferenceScore desc. In-process
      // re-sort handles the explicit column sorts below.
      orderBy: [{ labelingType: 'asc' }, { preferenceScore: 'desc' }],
    }),
  ])

  const typeCountMap = new Map<LabelingType, number>(
    typeCounts.map((c) => [c.labelingType as LabelingType, c._count._all]),
  )
  const totalPresets = [...typeCountMap.values()].reduce((a, b) => a + b, 0)

  // Map Decimal → Number for display + sortable plain rows.
  const rows = rowsRaw.map((r) => ({
    key: `${r.format}~${r.labelingType}`,
    format: r.format as string,
    formatLabel: humanizeFormat(r.format as string),
    labelingType: r.labelingType as LabelingType,
    cfrCitation: r.cfrCitation,
    minSurfaceAreaSqIn: Number(r.minSurfaceAreaSqIn),
    minLabelWidthMm: Number(r.minLabelWidthMm),
    minLabelHeightMm: Number(r.minLabelHeightMm),
    minFontSizePt: Number(r.minFontSizePt),
    minHeaderFontSizePt: Number(r.minHeaderFontSizePt),
    supportsMultiColumn: r.supportsMultiColumn,
    supportsAggregate: r.supportsAggregate,
    supportsDualColumn: r.supportsDualColumn,
    panelOrientation: r.panelOrientation as Orientation,
    preferenceScore: r.preferenceScore,
  }))

  // In-process sort when an explicit column is requested.
  const dir = dirRaw === 'default' ? (sort === 'score' ? 'desc' : 'asc') : dirRaw
  const mul = dir === 'asc' ? 1 : -1
  if (sp.sort) {
    rows.sort((a, b) => {
      switch (sort) {
        case 'format':
          return mul * a.formatLabel.localeCompare(b.formatLabel)
        case 'cfr':
          return mul * a.cfrCitation.localeCompare(b.cfrCitation)
        case 'surface':
          return mul * (a.minSurfaceAreaSqIn - b.minSurfaceAreaSqIn)
        case 'font':
          return mul * (a.minFontSizePt - b.minFontSizePt)
        case 'score':
          return mul * (a.preferenceScore - b.preferenceScore)
        case 'type':
        default:
          return (
            mul * a.labelingType.localeCompare(b.labelingType) ||
            b.preferenceScore - a.preferenceScore
          )
      }
    })
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <Header typeCountMap={typeCountMap} totalPresets={totalPresets} />

      <FilterBar
        labelingType={labelingType}
        orientation={orientation}
        typeCountMap={typeCountMap}
        total={totalCount}
      />

      {pageRows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <LabelFormatsTable rows={pageRows} sort={sort} dir={dir} sortActive={Boolean(sp.sort)} />
          <Paginator
            page={safePage}
            pageCount={pageCount}
            total={rows.length}
            currentParams={sp}
          />
        </>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header + KPI strip
// -----------------------------------------------------------------------------

function Header({
  typeCountMap,
  totalPresets,
}: {
  typeCountMap: Map<LabelingType, number>
  totalPresets: number
}) {
  return (
    <>
      <AdminPageHeader
        eyebrow="Compliance · Label-format presets"
        title="Facts & label-format templates"
        description="The FDA/AAFCO label-format presets (Nutrition / Supplement / Drug / Pet Facts) the Studio offers per product type — CFR citation, size + font minimums, and column capabilities for each."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/label-formats"
          label="Total presets"
          value={totalPresets}
          icon={FileText}
          active
        />
        <KpiCard
          href="/label-formats?labelingType=FOOD"
          label="Food (Nutrition)"
          value={typeCountMap.get('FOOD') ?? 0}
          icon={Utensils}
          tone="emerald"
        />
        <KpiCard
          href="/label-formats?labelingType=DIETARY_SUPPLEMENT"
          label="Supplement"
          value={typeCountMap.get('DIETARY_SUPPLEMENT') ?? 0}
          icon={Pill}
          tone="sky"
        />
        <KpiCard
          href="/label-formats?labelingType=PET_PRODUCT"
          label="Pet (AAFCO)"
          value={typeCountMap.get('PET_PRODUCT') ?? 0}
          icon={Dog}
          tone="amber"
        />
        <KpiCard
          href="/label-formats?labelingType=OTC"
          label="OTC (Drug Facts)"
          value={typeCountMap.get('OTC') ?? 0}
          icon={Stethoscope}
          tone="rose"
        />
      </div>
    </>
  )
}

function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  tone,
  active,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose'
  active?: boolean
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
          <p className="font-display text-[22px] font-bold leading-none text-ink-900 tabular-nums">
            {value}
          </p>
        </div>
      </div>
    </Link>
  )
}

// -----------------------------------------------------------------------------
// Filter chips
// -----------------------------------------------------------------------------

function buildHref(
  current: { labelingType?: string; orientation?: string; sort?: string; dir?: string },
  overrides: Partial<{ labelingType: string; orientation: string; sort: string; dir: string }>,
) {
  const merged = { ...current, ...overrides, page: undefined as string | undefined }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v)
  }
  const qs = params.toString()
  return `/label-formats${qs ? `?${qs}` : ''}`
}

function FilterBar({
  labelingType,
  orientation,
  typeCountMap,
  total,
}: {
  labelingType: LabelingType | undefined
  orientation: Orientation | undefined
  typeCountMap: Map<LabelingType, number>
  total: number
}) {
  const current = { labelingType, orientation }
  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Labeling type
        </span>
        <FilterChip
          href={buildHref(current, { labelingType: '' })}
          active={!labelingType}
          label="All"
          count={null}
        />
        {LABELING_TYPES.map((t) => (
          <FilterChip
            key={t}
            href={buildHref(current, { labelingType: t })}
            active={labelingType === t}
            label={LABELING_TYPE_META[t].label}
            count={typeCountMap.get(t) ?? 0}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Orientation
        </span>
        <FilterChip
          href={buildHref(current, { orientation: '' })}
          active={!orientation}
          label="All"
          count={null}
        />
        {(['VERTICAL', 'TABULAR', 'LINEAR'] as Orientation[]).map((o) => (
          <FilterChip
            key={o}
            href={buildHref(current, { orientation: o })}
            active={orientation === o}
            label={ORIENTATION_LABEL[o]}
            count={null}
          />
        ))}

        <span className="ml-auto text-[12px] text-ink-600">
          {total.toLocaleString()} {total === 1 ? 'preset' : 'presets'}
        </span>
        {(labelingType || orientation) && (
          <Link
            href="/label-formats"
            className="inline-flex h-7 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            Clear
          </Link>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count: number | null
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {label}
      {count !== null && (
        <span className={cn('text-[10.5px] tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>
          {count}
        </span>
      )}
    </Link>
  )
}

// -----------------------------------------------------------------------------
// Table
// -----------------------------------------------------------------------------

interface LabelFormatRow {
  key: string
  format: string
  formatLabel: string
  labelingType: LabelingType
  cfrCitation: string
  minSurfaceAreaSqIn: number
  minLabelWidthMm: number
  minLabelHeightMm: number
  minFontSizePt: number
  minHeaderFontSizePt: number
  supportsMultiColumn: boolean
  supportsAggregate: boolean
  supportsDualColumn: boolean
  panelOrientation: Orientation
  preferenceScore: number
}

function LabelFormatsTable({
  rows,
  sort,
  dir,
  sortActive,
}: {
  rows: LabelFormatRow[]
  sort: SortKey
  dir: 'asc' | 'desc'
  sortActive: boolean
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh col="format" label="Format" sort={sort} dir={dir} active={sortActive} />
            <SortableTh col="type" label="Labeling type" sort={sort} dir={dir} active={sortActive} />
            <SortableTh col="cfr" label="CFR citation" sort={sort} dir={dir} active={sortActive} />
            <Th>Min size</Th>
            <SortableTh col="surface" label="Min surface" sort={sort} dir={dir} active={sortActive} align="right" />
            <SortableTh col="font" label="Min font" sort={sort} dir={dir} active={sortActive} align="right" />
            <Th>Capabilities</Th>
            <Th>Orientation</Th>
            <SortableTh col="score" label="Pref" sort={sort} dir={dir} active={sortActive} align="right" />
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => {
            const meta = LABELING_TYPE_META[r.labelingType]
            return (
              <tr key={r.key} className="transition-colors hover:bg-pink-50/20">
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/label-formats/${encodeURIComponent(r.key)}`}
                    className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {r.formatLabel}
                  </Link>
                  <code className="mt-0.5 inline-block rounded border border-ink-200 bg-zinc-50 px-1.5 py-[1px] font-mono text-[10px] text-ink-500">
                    {r.format}
                  </code>
                </td>
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                      meta.badge.bg,
                      meta.badge.text,
                      meta.badge.border,
                    )}
                  >
                    {meta.chip}
                  </span>
                </td>
                <td className="px-3 py-3 align-top">
                  <code className="font-mono text-[11px] text-ink-700">{r.cfrCitation}</code>
                </td>
                <td className="px-3 py-3 align-top tabular-nums text-ink-700">
                  {r.minLabelWidthMm}×{r.minLabelHeightMm} mm
                </td>
                <td className="px-3 py-3 text-right align-top tabular-nums text-ink-700">
                  {r.minSurfaceAreaSqIn} sq in
                </td>
                <td className="px-3 py-3 text-right align-top tabular-nums text-ink-700">
                  {r.minFontSizePt} pt
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-wrap gap-1">
                    {r.supportsMultiColumn && <CapBadge icon={Columns3} label="Multi-column" />}
                    {r.supportsAggregate && <CapBadge icon={Layers} label="Aggregate" />}
                    {r.supportsDualColumn && <CapBadge icon={Rows3} label="Dual-column" />}
                    {!r.supportsMultiColumn &&
                      !r.supportsAggregate &&
                      !r.supportsDualColumn && <span className="text-ink-300">—</span>}
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-ink-700">
                  {ORIENTATION_LABEL[r.panelOrientation]}
                </td>
                <td className="px-3 py-3 text-right align-top tabular-nums text-ink-700">
                  {r.preferenceScore}
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <LabelFormatRowActions
                    rowKey={r.key}
                    formatLabel={r.formatLabel}
                    cfrCitation={r.cfrCitation}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CapBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-zinc-50 px-1.5 py-[1px] text-[10px] font-medium text-ink-600">
      <Icon className="h-3 w-3 text-ink-400" />
      {label}
    </span>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
}

function SortableTh({
  col,
  label,
  sort,
  dir,
  active,
  align = 'left',
}: {
  col: SortKey
  label: string
  sort: SortKey
  dir: 'asc' | 'desc'
  active: boolean
  align?: 'left' | 'right'
}) {
  const isActive = active && sort === col
  const nextDir = isActive && dir === 'asc' ? 'desc' : 'asc'
  const params = new URLSearchParams({ sort: col, dir: nextDir })
  return (
    <th className={cn('px-3 py-2.5 font-semibold', align === 'right' ? 'text-right' : 'text-left')}>
      <Link
        href={`/label-formats?${params.toString()}`}
        className={cn(
          'inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
          isActive ? 'text-ink-900' : 'hover:text-ink-700',
        )}
      >
        {label}
        <span className="text-[9px]">{isActive ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </Link>
    </th>
  )
}

// -----------------------------------------------------------------------------
// Paginator
// -----------------------------------------------------------------------------

function Paginator({
  page,
  pageCount,
  total,
  currentParams,
}: {
  page: number
  pageCount: number
  total: number
  currentParams: Record<string, string | undefined>
}) {
  const hrefFor = (p: number) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(currentParams)) {
      if (v && k !== 'page') params.set(k, v)
    }
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/label-formats${qs ? `?${qs}` : ''}`
  }
  return (
    <div className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white px-4 py-3 text-[12px] text-ink-600">
      <span className="tabular-nums">
        Page {page} of {pageCount} · {total.toLocaleString()} {total === 1 ? 'preset' : 'presets'}
      </span>
      <div className="flex items-center gap-2">
        <PaginatorLink href={hrefFor(page - 1)} disabled={page <= 1} icon={ChevronLeft} label="Prev" />
        <PaginatorLink
          href={hrefFor(page + 1)}
          disabled={page >= pageCount}
          icon={ChevronRight}
          label="Next"
          iconRight
        />
      </div>
    </div>
  )
}

function PaginatorLink({
  href,
  disabled,
  icon: Icon,
  label,
  iconRight,
}: {
  href: string
  disabled: boolean
  icon: LucideIcon
  label: string
  iconRight?: boolean
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-full border border-ink-100 px-3 text-[12px] font-medium text-ink-300">
        {!iconRight && <Icon className="h-3.5 w-3.5" />}
        {label}
        {iconRight && <Icon className="h-3.5 w-3.5" />}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-1 rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
    >
      {!iconRight && <Icon className="h-3.5 w-3.5" />}
      {label}
      {iconRight && <Icon className="h-3.5 w-3.5" />}
    </Link>
  )
}

// -----------------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <FileText className="h-5 w-5" />
      </span>
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        No label-format presets match
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">Try a different filter combination.</p>
      <Link
        href="/label-formats"
        className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        Reset filters
      </Link>
    </div>
  )
}
