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
import { requireUser } from '@ilaunchify/auth'
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
  MoreHorizontal,
  ShoppingBag,
  ShoppingCart,
  Factory,
  Radio,
  Archive,
} from 'lucide-react'
import { marketingUrl } from '@/lib/marketing-url'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Products — iLaunchify' }

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
type ComplianceOutcome = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAILED'

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
  NONE: { label: 'No recipe yet', icon: Circle, cls: 'text-zinc-400' },
  PASS: { label: 'Recipe compliant', icon: CircleCheck, cls: 'text-emerald-700' },
  PASS_WITH_WARNINGS: { label: 'Compliant with warnings', icon: CircleAlert, cls: 'text-amber-700' },
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
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams
  const activeTab: TabKey = TABS.some((t) => t.key === sp.tab)
    ? (sp.tab as TabKey)
    : 'in_progress'

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
      return {
        ...p,
        brandName: b.name,
        draft,
        orderState: deriveOrderState(orderStatuses),
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            My products
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{tabMeta.blurb}</p>
        </div>
        <Link
          href={marketingUrl('/marketplace')}
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> New product
        </Link>
      </header>

      <TabBar active={activeTab} counts={counts} />

      {rows.length === 0 ? (
        <FirstRunEmpty />
      ) : visible.length === 0 ? (
        <TabEmpty meta={tabMeta} />
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <ProductCard key={r.id} row={r} />
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
}: {
  active: TabKey
  counts: Record<TabKey, number>
}) {
  return (
    <nav
      aria-label="Product status"
      className="flex flex-wrap items-center gap-1 border-b border-zinc-200"
    >
      {TABS.map((t) => {
        const isActive = t.key === active
        const Icon = t.icon
        return (
          <Link
            key={t.key}
            href={`/products${t.key === 'in_progress' ? '' : `?tab=${t.key}`}`}
            aria-current={isActive ? 'page' : undefined}
            className={
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ' +
              (isActive
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-800')
            }
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t.label}
            <span
              className={
                'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold ' +
                (isActive
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600')
              }
            >
              {counts[t.key]}
            </span>
          </Link>
        )
      })}
    </nav>
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
}

function ProductCard({ row: r }: { row: Row }) {
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
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-[#F3EFE8] px-4 py-2.5 text-[12px] text-zinc-700">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
          style={{ background: palette.bg, color: palette.fg, borderColor: palette.border }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: palette.dot }} />
          {palette.label}
        </span>
        <span>
          <span className="text-zinc-500">Brand</span> &nbsp;{r.brandName}
        </span>
        {r.productTemplate && (
          <span>
            <span className="text-zinc-500">Template</span> &nbsp;{r.productTemplate.name}
          </span>
        )}
        <span className="ml-auto text-zinc-500">
          Updated {formatRelative(r.updatedAt)}
        </span>
        <span className="font-mono text-[11px] text-zinc-400">
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
                className="truncate text-[15px] font-medium leading-tight text-zinc-900 transition-colors hover:text-pink-700"
                title="Review or adjust this template in the marketplace"
              >
                {r.name}
              </a>
            ) : (
              <span className="truncate text-[15px] font-medium leading-tight text-zinc-900">
                {r.name}
              </span>
            )}
            {/* R11 — Resume Checkout chip sits inline with the title so it
                rides with the product across whichever tab the creator
                opens (most often In progress). */}
            {r.draft && <ResumeChip productId={r.id} draft={r.draft} />}
          </div>

          {variantBits.length > 0 && (
            <div className="mt-0.5 text-[12.5px] text-zinc-500">
              {variantBits.join(' · ')}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-zinc-700">
            <span className={`inline-flex items-center gap-1.5 ${recipeBadge.cls}`}>
              <RecipeIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {recipeBadge.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-600">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              FDA · USDA Organic
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-600">
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              MOQ 250 · 10-day lead
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-500">
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
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
          >
            Open in Studio <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <Link
            href={`/products/${r.id}`}
            className="inline-flex items-center gap-1 px-1 py-0.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> More
          </Link>
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
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 p-12 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
        <Package className="h-6 w-6 text-pink-600" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-900">No products yet</p>
      <p className="mt-1 text-sm text-zinc-500">
        Pick a template from the marketplace, customise it for your brand, and
        we&apos;ll handle manufacturing, printing, and fulfilment.
      </p>
      <Link
        href={marketingUrl('/marketplace')}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
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
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 p-10 text-center">
      <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100">
        <Icon className="h-5 w-5 text-zinc-500" aria-hidden="true" />
      </div>
      <p className="mt-3 text-[13px] text-zinc-600">{meta.emptyCopy}</p>
      {meta.emptyCta && (
        <Link
          href={meta.emptyCta.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
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
