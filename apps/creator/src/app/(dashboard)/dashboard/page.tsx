// Creator dashboard — brand-building + ordering cockpit.
//
// Pavel 2026-06-06: "flawless, professional, covers all important metrics +
// daily tasks." Composed from the shared @ilaunchify/ui dashboard widgets so
// it matches the admin + partner surfaces. All REAL data.
//
// Layout:
//   Hero (cream) — welcome + brand + tier + quick actions
//   Row 1 — 6 KPIs (products / in progress / live / in production / spend 30d / resume drafts)
//   Row 2 — "Pick up where you left off" queue (span 8) + order pipeline (span 4)
//   Row 3 — recent orders (span 7) + your products (span 5)

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  cn,
  KpiWidget,
  QueueWidget,
  StatusWidget,
  ListWidget,
  type QueueWidgetItem,
  type StatusIndicator,
  type ListWidgetItem,
} from '@ilaunchify/ui'
import Link from 'next/link'
import {
  Package,
  ShoppingCart,
  Radio,
  Factory,
  DollarSign,
  CircleAlert,
  Plus,
  Palette,
  ShieldAlert,
  Sparkles,
  ShoppingBag,
} from 'lucide-react'
import { marketingUrl } from '@/lib/marketing-url'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — iLaunchify' }

const DAY = 24 * 60 * 60 * 1000
const TIER_LABEL: Record<string, string> = { MAKER: 'Maker', BUILDER: 'Builder', AGENCY: 'Agency' }

function weeklyDollarBuckets(rows: { paidAt: Date | null; totalCents: number }[], weeks = 12): number[] {
  const now = Date.now()
  const out = new Array<number>(weeks).fill(0)
  for (const r of rows) {
    if (!r.paidAt) continue
    const idx = weeks - 1 - Math.floor((now - r.paidAt.getTime()) / (7 * DAY))
    if (idx >= 0 && idx < weeks) out[idx] = (out[idx] ?? 0) + r.totalCents / 100
  }
  return out
}

export default async function DashboardHome() {
  const user = await requireUser()
  const now = new Date()
  const since30 = new Date(now.getTime() - 30 * DAY)

  const [profile, orders] = await Promise.all([
    prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      include: {
        brands: {
          orderBy: { createdAt: 'asc' },
          include: {
            products: {
              select: {
                id: true,
                name: true,
                status: true,
                recipe: {
                  select: { complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1, select: { outcome: true } } },
                },
                checkoutDrafts: {
                  where: { creatorUserId: user.id },
                  select: { id: true, currentStep: true, updatedAt: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    }),
    prisma.order.findMany({
      where: { creatorUserId: user.id },
      select: {
        id: true,
        status: true,
        totalCents: true,
        paidAt: true,
        createdAt: true,
        brand: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])
  if (!profile) return null

  const brand = profile.brands[0]
  const brandCount = profile.brands.length
  const tier = TIER_LABEL[profile.subscriptionTier as string] ?? null

  const products = profile.brands.flatMap((b) =>
    b.products.map((p) => ({ ...p, brandName: b.name })),
  )
  const pStatus = (s: string) => products.filter((p) => p.status === s).length
  const totalProducts = products.length
  const inProgress = products.filter((p) => ['DRAFT', 'IN_REVIEW', 'COMPLIANT'].includes(p.status as string)).length
  const live = pStatus('PUBLISHED')

  // Compliance signals (real enum: PASSED / PASSED_WITH_WARNINGS / FAILED)
  const outcomeOf = (p: (typeof products)[number]) => p.recipe?.complianceChecks[0]?.outcome ?? null
  const failedCompliance = products.filter((p) => outcomeOf(p) === 'FAILED')
  const warnCompliance = products.filter((p) => outcomeOf(p) === 'PASSED_WITH_WARNINGS')
  const readyToOrder = products.filter((p) => p.status === 'COMPLIANT')

  // Resume-checkout drafts
  const drafts = products
    .filter((p) => p.checkoutDrafts[0])
    .map((p) => ({ product: p, draft: p.checkoutDrafts[0]! }))
    .sort((a, b) => b.draft.updatedAt.getTime() - a.draft.updatedAt.getTime())

  // Orders
  const oCount = (sts: string[]) => orders.filter((o) => sts.includes(o.status as string)).length
  const inProduction = oCount(['PAID', 'ROUTING', 'IN_FULFILLMENT', 'READY_TO_SHIP'])
  const inTransit = oCount(['SHIPPED', 'IN_TRANSIT'])
  const delivered = oCount(['DELIVERED', 'COMPLETED'])
  const awaitingPayment = oCount(['PENDING_PAYMENT'])
  const spend30 = orders
    .filter((o) => o.paidAt && o.paidAt >= since30)
    .reduce((a, o) => a + o.totalCents, 0)
  const spendSpark = weeklyDollarBuckets(orders.filter((o) => o.paidAt))

  // ---- Queue: pick up where you left off ----
  const queue: QueueWidgetItem[] = [
    ...drafts.map(({ product, draft }) => ({
      id: `draft-${draft.id}`,
      label: `Resume checkout · ${product.name}`,
      sublabel: `Step ${draft.currentStep} · saved ${draft.updatedAt.toLocaleDateString()}`,
      icon: <ShoppingCart className="h-4 w-4" aria-hidden="true" />,
      tone: 'pink' as const,
      primaryAction: { label: 'Resume', href: `/products/${product.id}/checkout`, tone: 'pink' as const },
    })),
    ...failedCompliance.map((p) => ({
      id: `fail-${p.id}`,
      label: `Fix compliance · ${p.name}`,
      sublabel: 'Recipe failed FDA checks — can’t ship until fixed',
      icon: <ShieldAlert className="h-4 w-4" aria-hidden="true" />,
      tone: 'danger' as const,
      primaryAction: { label: 'Fix in Studio', href: `/products/${p.id}/design/canvas`, tone: 'pink' as const },
    })),
    ...warnCompliance.map((p) => ({
      id: `warn-${p.id}`,
      label: `Review warnings · ${p.name}`,
      sublabel: 'Compliant with warnings worth a look',
      icon: <CircleAlert className="h-4 w-4" aria-hidden="true" />,
      tone: 'warning' as const,
      primaryAction: { label: 'Review', href: `/products/${p.id}` },
    })),
    ...readyToOrder
      .filter((p) => !p.checkoutDrafts[0])
      .map((p) => ({
        id: `ready-${p.id}`,
        label: `Ready to order · ${p.name}`,
        sublabel: 'Compliant and ready for a production run',
        icon: <ShoppingBag className="h-4 w-4" aria-hidden="true" />,
        tone: 'success' as const,
        primaryAction: { label: 'Order', href: `/products/${p.id}/checkout`, tone: 'success' as const },
      })),
  ]

  // ---- Order pipeline ----
  const pipeline: StatusIndicator[] = [
    { label: 'Awaiting payment', value: String(awaitingPayment), status: awaitingPayment > 0 ? 'amber' : 'green' },
    { label: 'In production', value: String(inProduction), status: 'green' },
    { label: 'In transit', value: String(inTransit), status: 'green' },
    { label: 'Delivered', value: String(delivered), status: 'green' },
  ]

  // ---- Recent orders + products ----
  const recentOrders: ListWidgetItem[] = orders.slice(0, 8).map((o) => ({
    id: o.id,
    label: o.brand.name,
    sublabel: `#${o.id.slice(-8)} · ${new Date(o.createdAt).toLocaleDateString()}`,
    value: `$${(o.totalCents / 100).toFixed(0)}`,
    href: `/orders/${o.id}`,
    tone: ORDER_TONE[o.status as string] ?? 'ink',
  }))
  const recentProducts: ListWidgetItem[] = products.slice(0, 6).map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.brandName,
    value: PRODUCT_STATUS_LABEL[p.status as string] ?? (p.status as string),
    href: `/products/${p.id}`,
    tone: PRODUCT_TONE[p.status as string] ?? 'ink',
  }))

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              Creator · Dashboard
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Welcome back{user.name ? `, ${user.name}` : ''}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-600">
              {brand ? `Managing ${brand.name}` : 'No brand yet — set one up to get started.'}
              {tier && (
                <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-pink-700">
                  <Sparkles className="h-3 w-3" aria-hidden="true" /> {tier}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {brand && (
              <Link
                href={`/brands/${brand.id}/assets`}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                <Palette className="h-3.5 w-3.5" aria-hidden="true" /> Brand assets
              </Link>
            )}
            <Link
              href={marketingUrl('/marketplace')}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New product
            </Link>
          </div>
        </div>
      </div>

      {/* Row 1 — KPI strip */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-12">
        <KpiWidget label="Products" value={totalProducts} icon={Package} tone="ink" href="/products" span={2} />
        <KpiWidget label="In progress" value={inProgress} icon={ShoppingCart} tone="pink" href="/products" span={2} />
        <KpiWidget label="Live" value={live} icon={Radio} tone="info" href="/products?tab=live" span={2} />
        <KpiWidget label="In production" value={inProduction} icon={Factory} tone="warning" href="/orders" span={2} />
        <KpiWidget label="Spend · 30d" value={`$${(spend30 / 100).toLocaleString()}`} icon={DollarSign} tone="success" sparkline={spendSpark} href="/orders" span={2} />
        <KpiWidget label="Resume checkout" value={drafts.length} icon={ShoppingCart} tone={drafts.length > 0 ? 'pink' : 'ink'} href="/products" span={2} />
      </section>

      {/* Row 2 — queue + pipeline */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <QueueWidget
          title="Pick up where you left off"
          subtitle="Drafts to finish, compliance to fix, products ready to order"
          icon={<ShoppingCart className="h-4 w-4" aria-hidden="true" />}
          tone="pink"
          items={queue}
          maxItems={8}
          emptyLabel="Nothing waiting on you — browse the marketplace for your next product."
          span={8}
        />
        <StatusWidget
          title="Order pipeline"
          subtitle="Your production runs by stage"
          icon={Factory}
          tone="ink"
          indicators={pipeline}
          span={4}
        />
      </section>

      {/* Row 3 — recent activity */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ListWidget
          title="Recent orders"
          subtitle="Your latest production runs"
          icon={Factory}
          tone="ink"
          items={recentOrders}
          emptyLabel="No orders yet — place your first from a compliant product."
          footerLink={{ href: '/orders', label: 'All orders' }}
          span={7}
        />
        <ListWidget
          title="Your products"
          subtitle={`${brandCount} brand${brandCount === 1 ? '' : 's'} · ${totalProducts} product${totalProducts === 1 ? '' : 's'}`}
          icon={Package}
          tone="pink"
          items={recentProducts}
          emptyLabel="No products yet."
          footerLink={{ href: '/products', label: 'All products' }}
          span={5}
        />
      </section>
    </div>
  )
}

const ORDER_TONE: Record<string, ListWidgetItem['tone']> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'info',
  ROUTING: 'info',
  IN_FULFILLMENT: 'info',
  READY_TO_SHIP: 'info',
  SHIPPED: 'ink',
  IN_TRANSIT: 'ink',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'danger',
}

const PRODUCT_TONE: Record<string, ListWidgetItem['tone']> = {
  DRAFT: 'ink',
  IN_REVIEW: 'info',
  COMPLIANT: 'success',
  PUBLISHED: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'ink',
}

const PRODUCT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  COMPLIANT: 'Ready',
  PUBLISHED: 'Live',
  PAUSED: 'Paused',
  ARCHIVED: 'Archived',
}
