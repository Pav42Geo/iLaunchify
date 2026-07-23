// Creator → Channels → Stock & replenishment (CHANNEL_MANAGEMENT_SPEC §3.5a, C6.2).
// The replenishment engine wired to GROUND TRUTH: velocity from real channel-order
// history, leadDays from the template's REPEAT-run lead time (reorders are repeat
// runs), onOrder from in-flight production orders. Urgency-sorted; every row shows
// the honest math (cover, stockout date, reorder-by, suggested qty).

import Link from 'next/link'
import { AlertTriangle, PackageSearch, TrendingUp } from 'lucide-react'
import { prisma, getOrderSettings } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  blendedVelocity,
  reorderPoint,
  daysOfCover,
  projectedStockoutDate,
  reorderByDate,
  suggestedReorderQty,
  stockAlertState,
  type StockAlertState,
} from '@ilaunchify/channels'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Stock & replenishment · iLaunchify' }

// Knobs come from admin OrderSettings (§3.5a; C6.3): defaults 3/7/45 until tuned.
// Production orders still on their way to stock. NOTE (burndown 2026-07-22):
// this list previously held DISPATCH statuses (PENDING_ACCEPT/PRODUCING/...)
// passed through an `as never[]` cast, so Prisma rejected the query at runtime.
// These are the real OrderStatus values between payment and delivery.
const IN_FLIGHT_STATUSES = ['PAID', 'ROUTING', 'IN_FULFILLMENT', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT'] as const

const STATE_ORDER: Record<StockAlertState, number> = { STOCKOUT: 0, CRITICAL: 1, LOW: 2, HEALTHY: 3 }
const STATE_TONE: Record<StockAlertState, string> = {
  STOCKOUT: 'bg-danger-50 text-danger-700',
  CRITICAL: 'bg-danger-50 text-danger-700',
  LOW: 'bg-warning-50 text-warning-700',
  HEALTHY: 'bg-success-50 text-success-700',
}

interface Row {
  productId: string
  name: string
  state: StockAlertState
  available: number
  reserved: number
  onOrder: number
  velocity: number
  cover: number
  leadDays: number
  stockoutIso: string | null
  reorderByIso: string | null
  suggestedQty: number
}

export default async function StockReplenishmentPage() {
  const user = await requireUser()
  const settings = await getOrderSettings()
  const PROCESSING_BUFFER_DAYS = settings.channelProcessingBufferDays
  const SAFETY_DAYS = settings.channelSafetyStockDays
  const TARGET_DAYS_OF_COVER = settings.channelTargetDaysOfCover

  const pools = await prisma.inventoryPool.findMany({
    where: { creatorUserId: user.id },
    select: { productId: true, quantityOnHand: true, quantityReserved: true },
  })

  // Sales velocity inputs: mapped channel-order lines from the trailing 30 days.
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const lines = await prisma.channelOrderLine.findMany({
    where: {
      channelVariantLinkId: { not: null },
      channelOrder: {
        connection: { creatorUserId: user.id },
        placedAt: { gte: since30 },
        status: { notIn: ['CANCELLED'] },
      },
    },
    select: {
      quantity: true,
      channelVariantLinkId: true,
      channelOrder: { select: { placedAt: true } },
    },
  })
  // ChannelVariantLink.productId is a SOFT FK (no relation on the line):
  // batch-resolve link -> product. NOTE (burndown 2026-07-22): the old
  // cast-guarded read nest-selected a nonexistent relation; Prisma rejected it
  // at runtime and the .catch faked [] so this page always showed zero sales.
  const lineLinkIds = [...new Set(lines.map((l) => l.channelVariantLinkId).filter((x): x is string => !!x))]
  const lineLinks = lineLinkIds.length
    ? await prisma.channelVariantLink.findMany({ where: { id: { in: lineLinkIds } }, select: { id: true, productId: true } })
    : []
  const productByLink = new Map(lineLinks.map((l) => [l.id, l.productId]))

  const sales7 = new Map<string, number>()
  const sales30 = new Map<string, number>()
  for (const l of lines) {
    const pid = l.channelVariantLinkId ? productByLink.get(l.channelVariantLinkId) : undefined
    if (!pid) continue
    sales30.set(pid, (sales30.get(pid) ?? 0) + l.quantity)
    if (l.channelOrder.placedAt >= since7) sales7.set(pid, (sales7.get(pid) ?? 0) + l.quantity)
  }

  // Every product that has a pool OR recent sales participates.
  const productIds = [...new Set([...pools.map((p) => p.productId), ...sales30.keys()])]
  if (productIds.length === 0) {
    return (
      <Shell>
        <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-10 text-center text-[12.5px] text-ink-500">
          <PackageSearch className="mx-auto mb-2 h-5 w-5 text-ink-300" />
          Nothing to track yet: stock appears here once you record a delivery or channel sales start flowing.
        </p>
      </Shell>
    )
  }

  const [products, inFlight] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, brand: { creatorProfile: { userId: user.id } } },
      select: {
        id: true,
        name: true,
        productTemplate: { select: { leadTimeRepeatDays: true, leadTimeFirstRunDays: true } },
      },
    }),
    prisma.orderItem.findMany({
      where: { productId: { in: productIds }, order: { creatorUserId: user.id, status: { in: [...IN_FLIGHT_STATUSES] } } },
      select: { productId: true, quantity: true },
    }),
  ])
  const onOrderByProduct = new Map<string, number>()
  for (const i of inFlight) onOrderByProduct.set(i.productId, (onOrderByProduct.get(i.productId) ?? 0) + i.quantity)
  const poolByProduct = new Map(pools.map((p) => [p.productId, p]))

  const now = new Date()
  const rows: Row[] = products.map((p) => {
    const pool = poolByProduct.get(p.id)
    const onHand = Number(pool?.quantityOnHand ?? 0)
    const reserved = Number(pool?.quantityReserved ?? 0)
    const available = Math.max(0, onHand - reserved)
    const velocity = blendedVelocity({ unitsLast7: sales7.get(p.id) ?? 0, unitsLast30: sales30.get(p.id) ?? 0 })
    const leadDays = (p.productTemplate?.leadTimeRepeatDays ?? p.productTemplate?.leadTimeFirstRunDays ?? 28) + PROCESSING_BUFFER_DAYS
    const rop = reorderPoint({ velocityPerDay: velocity, leadDays, safetyDays: SAFETY_DAYS })
    const onOrder = onOrderByProduct.get(p.id) ?? 0
    const state = stockAlertState({ available, velocityPerDay: velocity, reorderPoint: rop, leadDays })
    const stockout = projectedStockoutDate(available, velocity, now)
    return {
      productId: p.id,
      name: p.name,
      state,
      available,
      reserved,
      onOrder,
      velocity,
      cover: daysOfCover(available, velocity),
      leadDays,
      stockoutIso: stockout?.toISOString() ?? null,
      reorderByIso: stockout ? reorderByDate(stockout, leadDays).toISOString() : null,
      suggestedQty: suggestedReorderQty({ targetDaysOfCover: TARGET_DAYS_OF_COVER, velocityPerDay: velocity, available, onOrder }),
    }
  })
  rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.cover - b.cover)

  const urgent = rows.filter((r) => r.state === 'STOCKOUT' || r.state === 'CRITICAL').length

  return (
    <Shell>
      {urgent > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12.5px] text-danger-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {urgent} product{urgent === 1 ? '' : 's'} need immediate attention:
          reorders placed today may not arrive before stockout.
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Available</th>
              <th className="px-3 py-2.5 text-right">In production</th>
              <th className="px-3 py-2.5 text-right">Sales/day</th>
              <th className="px-3 py-2.5 text-right">Days of cover</th>
              <th className="px-3 py-2.5">Reorder by</th>
              <th className="px-3 py-2.5 text-right">Suggested qty</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/50">
                <td className="px-3 py-2 font-semibold text-ink-900">{r.name}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${STATE_TONE[r.state]}`}>{r.state}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.available}
                  {r.reserved > 0 && <span className="text-[10.5px] text-ink-400"> (+{r.reserved} rsv)</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-600">{r.onOrder || '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-600">{r.velocity > 0 ? r.velocity.toFixed(1) : '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number.isFinite(r.cover) ? `${Math.floor(r.cover)}d` : '∞'}
                  <span className="text-[10.5px] text-ink-400"> / {r.leadDays}d lead</span>
                </td>
                <td className="px-3 py-2 text-ink-600">
                  {r.reorderByIso ? (
                    <span className={new Date(r.reorderByIso) < now ? 'font-semibold text-danger-700' : ''}>
                      {r.reorderByIso.slice(0, 10)}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-900">{r.suggestedQty || '-'}</td>
                <td className="px-3 py-2 text-right">
                  {r.suggestedQty > 0 && (
                    <Link
                      href={`/products/${r.productId}`}
                      className="rounded-full bg-ink-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ink-800"
                    >
                      Reorder
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-400">
        Sales/day = recent-weighted channel sales · lead time = your manufacturer’s repeat-run lead (+{PROCESSING_BUFFER_DAYS}d
        processing) · suggested qty targets {TARGET_DAYS_OF_COVER} days of cover and already subtracts what’s in production.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="inline-flex items-center gap-2 font-display text-2xl font-bold text-ink-900">
          <TrendingUp className="h-5 w-5 text-pink-600" /> Stock &amp; replenishment
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-600">
          One shared inventory across every channel, with honest math on when to reorder so you never go dark.
        </p>
      </div>
      {children}
    </div>
  )
}
