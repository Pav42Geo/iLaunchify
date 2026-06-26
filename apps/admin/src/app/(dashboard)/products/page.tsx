// =============================================================================
// Admin Product review queue — v2 admin surface (task #586, Pavel 2026-06-01)
// =============================================================================
//
// Layout follows the locked admin surface pattern (cream hero band + 5-card
// KPI strip + URL-driven tab + niche chips + secondary dropdown filters +
// sortable wide table + RowActionsMenu).
// See memory: ilaunchify-admin-surface-pattern.md
//
// Query params (parsed in products-data.ts):
//   ?tab=new | pending-edit | needs-changes | published | all
//                    (default "new"; sidebar Inbox links to /products?tab=new)
//   ?q=protein       — search ProductTemplate.name / slug
//   ?niche=keto      — Niche.slug chip filter
//   ?category=…      — Subcategory.slug dropdown
//   ?manufacturer=…  — Partner.id dropdown
//   ?sort=updatedAt|createdAt|name|status|manufacturer  (default updatedAt)
//   ?dir=asc|desc                                        (default desc)
//   ?page=2          — pagination (50 / page)

import Link from 'next/link'
import {
  Package,
  Sparkles,
  Inbox,
  RefreshCcw,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Search,
  ArrowDown,
  ArrowUp,
  Calendar,
  Clock,
  Building2,
  Image as ImageIcon,
  Check,
  PencilRuler,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ProductTemplateStatus } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { ProductRowActions } from './ProductRowActions'
import { marketingUrl } from '@/lib/marketing-url'
import {
  buildProductsHref,
  loadProductsData,
  PRODUCTS_TAB_LABEL,
  PRODUCTS_TAB_ORDER,
  type ParsedFilters,
  type ProductRow,
  type ProductsSortKey,
  type ProductsTab,
  type SortDir,
} from './products-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Products — Admin' }

// -----------------------------------------------------------------------------
// Presentation lookups
// -----------------------------------------------------------------------------

const STATUS_TONE: Record<
  ProductTemplateStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  DRAFT: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
    dot: 'bg-zinc-400',
    label: 'Draft',
  },
  PENDING_REVIEW: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    label: 'Pending review',
  },
  PENDING_EDIT_REVIEW: {
    bg: 'bg-sky-100',
    text: 'text-sky-800',
    border: 'border-sky-200',
    dot: 'bg-sky-500',
    label: 'Edits in review',
  },
  NEEDS_CHANGES: {
    bg: 'bg-rose-100',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    label: 'Needs changes',
  },
  PUBLISHED: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Live',
  },
  PAUSED: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
    dot: 'bg-zinc-400',
    label: 'Paused',
  },
  REJECTED: {
    bg: 'bg-rose-100',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    label: 'Rejected',
  },
  UNDER_REVIEW: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    label: 'Under review',
  },
  ARCHIVED: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
    dot: 'bg-zinc-400',
    label: 'Archived',
  },
}

const TAB_TONE: Record<ProductsTab, { dot: string; bg: string; text: string; border: string }> = {
  new: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200' },
  'pending-edit': { dot: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200' },
  'needs-changes': { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-200' },
  published: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
  all: { dot: 'bg-ink-400', bg: 'bg-zinc-50', text: 'text-ink-700', border: 'border-zinc-200' },
  // Dashed/violet so the read-only ops tab reads as separate from the queue.
  drafts: { dot: 'bg-violet-400', bg: 'bg-violet-50', text: 'text-violet-900', border: 'border-violet-200' },
}

const DRAFT_STEP_LABEL: Record<
  'recipe' | 'production' | 'packaging' | 'pricing' | 'media',
  string
> = {
  recipe: 'Recipe',
  production: 'Production',
  packaging: 'Packaging',
  pricing: 'Pricing',
  media: 'Media',
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    tab?: string
    niche?: string
    category?: string
    manufacturer?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function AdminProductsListPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const data = await loadProductsData(sp)

  return (
    <div className="space-y-6">
      <Header kpis={data.kpis} filters={data.filters} />

      <FilterBar
        filters={data.filters}
        tabCounts={data.tabCounts}
        nicheCounts={data.nicheCounts}
        categoryOptions={data.categoryOptions}
        manufacturerOptions={data.manufacturerOptions}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState
          draftsTab={data.filters.tab === 'drafts'}
          filtered={Boolean(
            data.filters.q ||
              data.filters.niche ||
              data.filters.category ||
              data.filters.manufacturer ||
              data.filters.tab !== 'new',
          )}
        />
      ) : data.filters.tab === 'drafts' ? (
        <DraftsTable rows={data.rows} />
      ) : (
        <ProductsTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// Header (cream band) + 5-card KPI strip
// =============================================================================

function Header({
  kpis,
  filters,
}: {
  kpis: {
    newSubmissions: number
    pendingEditReview: number
    needsChanges: number
    published: number
    rejected90d: number
  }
  filters: ParsedFilters
}) {
  void filters // reserved for future "active tab" KPI highlighting
  return (
    <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Products & Categories · Admin queue
          </p>
          <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Product approvals
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
            Review submissions, monitor catalog health, and supervise marketplace placement.
          </p>
        </div>
      </div>

      {/* KPI strip — 5 cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href={buildProductsHref(
            { ...filters, page: 1 },
            { tab: 'new', niche: '', category: '', manufacturer: '', q: '' },
          )}
          label="New submissions"
          value={kpis.newSubmissions}
          icon={Inbox}
          tone="pink"
          active={filters.tab === 'new'}
        />
        <KpiCard
          href={buildProductsHref(
            { ...filters, page: 1 },
            { tab: 'pending-edit', niche: '', category: '', manufacturer: '', q: '' },
          )}
          label="Pending edit re-review"
          value={kpis.pendingEditReview}
          icon={RefreshCcw}
          tone="sky"
          active={filters.tab === 'pending-edit'}
        />
        <KpiCard
          href={buildProductsHref(
            { ...filters, page: 1 },
            { tab: 'needs-changes', niche: '', category: '', manufacturer: '', q: '' },
          )}
          label="Needs changes"
          value={kpis.needsChanges}
          icon={AlertTriangle}
          tone="amber"
          active={filters.tab === 'needs-changes'}
        />
        <KpiCard
          href={buildProductsHref(
            { ...filters, page: 1 },
            { tab: 'published', niche: '', category: '', manufacturer: '', q: '' },
          )}
          label="Published"
          value={kpis.published}
          icon={CheckCircle2}
          tone="emerald"
          active={filters.tab === 'published'}
        />
        <KpiCard
          href="/products?tab=all&sort=updatedAt&dir=desc"
          label="Rejected · 90d"
          value={kpis.rejected90d}
          icon={Ban}
          tone="rose"
          subline="Last 90 days"
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
  tone?: 'amber' | 'emerald' | 'sky' | 'rose' | 'pink'
  active?: boolean
  subline?: string
}) {
  const ring: Record<NonNullable<typeof tone>, string> = {
    amber: 'group-hover:ring-amber-300/60',
    emerald: 'group-hover:ring-emerald-300/60',
    sky: 'group-hover:ring-sky-300/60',
    rose: 'group-hover:ring-rose-300/60',
    pink: 'group-hover:ring-pink-300/60',
  }
  const iconTone: Record<NonNullable<typeof tone>, string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    rose: 'bg-rose-100 text-rose-700',
    pink: 'bg-pink-100 text-pink-700',
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
            {value.toLocaleString()}
          </p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// =============================================================================
// FilterBar — search + tab chips + niche chips + dropdowns
// =============================================================================

function FilterBar({
  filters,
  tabCounts,
  nicheCounts,
  categoryOptions,
  manufacturerOptions,
  totalFiltered,
}: {
  filters: ParsedFilters
  tabCounts: Record<ProductsTab, number>
  nicheCounts: import('./products-data').NicheOption[]
  categoryOptions: import('./products-data').CategoryOption[]
  manufacturerOptions: import('./products-data').ManufacturerOption[]
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(
    filters.q || filters.niche || filters.category || filters.manufacturer || filters.tab !== 'new',
  )

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      {/* Search + dropdowns row */}
      <form className="flex flex-wrap items-center gap-2" method="GET">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search product name or slug…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>

        {/* Subcategory dropdown */}
        <select
          name="category"
          defaultValue={filters.category ?? ''}
          aria-label="Subcategory filter"
          className="h-9 max-w-[200px] rounded-lg border border-ink-200 bg-white px-2 text-[12.5px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        >
          <option value="">All categories</option>
          {categoryOptions.map((sc) => (
            <option key={sc.slug} value={sc.slug}>
              {sc.categoryName} · {sc.name} ({sc.count})
            </option>
          ))}
        </select>

        {/* Manufacturer dropdown */}
        <select
          name="manufacturer"
          defaultValue={filters.manufacturer ?? ''}
          aria-label="Manufacturer filter"
          className="h-9 max-w-[200px] rounded-lg border border-ink-200 bg-white px-2 text-[12.5px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        >
          <option value="">All manufacturers</option>
          {manufacturerOptions.map((m) => (
            <option key={m.partnerId} value={m.partnerId}>
              {m.companyName} ({m.count})
            </option>
          ))}
        </select>

        {/* Preserve other filters across search submit */}
        {filters.tab !== 'new' && <input type="hidden" name="tab" value={filters.tab} />}
        {filters.niche && <input type="hidden" name="niche" value={filters.niche} />}
        {filters.sort !== 'updatedAt' && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.dir !== 'desc' && <input type="hidden" name="dir" value={filters.dir} />}

        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Apply
        </button>
        {hasAnyFilter && (
          <Link
            href="/products"
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Clear
          </Link>
        )}

        <div className="ml-auto text-[12px] text-ink-600">
          <span className="hidden md:inline">{totalFiltered.toLocaleString()} results</span>
        </div>
      </form>

      {/* Tab chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Status
        </span>
        {PRODUCTS_TAB_ORDER.map((tab) => (
          <FilterChip
            key={tab}
            href={buildProductsHref(filters, { tab, page: 1 })}
            active={filters.tab === tab}
            label={PRODUCTS_TAB_LABEL[tab]}
            count={tabCounts[tab]}
            tone={TAB_TONE[tab]}
          />
        ))}
      </div>

      {/* Niche chips */}
      {nicheCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
            Niche
          </span>
          <FilterChip
            href={buildProductsHref(filters, { niche: '', page: 1 })}
            active={!filters.niche}
            label="All niches"
            count={null}
          />
          {nicheCounts.map((n) => (
            <FilterChip
              key={n.slug}
              href={buildProductsHref(filters, { niche: n.slug, page: 1 })}
              active={filters.niche === n.slug}
              label={n.name}
              emoji={n.iconEmoji}
              count={n.count}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  href,
  active,
  label,
  count,
  tone,
  emoji,
}: {
  href: string
  active: boolean
  label: string
  count: number | null
  tone?: { bg: string; text: string; border: string; dot: string }
  emoji?: string | null
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
      {emoji && (
        <span aria-hidden="true" className="text-[13px] leading-none">
          {emoji}
        </span>
      )}
      {tone && !active && <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />}
      {label}
      {count !== null && (
        <span
          className={cn(
            'text-[10.5px] tabular-nums',
            active ? 'text-white/70' : 'text-ink-500',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

// =============================================================================
// Table
// =============================================================================

function ProductsTable({
  rows,
  filters,
}: {
  rows: ProductRow[]
  filters: ParsedFilters
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh sortKey="name" filters={filters}>
              Product
            </SortableTh>
            <SortableTh sortKey="manufacturer" filters={filters}>
              Manufacturer
            </SortableTh>
            <Th>Category</Th>
            <Th>Niches</Th>
            <SortableTh sortKey="status" filters={filters}>
              Status
            </SortableTh>
            <SortableTh sortKey="updatedAt" filters={filters} className="text-right">
              Updated
            </SortableTh>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((p) => {
            const tone = STATUS_TONE[p.status]!
            const marketplaceHref =
              p.status === 'PUBLISHED'
                ? marketingUrl(
                    `/marketplace/${p.subcategory.category.slug}/${p.subcategory.slug}/${p.slug}`,
                  )
                : null
            const visibleNiches = p.niches.slice(0, 3)
            const overflow = p.niches.length - visibleNiches.length

            return (
              <tr key={p.id} className="transition-colors hover:bg-pink-50/20">
                {/* Product cell — thumb + name + slug, clickable to detail */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/products/${p.id}`}
                    className="group/cell flex items-start gap-2.5 focus-visible:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink-200',
                        p.imageAssetId
                          ? 'bg-zinc-50 text-pink-600'
                          : 'bg-pink-50 text-pink-500',
                      )}
                    >
                      {p.imageAssetId ? (
                        <ImageIcon className="h-3 w-3" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900 group-hover/cell:text-pink-700 group-focus-visible/cell:underline">
                        {p.name}
                      </p>
                      <p className="mt-0.5 truncate text-[10.5px] text-ink-500">{p.slug}</p>
                    </div>
                  </Link>
                </td>

                {/* Manufacturer */}
                <td className="px-3 py-3 align-top">
                  {p.manufacturer ? (
                    <Link
                      href={`/partners/${p.manufacturer.partnerId}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-ink-700 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                    >
                      <Building2 className="h-3 w-3 text-ink-400" />
                      <span className="truncate max-w-[140px]">
                        {p.manufacturer.companyName}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </td>

                {/* Category — subcategory name with category underneath */}
                <td className="px-3 py-3 align-top">
                  <p className="text-[12px] font-medium text-ink-800">
                    {p.subcategory.name}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-ink-500">
                    {p.subcategory.category.name}
                  </p>
                </td>

                {/* Niches */}
                <td className="px-3 py-3 align-top">
                  {visibleNiches.length === 0 ? (
                    <span className="text-[11px] text-ink-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {visibleNiches.map((n) => (
                        <span
                          key={n.slug}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium',
                            n.isPrimary
                              ? 'border-pink-200 bg-pink-50 text-pink-700'
                              : 'border-ink-100 bg-zinc-50 text-ink-700',
                          )}
                        >
                          {n.iconEmoji && (
                            <span aria-hidden="true" className="text-[11px] leading-none">
                              {n.iconEmoji}
                            </span>
                          )}
                          {n.name}
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span className="inline-flex items-center rounded-full border border-ink-100 bg-zinc-50 px-2 py-0.5 text-[10.5px] font-medium text-ink-700">
                          +{overflow}
                        </span>
                      )}
                    </div>
                  )}
                </td>

                {/* Status pill */}
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                      tone.bg,
                      tone.text,
                      tone.border,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {tone.label}
                  </span>
                </td>

                {/* Updated */}
                <td className="px-3 py-3 text-right align-top">
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
                    title={p.updatedAt.toLocaleString()}
                  >
                    <Clock className="h-3 w-3 text-ink-400" />
                    {formatRelative(p.updatedAt)}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-3 py-3 text-right align-top">
                  <ProductRowActions
                    productId={p.id}
                    productName={p.name}
                    slug={p.slug}
                    partnerId={p.manufacturer?.partnerId ?? null}
                    marketplaceUrl={marketplaceHref}
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

function Th({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
}

// =============================================================================
// DraftsTable — read-only "In progress" ops view. No row actions: a draft is
// the partner's unsubmitted work, so there's nothing to approve. The Build
// progress column derives section completion + the stall point from data.
// =============================================================================

const DRAFT_SECTIONS = ['recipe', 'production', 'packaging', 'pricing', 'media'] as const

function DraftsTable({ rows }: { rows: ProductRow[] }) {
  return (
    <div className="space-y-3">
      {/* Read-only ops banner — visually separate from the action queue. */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 px-4 py-3">
        <PencilRuler className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
        <p className="text-[12px] leading-relaxed text-violet-900">
          <span className="font-semibold">In-progress builds — read-only.</span> Partners
          haven&rsquo;t submitted these yet, so there&rsquo;s nothing to approve. Use this to spot
          where builds stall — the <span className="font-medium">Stalled at</span> chip marks the
          first empty step — and reach out to partners who need a hand.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
            <tr>
              <Th>Product</Th>
              <Th>Manufacturer</Th>
              <Th>Build progress</Th>
              <Th className="text-right">Last edited</Th>
              <Th className="text-right">Started</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((p) => {
              const prog = p.progress
              return (
                <tr key={p.id} className="transition-colors hover:bg-violet-50/20">
                  {/* Product — links to the read-only review snapshot */}
                  <td className="px-3 py-3 align-top">
                    <Link
                      href={`/products/${p.id}`}
                      className="group/cell flex items-start gap-2.5 focus-visible:outline-none"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink-200',
                          p.imageAssetId
                            ? 'bg-zinc-50 text-violet-600'
                            : 'bg-violet-50 text-violet-500',
                        )}
                      >
                        {p.imageAssetId ? (
                          <ImageIcon className="h-3 w-3" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900 group-hover/cell:text-violet-700 group-focus-visible/cell:underline">
                          {p.name}
                        </p>
                        <p className="mt-0.5 truncate text-[10.5px] text-ink-500">{p.slug}</p>
                      </div>
                    </Link>
                  </td>

                  {/* Manufacturer */}
                  <td className="px-3 py-3 align-top">
                    {p.manufacturer ? (
                      <Link
                        href={`/partners/${p.manufacturer.partnerId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-ink-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                      >
                        <Building2 className="h-3 w-3 text-ink-400" />
                        <span className="truncate max-w-[140px]">{p.manufacturer.companyName}</span>
                      </Link>
                    ) : (
                      <span className="text-[11px] text-ink-400">—</span>
                    )}
                  </td>

                  {/* Build progress — section chips + count + stall hint */}
                  <td className="px-3 py-3 align-top">
                    {prog ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {DRAFT_SECTIONS.map((k) => (
                            <span
                              key={k}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                                prog[k]
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-ink-200 bg-zinc-50 text-ink-400',
                              )}
                            >
                              {prog[k] ? (
                                <Check className="h-2.5 w-2.5" aria-hidden="true" />
                              ) : (
                                <span className="h-2 w-2 rounded-full border border-dashed border-ink-300" />
                              )}
                              {DRAFT_STEP_LABEL[k]}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10.5px] tabular-nums text-ink-500">
                            {prog.done}/{prog.total} sections
                          </span>
                          {prog.stalledAt ? (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                              Stalled at {DRAFT_STEP_LABEL[prog.stalledAt]}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                              All filled · not submitted
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-400">—</span>
                    )}
                  </td>

                  {/* Last edited */}
                  <td className="px-3 py-3 text-right align-top">
                    <span
                      className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
                      title={p.updatedAt.toLocaleString()}
                    >
                      <Clock className="h-3 w-3 text-ink-400" />
                      {formatRelative(p.updatedAt)}
                    </span>
                  </td>

                  {/* Started */}
                  <td className="px-3 py-3 text-right align-top">
                    <span className="text-[11.5px] text-ink-500" title={p.createdAt.toLocaleString()}>
                      {formatRelative(p.createdAt)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SortableTh({
  sortKey,
  filters,
  children,
  className,
}: {
  sortKey: ProductsSortKey
  filters: ParsedFilters
  children: React.ReactNode
  className?: string
}) {
  const isActive = filters.sort === sortKey
  // Clicking an already-active column flips direction; clicking a new column
  // defaults to desc for dates and asc for names/status/manufacturer.
  const isDescDefault = sortKey === 'createdAt' || sortKey === 'updatedAt'
  const nextDir: SortDir = isActive
    ? filters.dir === 'desc'
      ? 'asc'
      : 'desc'
    : isDescDefault
      ? 'desc'
      : 'asc'
  const href = buildProductsHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
  const ArrowIcon = isActive ? (filters.dir === 'asc' ? ArrowUp : ArrowDown) : null
  return (
    <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
          isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800',
        )}
      >
        {children}
        {ArrowIcon && <ArrowIcon className="h-3 w-3" />}
      </Link>
    </th>
  )
}

// =============================================================================
// Pagination
// =============================================================================

function Pagination({
  filters,
  totalPages,
}: {
  filters: ParsedFilters
  totalPages: number
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
      <span className="text-ink-500">
        Page {filters.page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {filters.page > 1 && (
          <Link
            href={buildProductsHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildProductsHref(filters, { page: filters.page + 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyState({ filtered, draftsTab }: { filtered: boolean; draftsTab?: boolean }) {
  const title = draftsTab
    ? 'No drafts in progress'
    : filtered
      ? 'No products match'
      : 'No new submissions'
  const body = draftsTab
    ? 'When partners start building products, their unsubmitted drafts show up here so you can see where they stall.'
    : filtered
      ? 'Try a different filter combination — or jump to the "All" tab to see everything.'
      : 'Once partners start submitting ProductTemplates, they will show up here.'
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <Package className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 text-[12.5px] text-ink-500">{body}</p>
      {filtered && (
        <Link
          href="/products"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Reset filters
        </Link>
      )}
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 30 * 86400) return `${Math.floor(diff / (7 * 86400))}w ago`
  if (diff < 365 * 86400) return `${Math.floor(diff / (30 * 86400))}mo ago`
  return `${Math.floor(diff / (365 * 86400))}y ago`
}

// Ensure Calendar import is treated as used (we reference it from imports for
// parity with sibling list pages even though formatRelative covers display).
void Calendar
