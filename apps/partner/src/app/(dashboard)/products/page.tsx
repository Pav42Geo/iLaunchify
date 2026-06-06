// Partner products list — every ProductTemplate owned by this partner.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4 + #130.
//
// Partner-v2 surface (Pavel 2026-06-05): same chrome family as the admin v2
// pattern — cream rounded-3xl hero band, KPI strip, URL-driven status chips,
// sortable plain <table>. REFERENCE PAGE for the partner-app restyle sweep.
// Differences from admin on purpose: black-pill primary CTA (design system),
// no paginator (partner catalogs are small; add at 50+ rows).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import {
  Plus,
  Package,
  AlertTriangle,
  FileEdit,
  Hourglass,
  Radio,
  ShieldAlert,
  ArrowUpDown,
  type LucideIcon,
} from 'lucide-react'
import type { ProductTemplateStatus } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Products — iLaunchify Partners' }

// -----------------------------------------------------------------------------
// Status vocabulary — chips + pills share it
// -----------------------------------------------------------------------------

const STATUS_PILL: Partial<Record<ProductTemplateStatus, { label: string; cls: string }>> = {
  PUBLISHED: { label: 'Live', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  PENDING_REVIEW: { label: 'In review', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  PENDING_EDIT_REVIEW: { label: 'Edits in review', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  NEEDS_CHANGES: { label: 'Needs changes', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  DRAFT: { label: 'Draft', cls: 'border-ink-200 bg-zinc-100 text-ink-700' },
  PAUSED: { label: 'Paused', cls: 'border-ink-200 bg-zinc-100 text-ink-700' },
  REJECTED: { label: 'Archived', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
  UNDER_REVIEW: { label: 'In review', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  ARCHIVED: { label: 'Archived', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
}

type Tab = 'all' | 'needs-changes' | 'drafts' | 'in-review' | 'live' | 'paused' | 'archived'

const TAB_STATUSES: Record<Exclude<Tab, 'all'>, ProductTemplateStatus[]> = {
  'needs-changes': ['NEEDS_CHANGES'],
  drafts: ['DRAFT'],
  'in-review': ['PENDING_REVIEW', 'PENDING_EDIT_REVIEW', 'UNDER_REVIEW'],
  live: ['PUBLISHED'],
  paused: ['PAUSED'],
  archived: ['REJECTED', 'ARCHIVED'],
}

const TAB_LABEL: Record<Tab, string> = {
  all: 'All',
  'needs-changes': 'Needs changes',
  drafts: 'Drafts',
  'in-review': 'In review',
  live: 'Live',
  paused: 'Paused',
  archived: 'Archived',
}

type SortKey = 'updated' | 'name' | 'price'

function isTab(s: string | undefined): s is Tab {
  return !!s && s in TAB_LABEL
}

function buildHref(params: { tab?: Tab; sort?: SortKey; dir?: 'asc' | 'desc' }): string {
  const q = new URLSearchParams()
  if (params.tab && params.tab !== 'all') q.set('tab', params.tab)
  if (params.sort && params.sort !== 'updated') q.set('sort', params.sort)
  if (params.dir && params.dir !== 'desc') q.set('dir', params.dir)
  const s = q.toString()
  return s ? `/products?${s}` : '/products'
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

type Row = {
  id: string
  name: string
  status: ProductTemplateStatus
  subcategory: { name: string }
  priceFloorCents: number
  updatedAt: Date
  certRefreshNeededAt: Date | null
  _count: { ingredientSlots: number; packagingSystems: number; variants: number }
}

export default async function ProductsListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string }>
}) {
  const sp = await searchParams
  const tab: Tab = isTab(sp.tab) ? sp.tab : 'all'
  const sort: SortKey = sp.sort === 'name' || sp.sort === 'price' ? sp.sort : 'updated'
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc'

  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: { where: { type: 'MANUFACTURING' }, select: { id: true } } },
  })
  if (!partner) return null

  const serviceIds = partner.services.map((s) => s.id)
  const templates: Row[] = serviceIds.length
    ? await prisma.productTemplate.findMany({
        where: { manufacturerServiceId: { in: serviceIds } },
        include: {
          subcategory: { select: { name: true } },
          _count: { select: { ingredientSlots: true, packagingSystems: true, variants: true } },
        },
        orderBy: { updatedAt: 'desc' },
      })
    : []

  // KPI + chip counts always reflect the FULL set; only the table obeys the tab.
  const countFor = (t: Exclude<Tab, 'all'>) =>
    templates.filter((r) => TAB_STATUSES[t].includes(r.status)).length
  const certRefresh = templates.filter((r) => r.certRefreshNeededAt).length

  const visible = (
    tab === 'all' ? templates : templates.filter((r) => TAB_STATUSES[tab].includes(r.status))
  ).slice()
  visible.sort((a, b) => {
    const flip = dir === 'asc' ? 1 : -1
    if (sort === 'name') return a.name.localeCompare(b.name) * flip
    if (sort === 'price') return (a.priceFloorCents - b.priceFloorCents) * flip
    return (a.updatedAt.getTime() - b.updatedAt.getTime()) * flip
  })

  return (
    <div className="space-y-6">
      {/* Hero — cream band + KPI strip (partner-v2 chrome) */}
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              Manufacturing · Products
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Products
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
              Templates you offer. Live templates appear in the creator marketplace and can be
              customized + ordered.
            </p>
          </div>
          <Link
            href="/products/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> New product
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi
            href={buildHref({ tab: 'needs-changes' })}
            label="Needs changes"
            value={countFor('needs-changes')}
            icon={AlertTriangle}
            tone="amber"
            active={tab === 'needs-changes'}
          />
          <Kpi
            href={buildHref({ tab: 'drafts' })}
            label="Drafts"
            value={countFor('drafts')}
            icon={FileEdit}
            tone="ink"
            active={tab === 'drafts'}
          />
          <Kpi
            href={buildHref({ tab: 'in-review' })}
            label="In review"
            value={countFor('in-review')}
            icon={Hourglass}
            tone="sky"
            active={tab === 'in-review'}
          />
          <Kpi
            href={buildHref({ tab: 'live' })}
            label="Live"
            value={countFor('live')}
            icon={Radio}
            tone="pink"
            active={tab === 'live'}
          />
          <Kpi
            href="/certifications"
            label="Cert refresh needed"
            value={certRefresh}
            icon={ShieldAlert}
            tone="amber"
          />
        </div>
      </div>

      {/* Status chips — URL-driven */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => {
          const count =
            t === 'all' ? templates.length : countFor(t as Exclude<Tab, 'all'>)
          if (t !== 'all' && count === 0 && tab !== t) return null
          return (
            <Link
              key={t}
              href={buildHref({ tab: t, sort, dir })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                tab === t
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
              )}
            >
              {TAB_LABEL[t]}
              <span className={cn('tabular-nums', tab === t ? 'text-white/70' : 'text-ink-400')}>
                {count}
              </span>
            </Link>
          )
        })}
      </div>

      {/* Table */}
      {templates.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[10.5px] uppercase tracking-wider text-ink-500">
                  <SortableTh label="Name" k="name" sort={sort} dir={dir} tab={tab} className="px-5" />
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Subcategory</th>
                  <th className="px-3 py-2.5 font-semibold">Recipe</th>
                  <SortableTh label="Base price" k="price" sort={sort} dir={dir} tab={tab} />
                  <SortableTh label="Updated" k="updated" sort={sort} dir={dir} tab={tab} />
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-[12px] text-ink-500">
                      Nothing in “{TAB_LABEL[tab]}”.
                    </td>
                  </tr>
                )}
                {visible.map((r) => {
                  const pill = STATUS_PILL[r.status] ?? {
                    label: r.status,
                    cls: 'border-ink-200 bg-zinc-100 text-ink-700',
                  }
                  return (
                    <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-zinc-50/60">
                      <td className="px-5 py-3 font-medium text-ink-900">
                        {r.name}
                        {r.certRefreshNeededAt && (
                          <Link
                            href="/certifications"
                            title="A certificate attached to this product expired — renew it to restore the badge."
                            className="ml-2 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 hover:bg-rose-100"
                          >
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Cert refresh
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                            pill.cls,
                          )}
                        >
                          {pill.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-ink-700">{r.subcategory.name}</td>
                      <td className="px-3 py-3 text-[12px] tabular-nums text-ink-600">
                        {r._count.ingredientSlots} slots · {r._count.packagingSystems} pkg ·{' '}
                        {r._count.variants} var
                      </td>
                      <td className="px-3 py-3 tabular-nums text-ink-700">
                        ${(r.priceFloorCents / 100).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                        {new Date(r.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/products/${r.id}/edit`}
                          className="text-[13px] font-medium text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                        >
                          Edit →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Chrome primitives (local — partner-v2 reference)
// -----------------------------------------------------------------------------

function Kpi({
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
  tone: 'ink' | 'sky' | 'pink' | 'amber'
  active?: boolean
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    sky: 'bg-sky-100 text-sky-700',
    pink: 'bg-pink-100 text-pink-700',
    amber: 'bg-amber-100 text-amber-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        active && 'ring-1 ring-pink-300/60',
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </Link>
  )
}

function SortableTh({
  label,
  k,
  sort,
  dir,
  tab,
  className,
}: {
  label: string
  k: SortKey
  sort: SortKey
  dir: 'asc' | 'desc'
  tab: Tab
  className?: string
}) {
  const isActive = sort === k
  const nextDir = isActive && dir === 'desc' ? 'asc' : 'desc'
  return (
    <th className={cn('px-3 py-2.5 font-semibold', className)}>
      <Link
        href={buildHref({ tab, sort: k, dir: nextDir })}
        className={cn(
          'inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
          isActive ? 'text-ink-900' : 'hover:text-ink-700',
        )}
      >
        {label}
        <ArrowUpDown className={cn('h-3 w-3', isActive ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
      </Link>
    </th>
  )
}

function EmptyState() {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
        <Package className="h-6 w-6 text-pink-700" aria-hidden="true" />
      </div>
      <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">No products yet</h2>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
        A 4-step stepper walks you through your first product — what it is, what&apos;s in it, how
        it ships, and what it costs. Save as a draft and refine; admin only reviews when you
        click Submit.
      </p>
      <Link
        href="/products/new"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Create your first
      </Link>
    </section>
  )
}
