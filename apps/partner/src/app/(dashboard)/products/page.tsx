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
import { cn, ViewToggle, type ViewMode } from '@ilaunchify/ui'
import {
  Plus,
  Package,
  AlertTriangle,
  FileEdit,
  Hourglass,
  Radio,
  ShieldAlert,
  ArrowUpDown,
  Eye,
  Pencil,
  LifeBuoy,
  Coffee,
  Leaf,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import type { ProductTemplateStatus } from '@ilaunchify/db'
import { ProductRowActions } from './ProductRowActions'
import { SelectionProvider, SelectAllCheckbox, RowCheckbox } from './ProductSelection'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'
import { LiveToggle } from './LiveToggle'

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
  DRAFT: { label: 'Draft', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
  PAUSED: { label: 'Paused', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
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

function buildHref(params: { tab?: Tab; sort?: SortKey; dir?: 'asc' | 'desc'; view?: ViewMode }): string {
  const q = new URLSearchParams()
  if (params.tab && params.tab !== 'all') q.set('tab', params.tab)
  if (params.sort && params.sort !== 'updated') q.set('sort', params.sort)
  if (params.dir && params.dir !== 'desc') q.set('dir', params.dir)
  if (params.view === 'table') q.set('view', params.view)
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
  imageAssetId: string | null
  _count: { ingredientSlots: number; packagingSystems: number; variants: number }
}

export default async function ProductsListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string; view?: string }>
}) {
  const sp = await searchParams
  const tab: Tab = isTab(sp.tab) ? sp.tab : 'all'
  const sort: SortKey = sp.sort === 'name' || sp.sort === 'price' ? sp.sort : 'updated'
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc'
  const view: ViewMode = sp.view === 'table' ? 'table' : 'cards' // Partner default: cards (mirror creator)

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

  // Resolve hero thumbnails (Asset id → URL) for the name cell.
  const heroUrls = await resolveCertBadgeUrls(templates.map((r) => r.imageAssetId))

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
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
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

      {/* Status chips — URL-driven — + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => {
            const count =
              t === 'all' ? templates.length : countFor(t as Exclude<Tab, 'all'>)
            if (t !== 'all' && count === 0 && tab !== t) return null
            return (
              <Link
                key={t}
                href={buildHref({ tab: t, sort, dir, view })}
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
        <ViewToggle value={view} defaultMode="cards" />
      </div>

      {/* Table / cards */}
      {templates.length === 0 ? (
        <EmptyState />
      ) : view === 'cards' ? (
        <ProductCards rows={visible} tabLabel={TAB_LABEL[tab]} heroUrls={heroUrls} />
      ) : (
        <SelectionProvider allIds={visible.map((r) => r.id)} rows={visible.map((r) => ({ id: r.id, name: r.name, status: r.status }))}>
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="pl-5 pr-2 py-2.5 w-8"><SelectAllCheckbox /></th>
                  <SortableTh label="Name" k="name" sort={sort} dir={dir} tab={tab} className="px-3" />
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
                    <td colSpan={8} className="px-5 py-8 text-center text-[12px] text-ink-500">
                      Nothing in “{TAB_LABEL[tab]}”.
                    </td>
                  </tr>
                )}
                {visible.map((r) => {
                  const pill = STATUS_PILL[r.status] ?? {
                    label: r.status,
                    cls: 'border-ink-200 bg-ink-100 text-ink-700',
                  }
                  return (
                    <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                      <td className="pl-5 pr-2 py-3 align-middle"><RowCheckbox id={r.id} /></td>
                      <td className="px-3 py-3 font-medium text-ink-900">
                        <div className="flex items-center gap-3">
                          {r.imageAssetId && heroUrls.get(r.imageAssetId) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={heroUrls.get(r.imageAssetId)!}
                              alt=""
                              className="h-9 w-9 flex-none rounded-lg object-cover ring-1 ring-ink-100"
                            />
                          ) : (
                            <span className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-lg bg-pink-50 text-[11px] font-bold uppercase text-pink-700 ring-1 ring-ink-100">
                              {r.name.slice(0, 2)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/products/${r.id}/preview`}
                                className="truncate rounded text-ink-900 hover:text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                              >
                                {r.name}
                              </Link>
                              {r.certRefreshNeededAt && (
                                <Link
                                  href="/certifications"
                                  title="A certificate attached to this product expired — renew it to restore the badge."
                                  className="inline-flex flex-none items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 hover:bg-rose-100"
                                >
                                  <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Cert refresh
                                </Link>
                              )}
                            </div>
                            <div className="font-mono text-[10.5px] text-ink-400">{r.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {r.status === 'PUBLISHED' || r.status === 'PAUSED' ? (
                          <LiveToggle id={r.id} name={r.name} status={r.status} />
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                              pill.cls,
                            )}
                          >
                            {pill.label}
                          </span>
                        )}
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
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end">
                          <ProductRowActions
                            id={r.id}
                            name={r.name}
                            status={r.status}
                            certRefreshNeeded={!!r.certRefreshNeededAt}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        </SelectionProvider>
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
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
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

// -----------------------------------------------------------------------------
// Card view (?view=cards)
// -----------------------------------------------------------------------------

function ProductCards({
  rows,
  tabLabel,
  heroUrls,
}: {
  rows: Row[]
  tabLabel: string
  heroUrls: Map<string, string>
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-ink-200 bg-white px-6 py-8 text-center text-[12px] text-ink-500">
        Nothing in “{tabLabel}”.
      </section>
    )
  }
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <PartnerProductCard key={r.id} r={r} heroUrls={heroUrls} />
      ))}
    </div>
  )
}

const AUTHORING_STATUSES = new Set<ProductTemplateStatus>(['DRAFT', 'NEEDS_CHANGES'])

// Rich product card mirroring the creator card chrome: cream header band
// (status + price), a body with thumbnail + meta, and a footer action rail with
// a status-aware primary action and the contextual "Get product support" entry.
function PartnerProductCard({ r, heroUrls }: { r: Row; heroUrls: Map<string, string> }) {
  const pill = STATUS_PILL[r.status] ?? { label: r.status, cls: 'border-ink-200 bg-ink-100 text-ink-700' }
  const authoring = AUTHORING_STATUSES.has(r.status)
  const imageUrl = r.imageAssetId ? heroUrls.get(r.imageAssetId) : undefined

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-ink-200 bg-cream px-4 py-2.5 text-[12px] text-ink-700">
        {r.status === 'PUBLISHED' || r.status === 'PAUSED' ? (
          <LiveToggle id={r.id} name={r.name} status={r.status} />
        ) : (
          <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', pill.cls)}>
            {pill.label}
          </span>
        )}
        <span className="ml-auto font-display text-[15px] font-bold tabular-nums text-ink-900">
          ${(r.priceFloorCents / 100).toFixed(2)}
        </span>
      </header>

      <div className="flex items-start gap-4 px-4 pb-3 pt-4">
        <CardThumb name={r.name} imageUrl={imageUrl} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/products/${r.id}/preview`}
            className="block truncate rounded text-[15px] font-medium leading-tight text-ink-900 hover:text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            {r.name}
          </Link>
          <div className="mt-0.5 text-[12.5px] text-ink-500">{r.subcategory.name}</div>
          <div className="mt-1 text-[11.5px] tabular-nums text-ink-500">
            {r._count.ingredientSlots} slots · {r._count.packagingSystems} pkg · {r._count.variants} var
          </div>
          {r.certRefreshNeededAt && (
            <Link
              href="/certifications"
              className="mt-2 inline-flex w-fit items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 hover:bg-rose-100"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Cert refresh
            </Link>
          )}
        </div>
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-200 bg-[#FBFAF7] px-4 py-2.5 text-[12px]">
        {authoring ? (
          <ProductActionLink href={`/products/new?draft=${r.id}`} icon={Pencil}>
            Edit product
          </ProductActionLink>
        ) : (
          <ProductActionLink href={`/products/${r.id}/preview`} icon={Eye}>
            Preview
          </ProductActionLink>
        )}
        <ProductSep />
        <ProductActionLink href={`/help/new?productId=${r.id}`} icon={LifeBuoy}>
          Get product support
        </ProductActionLink>
        <span className="ml-auto">
          <ProductRowActions id={r.id} name={r.name} status={r.status} certRefreshNeeded={!!r.certRefreshNeededAt} />
        </span>
      </footer>
    </article>
  )
}

// Real product image when available; otherwise a deterministic gradient + icon
// (matching the creator card's image-less thumbnail style).
function CardThumb({ name, imageUrl }: { name: string; imageUrl?: string }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className="h-12 w-12 flex-none rounded-xl object-cover ring-1 ring-ink-100"
      />
    )
  }
  const gradients = [
    'linear-gradient(135deg,#F4C0D1 0%,#D4537E 100%)',
    'linear-gradient(135deg,#9FE1CB 0%,#0F6E56 100%)',
    'linear-gradient(135deg,#FAC775 0%,#BA7517 100%)',
    'linear-gradient(135deg,#CECBF6 0%,#534AB7 100%)',
  ]
  const icons = [Coffee, Leaf, Package, Truck]
  const h = simpleHash(name)
  const Icon = icons[h % icons.length]!
  return (
    <div
      className="flex h-12 w-12 flex-none items-center justify-center rounded-xl"
      style={{ background: gradients[h % gradients.length] }}
    >
      <Icon className="h-5 w-5 text-white" aria-hidden="true" />
    </div>
  )
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function ProductActionLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 font-medium text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </Link>
  )
}

function ProductSep() {
  return <span className="text-ink-300">·</span>
}
