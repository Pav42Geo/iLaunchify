// REBUILD R10 — Creator orders, wide-card Amazon-style timeline.
//
// Mockup approved 2026-05-30. Each order renders as one card with:
//   - Header bar: status pill + order # + placed + total + Invoice/Manifest links
//   - Body: thumbnail + product name + units/packaging + ETA
//   - 4-segment phase progress bar (Approvals → Production → Shipping → Delivered)
//   - Per-dispatch rows (max 4 in list view, full list on detail page):
//       Manufacturer = locked from re-routing (production-locked rule),
//       other partners get a Re-route button
//       Dispatches in CHANGES_REQUESTED get amber background + Open revision CTA
//   - Footer rail: Ask partner / Get product support (Builder+ gated) /
//     View order details + last-update timestamp
//   - Delivered orders also show tracking #, warehouse origin, Reorder (neon)
//     + Leave seller feedback.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  Package,
  Coffee,
  Leaf,
  FileText,
  ClipboardList,
  MessageCircle,
  HelpCircle,
  Eye,
  RotateCw,
  MapPin,
  Clock,
  Truck,
  CircleCheck,
  Circle,
  AlertTriangle,
  Lock,
  Shuffle,
  ArrowRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders — iLaunchify' }

type StatusKey =
  | 'DRAFT'
  | 'AWAITING_APPROVALS'
  | 'CHANGES_REQUESTED'
  | 'REROUTING'
  | 'IN_PRODUCTION'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'

interface StatusPalette {
  label: string
  bg: string
  fg: string
  border: string
  dot: string
}

const STATUS: Record<StatusKey, StatusPalette> = {
  DRAFT: { label: 'Draft', bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7', dot: '#888780' },
  AWAITING_APPROVALS: { label: 'Awaiting approvals', bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  IN_PRODUCTION: { label: 'In production', bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  CHANGES_REQUESTED: { label: 'Changes requested', bg: '#FAEEDA', fg: '#854F0B', border: '#FAC775', dot: '#BA7517' },
  REROUTING: { label: 'Re-routing', bg: '#FBEAF0', fg: '#72243E', border: '#F4C0D1', dot: '#D4537E' },
  SHIPPED: { label: 'Shipped', bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  DELIVERED: { label: 'Delivered', bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
  CANCELLED: { label: 'Cancelled', bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
}

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturer',
  LABEL_PRINTING: 'Printer',
  COPACKING: 'Co-packer',
  WAREHOUSE: 'Fulfillment',
}

export default async function OrdersListPage() {
  const user = await requireUser()
  const orders = await prisma.order.findMany({
    where: { creatorUserId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      brand: { select: { name: true } },
      items: {
        include: { product: { select: { name: true, slug: true } } },
        take: 1,
      },
      dispatches: {
        orderBy: { createdAt: 'asc' },
        include: {
          partnerService: {
            select: {
              type: true,
              partner: { select: { companyName: true } },
            },
          },
        },
      },
    },
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Orders</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Production orders across all your brands. Tap an order for the full per-partner
          timeline.
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 p-12 text-center">
          <Package className="mx-auto h-7 w-7 text-zinc-400" />
          <p className="mt-3 text-sm text-zinc-600">
            No orders yet. Open a product and place your first production batch.
          </p>
          <Link
            href="/products"
            className="mt-2 inline-block text-sm font-medium text-pink-700 underline"
          >
            Go to products →
          </Link>
        </div>
      ) : (
        <div className="space-y-3.5">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Order Card
// -----------------------------------------------------------------------------

type OrderRow = Awaited<ReturnType<typeof loadOrders>>[number]
type DispatchRow = OrderRow['dispatches'][number]

async function loadOrders() {
  // Type-only helper so OrderRow above reflects the actual shape.
  return prisma.order.findMany({
    include: {
      brand: { select: { name: true } },
      items: { include: { product: { select: { name: true, slug: true } } }, take: 1 },
      dispatches: {
        include: {
          partnerService: {
            select: { type: true, partner: { select: { companyName: true } } },
          },
        },
      },
    },
  })
}

function OrderCard({ order: o }: { order: OrderRow }) {
  const status = deriveOrderStatus(o)
  const palette = STATUS[status]
  const product = o.items[0]?.product
  const productName = product?.name ?? 'Untitled product'
  const phase = derivePhase(o)
  // Top tracking — first dispatch with a tracking number wins for the list view.
  const tracking = o.dispatches.find((d) => d.trackingNumber)
  const delivered = status === 'DELIVERED'
  // 'Builder+' tier gate placeholder — wire to subscription tier when CreatorTier
  // is on the session shape.
  const tier = 'maker' as 'maker' | 'builder' | 'agency'
  const supportUnlocked = tier !== 'maker'

  return (
    <article
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
      data-order-id={o.id}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-[#F3EFE8] px-4 py-2.5 text-[12px] text-zinc-700">
        <StatusPill palette={palette} />
        <span>
          <span className="text-zinc-500">Order</span>{' '}
          <span className="font-mono text-[11.5px]">{shortId(o.id)}</span>
        </span>
        <span>
          <span className="text-zinc-500">Placed</span>{' '}
          {new Date(o.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        <span className="ml-auto flex gap-3 text-[12px] font-medium text-pink-700">
          <Link
            href={`/orders/${o.id}#invoice`}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" /> Invoice
          </Link>
          <Link
            href={`/orders/${o.id}#manifest`}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <ClipboardList className="h-3.5 w-3.5" /> Manifest v{o.dispatches[0]?.manifestVersion ?? 1}
          </Link>
        </span>
      </header>

      <div className="flex items-start gap-5 px-5 pb-2 pt-4">
        <Thumbnail name={productName} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium leading-tight text-zinc-900">
            {productName}
          </div>
          <div className="mt-0.5 text-[12.5px] text-zinc-500">
            {o.brand.name} · {totalUnits(o)} units
            {tracking?.deliveredAt
              ? ` · Delivered ${formatDate(tracking.deliveredAt)}`
              : phase < 4
                ? ` · ETA ${formatEta(o)}`
                : ''}
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center gap-1 text-[10.5px] uppercase tracking-[0.05em] text-zinc-500">
              {(['Approvals', 'Production', 'Shipping', 'Delivered'] as const).map(
                (lbl, i) => (
                  <span key={lbl} className={i + 1 <= phase ? 'text-zinc-700' : ''}>
                    {lbl}
                    {i < 3 && <span className="mx-1 text-zinc-300">·</span>}
                  </span>
                ),
              )}
            </div>
            <PhaseBar phase={phase} />
          </div>
        </div>

        {/* Prominent total column + breakdown disclosure. */}
        <TotalColumn order={o} />
      </div>

      {/* Per-dispatch rows */}
      <div className="space-y-1.5 px-5 pb-4 pt-3">
        {o.dispatches.slice(0, 4).map((d) => (
          <DispatchRowView key={d.id} d={d} orderId={o.id} />
        ))}
        {o.dispatches.length > 4 && (
          <Link
            href={`/orders/${o.id}`}
            className="block pt-1 text-[11.5px] text-pink-700 hover:underline"
          >
            +{o.dispatches.length - 4} more partner{o.dispatches.length - 4 === 1 ? '' : 's'} on detail →
          </Link>
        )}
      </div>

      {/* Footer action rail */}
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-200 bg-[#FBFAF7] px-4 py-2.5 text-[12px]">
        <ActionLink href={`/orders/${o.id}#thread`} icon={MessageCircle}>
          Ask partner
        </ActionLink>
        <Sep />
        <ActionLink
          href={supportUnlocked ? `/orders/${o.id}#support` : '/settings/billing'}
          icon={HelpCircle}
        >
          Get product support
          {!supportUnlocked && (
            <span className="ml-1 rounded bg-[#FBEAF0] px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-[#72243E]">
              Builder+
            </span>
          )}
        </ActionLink>
        <Sep />
        <ActionLink href={`/orders/${o.id}`} icon={Eye}>
          View order details
        </ActionLink>
        {delivered && (
          <>
            <Sep />
            <ActionLink href={`/orders/${o.id}#review`} icon={MessageCircle}>
              Leave seller feedback
            </ActionLink>
          </>
        )}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500">
          {tracking?.trackingNumber && (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3 w-3" />
              <span className="font-medium text-zinc-700">{tracking.trackingCarrier ?? 'Carrier'}</span>
              <span className="font-mono">{tracking.trackingNumber}</span>
            </span>
          )}
          <span>Last update {formatRelative(o.updatedAt)}</span>
          {delivered && (
            <Link
              href={`/checkout?adjust=${o.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-[#B5FF3D] px-3 py-1.5 text-[12px] font-medium text-zinc-900 hover:bg-[#9be62a]"
            >
              <RotateCw className="h-3.5 w-3.5" /> Reorder
            </Link>
          )}
        </span>
      </footer>
    </article>
  )
}

// -----------------------------------------------------------------------------
// Subcomponents
// -----------------------------------------------------------------------------

// TotalColumn — prominent right-aligned price block with an expandable
// breakdown disclosure. Sits next to the thumbnail/name in the body
// row so the total is the second thing the eye lands on after the
// product name.
function TotalColumn({ order: o }: { order: OrderRow }) {
  const total = o.totalCents / 100
  const subtotal = o.subtotalCents / 100
  const shipping = o.shippingCents / 100
  const tax = o.taxCents / 100
  // Platform fee = whatever's left of total after the explicit lines.
  const platformFee =
    (o.totalCents - o.subtotalCents - o.shippingCents - o.taxCents) / 100
  const unitCount = totalUnits(o)
  const perUnit = unitCount > 0 ? total / unitCount : 0

  // Per-partner production breakdown (sums to subtotal).
  const partnerBreakdown = o.dispatches.map((d) => ({
    label: SERVICE_LABEL[d.partnerService.type] ?? d.partnerService.type,
    partner: d.partnerService.partner.companyName,
    amount: d.costCents / 100,
  }))

  return (
    <div className="flex w-[180px] flex-shrink-0 flex-col items-end">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-zinc-500">
        Total
      </div>
      <div className="font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-zinc-900 tabular-nums">
        ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      {unitCount > 0 && (
        <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">
          ${perUnit.toFixed(2)} / unit
        </div>
      )}

      <details className="group mt-2 w-full">
        <summary className="flex cursor-pointer list-none items-center justify-end gap-1 text-[11.5px] font-medium text-pink-700 hover:underline">
          See breakdown
          <span className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <dl className="mt-2 w-full rounded-md border border-zinc-200 bg-[#FBFAF7] px-3 py-2 text-[11.5px]">
          {partnerBreakdown.length > 0 && (
            <>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
                Production
              </div>
              {partnerBreakdown.map((p, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 py-[2px]">
                  <dt className="min-w-0 truncate text-zinc-700">
                    <span className="text-zinc-500">{p.label}</span> · {p.partner}
                  </dt>
                  <dd className="tabular-nums text-zinc-900">${p.amount.toFixed(2)}</dd>
                </div>
              ))}
              <div className="my-1.5 h-px bg-zinc-200" />
            </>
          )}
          <Row label="Subtotal" amount={subtotal} />
          <Row label="Shipping" amount={shipping} />
          <Row label="Tax" amount={tax} />
          {platformFee > 0.005 && <Row label="Platform fee" amount={platformFee} />}
          <div className="my-1.5 h-px bg-zinc-300" />
          <div className="flex items-baseline justify-between gap-3 py-[2px]">
            <dt className="font-semibold text-zinc-900">Total</dt>
            <dd className="font-semibold tabular-nums text-zinc-900">${total.toFixed(2)}</dd>
          </div>
        </dl>
      </details>
    </div>
  )
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[2px]">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="tabular-nums text-zinc-900">${amount.toFixed(2)}</dd>
    </div>
  )
}

function StatusPill({ palette }: { palette: StatusPalette }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
      style={{ background: palette.bg, color: palette.fg, borderColor: palette.border }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: palette.dot }}
      />
      {palette.label}
    </span>
  )
}

function PhaseBar({ phase }: { phase: number }) {
  const segments = [1, 2, 3, 4].map((n) => {
    const filled = n <= phase
    const isLast = n === phase
    return (
      <div
        key={n}
        className="flex-1"
        style={{
          background: filled
            ? isLast && phase < 4
              ? '#BA7517' /* amber on currently-in-progress */
              : '#0F6E56' /* emerald on complete */
            : '#F1EFE8',
        }}
      />
    )
  })
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full" role="progressbar">
      {segments}
    </div>
  )
}

function DispatchRowView({ d, orderId }: { d: DispatchRow; orderId: string }) {
  const role = SERVICE_LABEL[d.partnerService.type] ?? d.partnerService.type
  const partnerName = d.partnerService.partner.companyName
  const isManufacturer = d.partnerService.type === 'MANUFACTURING'
  const needsChanges = d.status === 'CHANGES_REQUESTED'
  const accepted = ['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK', 'READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(
    d.status,
  )

  if (needsChanges) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-[#FAC775] bg-[#FAEEDA] px-3 py-2 text-[12.5px]">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[#854F0B]" />
        <span className="min-w-[6rem] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#854F0B]">
          {role}
        </span>
        <span className="flex-1 truncate text-zinc-900">
          <strong className="font-medium">{partnerName}</strong>{' '}
          <span className="text-[#854F0B]">needs a label revision before they can run</span>
        </span>
        <Link
          href={`/checkout?adjust=${orderId}`}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-[11.5px] font-medium text-white hover:bg-zinc-800"
        >
          Open revision <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  const Icon = accepted ? CircleCheck : Circle
  const iconCls = accepted ? 'text-emerald-700' : 'text-zinc-400'

  return (
    <div className="flex items-center gap-3 rounded-lg bg-[#FBFAF7] px-3 py-2 text-[12.5px]">
      <Icon className={`h-4 w-4 flex-shrink-0 ${iconCls}`} />
      <span className="min-w-[6rem] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-zinc-500">
        {role}
      </span>
      <span className="flex-1 truncate text-zinc-900">{partnerName}</span>
      <DispatchStatusLabel status={d.status} />
      {isManufacturer ? (
        <span
          className="flex-shrink-0 p-1 text-zinc-400"
          title="Manufacturer can't be re-routed once production starts"
          aria-label="Manufacturer locked"
        >
          <Lock className="h-3.5 w-3.5" />
        </span>
      ) : !['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(d.status) ? (
        <button
          type="button"
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-[3px] text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Shuffle className="h-3 w-3" /> Re-route
        </button>
      ) : null}
    </div>
  )
}

function DispatchStatusLabel({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING_ACCEPT: { label: 'Awaiting', cls: 'text-zinc-500' },
    ACCEPTED: { label: 'Approved', cls: 'text-emerald-700 font-medium' },
    PRODUCING: { label: 'Producing', cls: 'text-blue-700 font-medium' },
    QUALITY_CHECK: { label: 'QC', cls: 'text-blue-700 font-medium' },
    READY: { label: 'Ready', cls: 'text-emerald-700 font-medium' },
    SHIPPED: { label: 'Shipped', cls: 'text-emerald-700 font-medium' },
    IN_TRANSIT: { label: 'In transit', cls: 'text-emerald-700 font-medium' },
    DELIVERED: { label: 'Delivered', cls: 'text-emerald-800 font-medium' },
    DECLINED: { label: 'Declined', cls: 'text-pink-700 font-medium' },
    TIMED_OUT: { label: 'Timed out', cls: 'text-pink-700 font-medium' },
    WITHDRAWN: { label: 'Withdrew', cls: 'text-pink-700 font-medium' },
    CANCELLED: { label: 'Cancelled', cls: 'text-zinc-500' },
    FAILED_QC: { label: 'QC failed', cls: 'text-pink-700 font-medium' },
  }
  const m = map[status] ?? { label: status, cls: 'text-zinc-500' }
  return <span className={`text-[12px] ${m.cls}`}>{m.label}</span>
}

function ActionLink({
  href,
  icon: Icon,
  children,
}: {
  href: string
  icon: typeof MessageCircle
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-pink-700 hover:underline"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  )
}

function Sep() {
  return <span className="text-zinc-300">·</span>
}

function Thumbnail({ name }: { name: string }) {
  // Pick a deterministic icon + gradient by hashing the product name so
  // visually-consistent across renders without needing an uploaded image.
  const h = simpleHash(name)
  const gradients = [
    'linear-gradient(135deg,#F4C0D1 0%,#D4537E 100%)',
    'linear-gradient(135deg,#9FE1CB 0%,#0F6E56 100%)',
    'linear-gradient(135deg,#FAC775 0%,#BA7517 100%)',
    'linear-gradient(135deg,#CECBF6 0%,#534AB7 100%)',
  ]
  const icons = [Coffee, Leaf, Package, Truck]
  const Icon = icons[h % icons.length]!
  return (
    <div
      className="flex h-[68px] w-[68px] flex-shrink-0 items-center justify-center rounded-xl"
      style={{ background: gradients[h % gradients.length] }}
    >
      <Icon className="h-7 w-7 text-white" />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function deriveOrderStatus(o: OrderRow): StatusKey {
  if (o.status === 'CANCELLED' || o.status === 'REFUNDED') return 'CANCELLED'
  if (o.aggregateApprovalStatus === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED'
  if (o.dispatches.some((d) => d.status === 'WITHDRAWN' && d.partnerService.type !== 'MANUFACTURING')) {
    return 'REROUTING'
  }
  if (o.dispatches.length && o.dispatches.every((d) => d.status === 'DELIVERED')) {
    return 'DELIVERED'
  }
  if (o.dispatches.some((d) => ['SHIPPED', 'IN_TRANSIT'].includes(d.status))) {
    return 'SHIPPED'
  }
  if (o.dispatches.some((d) => ['PRODUCING', 'QUALITY_CHECK', 'READY', 'ACCEPTED'].includes(d.status))) {
    return 'IN_PRODUCTION'
  }
  if (o.status === 'PENDING_PAYMENT') return 'DRAFT'
  return 'AWAITING_APPROVALS'
}

function derivePhase(o: OrderRow): number {
  if (o.dispatches.length && o.dispatches.every((d) => d.status === 'DELIVERED')) return 4
  if (o.dispatches.some((d) => ['SHIPPED', 'IN_TRANSIT'].includes(d.status))) return 3
  if (o.dispatches.some((d) => ['PRODUCING', 'QUALITY_CHECK', 'READY'].includes(d.status))) return 2
  return 1
}

function totalUnits(o: OrderRow): number {
  return o.items.reduce((acc, it) => acc + (it.quantity ?? 0), 0)
}

function shortId(id: string): string {
  return 'ORD-' + id.slice(-8).toUpperCase()
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatEta(o: OrderRow): string {
  // Naive ETA — placed + 21 days. Real ETA computation lives on the
  // detail page where we have per-dispatch lead times.
  const eta = new Date(o.createdAt)
  eta.setDate(eta.getDate() + 21)
  return formatDate(eta)
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
  return formatDate(d)
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
