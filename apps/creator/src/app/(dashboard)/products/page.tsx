// REBUILD R11 — Creator products list with status TABS + Resume Checkout chip.
//
// Pavel's design decision (2026-05-30): products are durable creator assets,
// not cart items, and they live on /products forever. We split them into four
// workflow-aligned tabs and surface in-progress CheckoutDrafts as a "Resume
// checkout" chip on the product card itself — not as a separate "Carts"
// tab — so the cart stays attached to the asset that owns it.
//
// Tabs:
//   in_progress (default) — DRAFT + IN_REVIEW + COMPLIANT, no active order
//   in_production          — has an Order in production/transit states
//   live                   — PUBLISHED or has a DELIVERED / COMPLETED order
//   archived               — PAUSED / ARCHIVED products
//
// Tab is URL-driven (?tab=…) so tabs can be linked / bookmarked / refreshed
// without losing state.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser, getCreatorTier, hasTier } from '@ilaunchify/auth'
import {
  Package,
  Coffee,
  Leaf,
  Truck,
  CircleCheck,
  CircleAlert,
  Circle,
  ShieldCheck,
  ArrowRight,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Factory,
  Radio,
  Archive,
  ShieldAlert,
} from 'lucide-react'
import { cn, ViewToggle, type ViewMode } from '@ilaunchify/ui'
import { evaluateProductRestrictions } from '@ilaunchify/marketplace'
import { marketingUrl } from '@/lib/marketing-url'
import { ProductRowActions } from './ProductRowActions'

function tabHref(key: string, view: ViewMode): string {
  const q = new URLSearchParams()
  if (key !== 'in_progress') q.set('tab', key)
  if (view === 'table') q.set('view', 'table')
  const s = q.toString()
  return s ? `/products?${s}` : '/products'
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Products — iLaunchify' }

const TAB_TONE: Record<TabKey, 'pink' | 'amber' | 'sky' | 'ink'> = {
  in_progress: 'pink',
  in_production: 'amber',
  live: 'sky',
  archived: 'ink',
}

// -----------------------------------------------------------------------------
// Status palettes + tabs
// -----------------------------------------------------------------------------

type ProductStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'COMPLIANT'
  | 'PUBLISHED'
  | 'PAUSED'
  | 'ARCHIVED'
type ComplianceOutcome = 'PASSED' | 'PASSED_WITH_WARNINGS' | 'FAILED'

interface StatusPalette {
  label: string
  bg: string
  fg: string
  border: string
  dot: string
}

const STATUS: Record<ProductStatus, StatusPalette> = {
  DRAFT: { label: 'Draft', bg: '#FBEAF0', fg: '#72243E', border: '#F4C0D1', dot: '#D4537E' },
  IN_REVIEW: { label: 'In review', bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  COMPLIANT: { label: 'Ready to order', bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  PUBLISHED: { label: 'Live', bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
  PAUSED: { label: 'Paused', bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7', dot: '#888780' },
  ARCHIVED: { label: 'Archived', bg: '#F1EFE8', fg: '#888780', border: '#D3D1C7', dot: '#B4B2A9' },
}

const RECIPE_BADGE: Record<ComplianceOutcome | 'NONE', {
  label: string
  icon: typeof CircleCheck
  cls: string
}> = {
  NONE: { label: 'No recipe yet', icon: Circle, cls: 'text-ink-400' },
  PASSED: { label: 'Recipe compliant', icon: CircleCheck, cls: 'text-emerald-700' },
  PASSED_WITH_WARNINGS: { label: 'Compliant with warnings', icon: CircleAlert, cls: 'text-amber-700' },
  FAILED: { label: 'Compliance failed', icon: CircleAlert, cls: 'text-pink-700' },
}

type TabKey = 'in_progress' | 'in_production' | 'live' | 'archived'

const TABS: Array<{
  key: TabKey
  label: string
  icon: typeof Package
  blurb: string
  emptyCopy: string
  emptyCta?: { href: string; label: string }
}> = [
  {
    key: 'in_progress',
    label: 'In progress',
    icon: ShoppingCart,
    blurb: 'Drafts, in-review, and ready-to-order products you’re still building.',
    emptyCopy:
      'Nothing in progress yet. Pick a template from the marketplace to start a new product.',
    emptyCta: { href: marketingUrl('/marketplace'), label: 'Browse the marketplace' },
  },
  {
    key: 'in_production',
    label: 'In production',
    icon: Factory,
    blurb: 'Orders placed, partners producing, goods on the way back to you.',
    emptyCopy:
      'No active production runs. Once you place an order it shows up here with live status.',
  },
  {
    key: 'live',
    label: 'Live',
    icon: Radio,
    blurb: 'Delivered batches and products listed on at least one channel.',
    emptyCopy:
      'Nothing live yet. Delivered orders and channel-listed products will appear here.',
  },
  {
    key: 'archived',
    label: 'Archived',
    icon: Archive,
    blurb: 'Paused or retired products. Restore from a product page when you’re ready.',
    emptyCopy: 'Nothing archived. Anything you pause or retire lands here.',
  },
]

// -----------------------------------------------------------------------------
// Order-state → bucket
// -----------------------------------------------------------------------------

// V1 categorisation. A product can have many orders; we look at the most
// recent NON-cancelled / NON-refunded one to decide whether it belongs in
// "In production" (mid-flight) or "Live" (delivered/completed). Cancelled /
// refunded orders don't move the product out of "In progress" — the creator
// can still go re-order.
type OrderState = 'NONE' | 'ACTIVE' | 'DELIVERED'

const IN_FLIGHT = new Set([
  'PAID',
  'ROUTING',
  'IN_FULFILLMENT',
  'READY_TO_SHIP',
  'SHIPPED',
  'IN_TRANSIT',
  'ON_HOLD',
  'DISPUTED',
])
const DONE = new Set(['DELIVERED', 'COMPLETED'])

function deriveOrderState(statuses: string[]): OrderState {
  for (const s of statuses) {
    if (IN_FLIGHT.has(s)) return 'ACTIVE'
  }
  for (const s of statuses) {
    if (DONE.has(s)) return 'DELIVERED'
  }
  return 'NONE'
}

function bucketProduct(r: Row): TabKey {
  if (r.status === 'PAUSED' || r.status === 'ARCHIVED') return 'archived'
  if (r.orderState === 'ACTIVE') return 'in_production'
  if (r.orderState === 'DELIVERED' || r.status === 'PUBLISHED') return 'live'
  return 'in_progress'
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default async function ProductsListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; view?: string }>
}) {
  const user = await requireUser()
  // Builder+ gate for the compliance-label download (Maker excluded). The button
  // is simply not rendered below for Maker; the server action is the hard gate.
  const canDownloadLabels = hasTier(await getCreatorTier(user.id), 'builder')
  const sp = await searchParams
  const activeTab: TabKey = TABS.some((t) => t.key === sp.tab)
    ? (sp.tab as TabKey)
    : 'in_progress'
  const view: ViewMode = sp.view === 'table' ? 'table' : 'cards' // Creator default: cards

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    include: {
      brands: {
        include: {
          products: {
            orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
            include: {
              productTemplate: {
                select: {
                  name: true,
                  slug: true,
                  // Restricted-category eligibility signals (labeling ≠ licensing).
                  labelingType: true,
                  phraseFacts: true,
                  subcategory: {
                    select: {
                      slug: true,
                      category: { select: { slug: true } },
                    },
                  },
                },
              },
              variant: { select: { flavor: true, containerFormat: true, servingsPerContainer: true } },
              recipe: {
                select: {
                  complianceChecks: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { outcome: true },
                  },
                  ingredients: {
                    select: {
                      ingredient: { select: { name: true, labelDeclarationName: true } },
                    },
                  },
                },
              },
              // R11 — checkoutDrafts scoped to this creator only (the
              // junction is also keyed by creatorUserId so the relation
              // returns 0..1 row in practice). Drives the Resume chip.
              checkoutDrafts: {
                where: { creatorUserId: user.id },
                select: { id: true, currentStep: true, updatedAt: true },
                take: 1,
              },
              // R11 — derive order state for bucketing. Pull the latest
              // non-cancelled order statuses; deriveOrderState() picks the
              // most-active one.
              orderItems: {
                select: {
                  order: { select: { status: true, createdAt: true } },
                },
                orderBy: { id: 'desc' },
                take: 10,
              },
              _count: { select: { orderItems: true } },
            },
          },
        },
      },
    },
  })

  // Flatten + decorate.
  const rows: Row[] = (profile?.brands.flatMap((b) =>
    b.products.map((p) => {
      const draft = p.checkoutDrafts[0] ?? null
      const orderStatuses: string[] = p.orderItems
        .map((oi) => oi.order?.status)
        .filter(Boolean)
        .map(String)
      // Restricted-category eligibility (labeling ≠ licensing). Same evaluator
      // the checkout gate uses — surfaced here so the creator sees it before
      // designing/ordering, not at the final Pay step.
      const restrictionHits = evaluateProductRestrictions({
        labelingType: p.productTemplate?.labelingType ?? null,
        phraseFacts: (p.productTemplate?.phraseFacts ?? null) as Record<string, unknown> | null,
        ingredientNames: (p.recipe?.ingredients ?? []).map(
          (ri) => ri.ingredient.labelDeclarationName ?? ri.ingredient.name,
        ),
      })
      return {
        ...p,
        brandName: b.name,
        draft,
        orderState: deriveOrderState(orderStatuses),
        restrictionLabels: restrictionHits.map((h) => h.label),
      }
    }),
  ) ?? []) as unknown as Row[]

  // Bucket once so the tab counts are accurate AND the active-tab filter
  // is cheap.
  const counts: Record<TabKey, number> = {
    in_progress: 0,
    in_production: 0,
    live: 0,
    archived: 0,
  }
  const buckets: Record<TabKey, Row[]> = {
    in_progress: [],
    in_production: [],
    live: [],
    archived: [],
  }
  for (const r of rows) {
    const tab = bucketProduct(r)
    counts[tab] += 1
    buckets[tab].push(r)
  }

  const visible = buckets[activeTab]
  const tabMeta = TABS.find((t) => t.key === activeTab)!

  return (
    <div className="space-y-6">
      {/* Cream hero + KPI strip */}
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              Creator · Products
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              My products
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-600">{tabMeta.blurb}</p>
          </div>
          <Link
            href={marketingUrl('/marketplace')}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> New product
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {TABS.map((t) => (
            <Kpi
              key={t.key}
              href={tabHref(t.key, view)}
              label={t.label}
              value={counts[t.key]}
              icon={t.icon}
              tone={TAB_TONE[t.key]}
              active={activeTab === t.key}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabBar active={activeTab} counts={counts} view={view} />
        <ViewToggle value={view} defaultMode="cards" />
      </div>

      {rows.length === 0 ? (
        <FirstRunEmpty />
      ) : visible.length === 0 ? (
        <TabEmpty meta={tabMeta} />
      ) : view === 'table' ? (
        <ProductTable rows={visible} />
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <ProductCard key={r.id} row={r} canDownloadLabels={canDownloadLabels} />
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// TabBar
// -----------------------------------------------------------------------------

function TabBar({
  active,
  counts,
  view,
}: {
  active: TabKey
  counts: Record<TabKey, number>
  view: ViewMode
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TABS.map((t) => {
        const isActive = t.key === active
        const Icon = t.icon
        return (
          <Link
            key={t.key}
            href={tabHref(t.key, view)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
              isActive
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t.label}
            <span className={cn('tabular-nums', isActive ? 'text-white/70' : 'text-ink-400')}>
              {counts[t.key]}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

// -----------------------------------------------------------------------------
// KPI tile (cream-hero strip)
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
  icon: typeof Package
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
        'group rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        active && 'ring-1 ring-pink-300/60',
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </Link>
  )
}

// -----------------------------------------------------------------------------
// Card
// -----------------------------------------------------------------------------

type DraftSummary = {
  id: string
  currentStep: number
  updatedAt: Date
}

type Row = {
  id: string
  name: string
  status: ProductStatus
  updatedAt: Date
  brandName: string
  productTemplate: {
    name: string
    slug: string
    subcategory: { slug: string; category: { slug: string } }
  } | null
  variant: { flavor: string | null; containerFormat: string | null; servingsPerContainer: number | null } | null
  recipe: { complianceChecks: { outcome: ComplianceOutcome }[] } | null
  draft: DraftSummary | null
  orderState: OrderState
  _count: { orderItems: number }
  /** Restricted-category labels (empty = eligible). Non-empty → Restricted chip. */
  restrictionLabels: string[]
}

// Small shared "Restricted" chip — shown on rows whose product trips a category
// iLaunchify doesn't support yet (alcohol / hemp-CBD / tobacco / OTC / kratom).
function RestrictedChip({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null
  return (
    <span
      title={`Restricted: ${labels.join(', ')} — requires licensing iLaunchify doesn't support yet. Can't be ordered.`}
      className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-red-700"
    >
      <ShieldAlert className="h-3 w-3" aria-hidden="true" />
      Restricted
    </span>
  )
}

// -----------------------------------------------------------------------------
// Table view (?view=table)
// -----------------------------------------------------------------------------

function ProductTable({ rows }: { rows: Row[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-100 text-[10.5px] uppercase tracking-wider text-ink-500">
              <th className="px-5 py-2.5 font-semibold">Product</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Variant</th>
              <th className="px-3 py-2.5 font-semibold">Recipe</th>
              <th className="px-3 py-2.5 font-semibold">Orders</th>
              <th className="px-3 py-2.5 font-semibold">Updated</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = STATUS[r.status]
              const outcome = r.recipe?.complianceChecks[0]?.outcome ?? null
              const badge = RECIPE_BADGE[outcome ?? 'NONE']
              const BadgeIcon = badge.icon
              return (
                <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink-900">{r.name}</div>
                    <div className="text-[11px] text-ink-400">{r.brandName}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider"
                        style={{ backgroundColor: st.bg, color: st.fg, borderColor: st.border }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
                        {st.label}
                      </span>
                      <RestrictedChip labels={r.restrictionLabels} />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-700">
                    {r.variant?.flavor ? `${r.variant.flavor} · ` : ''}
                    {r.variant?.containerFormat ?? '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn('inline-flex items-center gap-1 text-[12px]', badge.cls)}>
                      <BadgeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-ink-700">{r._count.orderItems}</td>
                  <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                    {new Date(r.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <ProductRowActions id={r.id} name={r.name} hasDraft={!!r.draft} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ProductCard({ row: r, canDownloadLabels }: { row: Row; canDownloadLabels?: boolean }) {
  const palette = STATUS[r.status]
  const recipeOutcome = r.recipe?.complianceChecks[0]?.outcome ?? null
  const recipeBadge = RECIPE_BADGE[recipeOutcome ?? 'NONE'] ?? RECIPE_BADGE.NONE
  const RecipeIcon = recipeBadge.icon
  const orderCount = r._count.orderItems
  const variantBits = [
    r.variant?.flavor,
    r.variant?.containerFormat,
    r.variant?.servingsPerContainer ? `${r.variant.servingsPerContainer} servings` : null,
  ].filter(Boolean)
  const templateUrl = r.productTemplate
    ? marketingUrl(
        `/marketplace/${r.productTemplate.subcategory.category.slug}/${r.productTemplate.subcategory.slug}/${r.productTemplate.slug}`,
      )
    : null

  return (
    <article className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-200 bg-cream px-4 py-2.5 text-[12px] text-ink-700">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
          style={{ background: palette.bg, color: palette.fg, borderColor: palette.border }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: palette.dot }} />
          {palette.label}
        </span>
        <RestrictedChip labels={r.restrictionLabels} />
        <span>
          <span className="text-ink-500">Brand</span> &nbsp;{r.brandName}
        </span>
        {r.productTemplate && (
          <span>
            <span className="text-ink-500">Template</span> &nbsp;{r.productTemplate.name}
          </span>
        )}
        <span className="ml-auto text-ink-500">
          Updated {formatRelative(r.updatedAt)}
        </span>
        <span className="font-mono text-[11px] text-ink-400">
          PRD-{r.id.slice(-6)}
        </span>
      </header>

      <div className="flex items-stretch gap-5 px-5 py-4">
        {templateUrl ? (
          <a
            href={templateUrl}
            className="flex-shrink-0"
            title="Review or adjust this template in the marketplace"
          >
            <Thumbnail name={r.name} />
          </a>
        ) : (
          <Thumbnail name={r.name} />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {templateUrl ? (
              <a
                href={templateUrl}
                className="truncate text-[15px] font-medium leading-tight text-ink-900 transition-colors hover:text-pink-700"
                title="Review or adjust this template in the marketplace"
              >
                {r.name}
              </a>
            ) : (
              <span className="truncate text-[15px] font-medium leading-tight text-ink-900">
                {r.name}
              </span>
            )}
            {/* R11 — Resume Checkout chip sits inline with the title so it
                rides with the product across whichever tab the creator
                opens (most often In progress). */}
            {r.draft && <ResumeChip productId={r.id} draft={r.draft} />}
          </div>

          {variantBits.length > 0 && (
            <div className="mt-0.5 text-[12.5px] text-ink-500">
              {variantBits.join(' · ')}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-700">
            <span className={`inline-flex items-center gap-1.5 ${recipeBadge.cls}`}>
              <RecipeIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {recipeBadge.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-ink-600">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              FDA · USDA Organic
            </span>
            <span className="inline-flex items-center gap-1.5 text-ink-600">
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              MOQ 250 · 10-day lead
            </span>
            <span className="inline-flex items-center gap-1.5 text-ink-500">
              <Truck className="h-3.5 w-3.5" aria-hidden="true" />
              {orderCount === 0
                ? 'Never ordered'
                : `${orderCount} order${orderCount === 1 ? '' : 's'} placed`}
            </span>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end justify-center gap-2">
          <Link
            href={`/products/${r.id}/design/canvas`}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Open in Studio <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <ProductRowActions id={r.id} name={r.name} hasDraft={!!r.draft} canDownloadLabels={canDownloadLabels} />
        </div>
      </div>
    </article>
  )
}

// -----------------------------------------------------------------------------
// Resume Checkout chip — surfaces an in-progress CheckoutDraft
// -----------------------------------------------------------------------------

function ResumeChip({
  productId,
  draft,
}: {
  productId: string
  draft: DraftSummary
}) {
  return (
    <Link
      href={`/products/${productId}/checkout`}
      className="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-[3px] text-[11px] font-medium text-pink-700 transition-colors hover:bg-pink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
      title={`Resume checkout from step ${draft.currentStep}`}
    >
      <ShoppingCart className="h-3 w-3" aria-hidden="true" />
      Resume checkout · saved {formatRelative(draft.updatedAt)}
    </Link>
  )
}

// -----------------------------------------------------------------------------
// Empty states
// -----------------------------------------------------------------------------

function FirstRunEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/40 p-12 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
        <Package className="h-6 w-6 text-pink-600" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium text-ink-900">No products yet</p>
      <p className="mt-1 text-sm text-ink-500">
        Pick a template from the marketplace, customise it for your brand, and
        we&apos;ll handle manufacturing, printing, and fulfilment.
      </p>
      <Link
        href={marketingUrl('/marketplace')}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Browse the marketplace
      </Link>
    </div>
  )
}

function TabEmpty({
  meta,
}: {
  meta: (typeof TABS)[number]
}) {
  const Icon = meta.icon
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/40 p-10 text-center">
      <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink-100">
        <Icon className="h-5 w-5 text-ink-500" aria-hidden="true" />
      </div>
      <p className="mt-3 text-[13px] text-ink-600">{meta.emptyCopy}</p>
      {meta.emptyCta && (
        <Link
          href={meta.emptyCta.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {meta.emptyCta.label}
        </Link>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function Thumbnail({ name }: { name: string }) {
  const h = simpleHash(name)
  const gradients = [
    'linear-gradient(135deg,#F4C0D1 0%,#D4537E 100%)',
    'linear-gradient(135deg,#9FE1CB 0%,#0F6E56 100%)',
    'linear-gradient(135deg,#FAC775 0%,#BA7517 100%)',
    'linear-gradient(135deg,#CECBF6 0%,#534AB7 100%)',
  ]
  const icons = [Coffee, Leaf, Package, ShoppingBag]
  const Icon = icons[h % icons.length]!
  return (
    <div
      className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center rounded-xl"
      style={{ background: gradients[h % gradients.length] }}
    >
      <Icon className="h-7 w-7 text-white" aria-hidden="true" />
    </div>
  )
}

function formatRelative(d: Date): string {
  const ms = Date.now() - new Date(d).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
