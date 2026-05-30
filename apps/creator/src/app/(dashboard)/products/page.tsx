// REBUILD R6.1 — Creator products list, wide-card layout.
//
// Pattern matches R10 /orders: one card per product instead of a
// dense table row, grouped by status into bands. Each card has:
//   - Cream header bar: status pill + brand + template + updated + PRD-id
//   - Body: thumbnail + product name + variant subtitle + 4 meta chips
//     (recipe state, certs/tags, MOQ/lead-time placeholder, last order)
//   - Right rail: Open in Studio (primary) + Order this product (secondary)
//
// Replaces the partner-style sectioned table shipped in R6 — same data,
// richer visual identity that scales past handful-of-products lists.

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
} from 'lucide-react'
import { marketingUrl } from '@/lib/marketing-url'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Products — iLaunchify' }

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

export default async function ProductsListPage() {
  const user = await requireUser()
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
              _count: { select: { orderItems: true } },
            },
          },
        },
      },
    },
  })

  // Cast through unknown — Prisma's nested-select inferred shape lines
  // up with the Row alias declared below, but TS can't unify them
  // automatically (Decimal vs Date scalar wrapping). Same pattern as R6.
  const products: Row[] = (profile?.brands.flatMap((b) =>
    b.products.map((p) => ({ ...p, brandName: b.name })),
  ) ?? []) as unknown as Row[]

  const grouped = groupByStatus(products)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            My products
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Every product you&apos;ve started, grouped by status. Drafts and
            in-review rows surface first so you can finish what you began.
          </p>
        </div>
        <Link
          href={marketingUrl('/marketplace')}
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" /> New product
        </Link>
      </header>

      {products.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-7">
          {grouped.map(({ status, rows }) => (
            <ProductSection key={status} status={status} rows={rows} />
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Section + Card
// -----------------------------------------------------------------------------

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
  _count: { orderItems: number }
}

function groupByStatus(rows: Row[]): Array<{ status: ProductStatus; rows: Row[] }> {
  const order: ProductStatus[] = [
    'DRAFT',
    'IN_REVIEW',
    'COMPLIANT',
    'PUBLISHED',
    'PAUSED',
    'ARCHIVED',
  ]
  const buckets = new Map<ProductStatus, Row[]>()
  for (const r of rows) {
    const arr = buckets.get(r.status) ?? []
    arr.push(r)
    buckets.set(r.status, arr)
  }
  return order
    .filter((s) => (buckets.get(s)?.length ?? 0) > 0)
    .map((status) => ({ status, rows: buckets.get(status)! }))
}

function ProductSection({ status, rows }: { status: ProductStatus; rows: Row[] }) {
  const palette = STATUS[status]
  return (
    <section className="space-y-2.5">
      <h2 className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        <span
          className="inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: palette.dot }}
        />
        {palette.label}
        <span className="text-[11px] font-normal normal-case tracking-normal text-zinc-400">
          · {rows.length} {rows.length === 1 ? 'product' : 'products'}
        </span>
      </h2>
      <div className="space-y-3">
        {rows.map((r) => (
          <ProductCard key={r.id} row={r} />
        ))}
      </div>
    </section>
  )
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
  // Marketplace detail page on apps/marketing — the source-of-truth page
  // for the template this product was cloned from. Image + title link
  // there so the creator can review/adjust their source choice.
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
          {templateUrl ? (
            <a
              href={templateUrl}
              className="block truncate text-[15px] font-medium leading-tight text-zinc-900 transition-colors hover:text-pink-700"
              title="Review or adjust this template in the marketplace"
            >
              {r.name}
            </a>
          ) : (
            <div className="truncate text-[15px] font-medium leading-tight text-zinc-900">
              {r.name}
            </div>
          )}
          {variantBits.length > 0 && (
            <div className="mt-0.5 text-[12.5px] text-zinc-500">
              {variantBits.join(' · ')}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-zinc-700">
            <span className={`inline-flex items-center gap-1.5 ${recipeBadge.cls}`}>
              <RecipeIcon className="h-3.5 w-3.5" />
              {recipeBadge.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-600">
              <ShieldCheck className="h-3.5 w-3.5" />
              FDA · USDA Organic
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-600">
              <Package className="h-3.5 w-3.5" />
              MOQ 250 · 10-day lead
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-500">
              <Truck className="h-3.5 w-3.5" />
              {orderCount === 0
                ? 'Never ordered'
                : `${orderCount} order${orderCount === 1 ? '' : 's'} placed`}
            </span>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end justify-center gap-2">
          <Link
            href={`/products/${r.id}/design/canvas`}
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
          >
            Open in Studio <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={`/products/${r.id}/checkout`}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-[7px] text-[12px] font-medium text-zinc-900 hover:bg-zinc-50"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Order this product
          </Link>
          <Link
            href={`/products/${r.id}`}
            className="inline-flex items-center gap-1 px-1 py-0.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
          >
            <MoreHorizontal className="h-3.5 w-3.5" /> More
          </Link>
        </div>
      </div>
    </article>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 p-12 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
        <Package className="h-6 w-6 text-pink-600" />
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-900">No products yet</p>
      <p className="mt-1 text-sm text-zinc-500">
        Pick a template from the marketplace, customise it for your brand, and
        we&apos;ll handle manufacturing, printing, and fulfilment.
      </p>
      <Link
        href={marketingUrl('/marketplace')}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
      >
        <Plus className="h-4 w-4" /> Browse the marketplace
      </Link>
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
      <Icon className="h-7 w-7 text-white" />
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
