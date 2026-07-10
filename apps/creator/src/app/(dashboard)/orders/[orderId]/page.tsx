// REBUILD R13.a — creator-side order detail page.
//
// Picks up the R10 timeline + R12 design vocabulary so the per-order page
// feels like a deeper version of the list it sits behind:
//
//   - Cream header band with brand / product title / status pill + meta
//   - Two-column body — dispatch timeline on the left, sticky right rail
//     with order totals + contextual actions (R12 pattern)
//   - CHANGES_REQUESTED → prominent banner inline + Adjust CTA promoted
//     to the top of the right-rail actions card
//   - Per-dispatch wide cards using the same R10 palette (DRAFT /
//     AWAITING_APPROVALS / IN_PRODUCTION / etc.) — manufacturer locked,
//     others get Re-route + Ask partner + View manifest footer rail
//   - Footer-style summary card with breakdown + reorder/help links

import Link from 'next/link'
import { prisma, getOrderSettings } from '@ilaunchify/db'
import {
  canCreatorSelfCancel,
  buildOrderTimeline,
  effectiveEta,
  type DispatchTimelineSource,
} from '@ilaunchify/orders'
import { OrderTimelineView } from '@ilaunchify/ui'
import { getCreatorTier, requireUser } from '@ilaunchify/auth'
import { creatorTierToPlanCode, hasFeature, CREATOR_FEATURES } from '@ilaunchify/plans'
import { notFound } from 'next/navigation'
// /pricing lives in apps/marketing (port 3010 in dev) — must use
// marketingUrl() for cross-app navigation; in-app <Link> 404s here.
import { marketingUrl } from '@/lib/marketing-url'
import {
  AlertOctagon,
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Lock,
  MessageSquare,
  Package,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react'
import { AdjustOrderButton } from './AdjustOrderButton'
import { CancelOrderButton } from './CancelOrderButton'
import { DisputeOrderButton } from './DisputeOrderButton'
import { DelayApprovalPrompt } from './DelayApprovalPrompt'
import { StoredStockPanel } from './StoredStockPanel'
import { getStoragePanelData } from './storage-panel-data'
import { ProofApprovalPanel, type CreatorProofRoundView } from './ProofApprovalPanel'
import { SampleVerdictCard } from './SampleVerdictCard'

export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------------
// Status vocabulary — mirrors R10 /orders palette so the list ↔ detail pages
// speak the same colour grammar.
// -----------------------------------------------------------------------------

type OrderStatusKey =
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

const ORDER_STATUS: Record<OrderStatusKey, StatusPalette> = {
  DRAFT:              { label: 'Draft',               bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7', dot: '#888780' },
  AWAITING_APPROVALS: { label: 'Awaiting approvals',  bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  IN_PRODUCTION:      { label: 'In production',       bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  CHANGES_REQUESTED:  { label: 'Changes requested',   bg: '#FAEEDA', fg: '#854F0B', border: '#FAC775', dot: '#BA7517' },
  REROUTING:          { label: 'Re-routing',          bg: '#FBEAF0', fg: '#72243E', border: '#F4C0D1', dot: '#D4537E' },
  SHIPPED:            { label: 'Shipped',             bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  DELIVERED:          { label: 'Delivered',           bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
  CANCELLED:          { label: 'Cancelled',           bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
}

type DispatchStatusKey =
  | 'PENDING_ACCEPT'
  | 'ACCEPTED'
  | 'CHANGES_REQUESTED'
  | 'PRODUCING'
  | 'QUALITY_CHECK'
  | 'READY'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'DECLINED'
  | 'TIMED_OUT'
  | 'WITHDRAWN'
  | 'CANCELLED'
  | 'FAILED_QC'

const DISPATCH_STATUS: Record<DispatchStatusKey, StatusPalette> = {
  PENDING_ACCEPT:    { label: 'Awaiting partner',   bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  ACCEPTED:          { label: 'Accepted',           bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  CHANGES_REQUESTED: { label: 'Needs your changes', bg: '#FAEEDA', fg: '#854F0B', border: '#FAC775', dot: '#BA7517' },
  PRODUCING:         { label: 'In production',      bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  QUALITY_CHECK:     { label: 'Quality check',      bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  READY:             { label: 'Ready to ship',      bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  SHIPPED:           { label: 'Shipped',            bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  IN_TRANSIT:        { label: 'In transit',         bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  DELIVERED:         { label: 'Delivered',          bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
  DECLINED:          { label: 'Partner declined',   bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
  TIMED_OUT:         { label: 'Partner timed out',  bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
  WITHDRAWN:         { label: 'Partner withdrew',   bg: '#FBEAF0', fg: '#72243E', border: '#F4C0D1', dot: '#D4537E' },
  CANCELLED:         { label: 'Cancelled',          bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7', dot: '#888780' },
  FAILED_QC:         { label: 'Failed QC',          bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
}

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturer',
  LABEL_PRINTING: 'Printer',
  COPACKING: 'Co-packer',
  WAREHOUSE: 'Fulfillment',
  ACCESSORY: 'Accessory partner',
}

const TYPE_ICON: Record<string, typeof Building2> = {
  PRODUCT: Building2,
  LABEL: Package,
  ACCESSORY: Building2,
}

const FIELD_LABEL: Record<string, string> = {
  quantity: 'Quantity',
  substrate: 'Substrate',
  packagingMaterial: 'Packaging material',
  finishes: 'Finishes',
  shipTo: 'Ship-to',
  leadTime: 'Lead time',
  other: 'Other',
}

const POST_ACCEPTED = new Set<DispatchStatusKey>([
  'ACCEPTED',
  'PRODUCING',
  'QUALITY_CHECK',
  'READY',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
])

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface ChangeRequest {
  flaggedFields: string[]
  partnerNote: string
  suggestedAlternatives?: Record<string, string>
  requestedAt: string
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  const user = await requireUser()
  // R16.a — resolve the Get-product-support gate through the data-driven
  // @ilaunchify/plans layer. Tier → plan code → feature lookup. Admin
  // can flip the row in /admin/tiers without a redeploy.
  const creatorTier = await getCreatorTier(user.id)
  const supportUnlocked = await hasFeature(
    creatorTierToPlanCode(creatorTier),
    CREATOR_FEATURES.PRODUCT_SUPPORT,
  )

  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    include: {
      brand: { select: { name: true } },
      items: {
        include: { product: { select: { id: true, name: true } } },
      },
      dispatches: {
        include: {
          partnerService: {
            include: { partner: { select: { companyName: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!order) notFound()

  const product = order.items[0]?.product
  const status = deriveOrderStatus(order)
  const palette = ORDER_STATUS[status]
  const aggregate = order.aggregateApprovalStatus ?? 'AWAITING_PARTNERS'
  const changeRequestedDispatches = order.dispatches.filter(
    (d) => d.status === 'CHANGES_REQUESTED',
  )
  const needsAdjust = changeRequestedDispatches.length > 0
  const isDelivered = status === 'DELIVERED'
  // Creator self-cancel eligibility — same shared rule the action enforces, so the
  // button and the action can't disagree.
  const cancellable = canCreatorSelfCancel(order).allowed

  // Creator can open a dispute on a delivered/completed order within
  // OrderSettings.disputeWindowDays of delivery.
  const orderSettings = await getOrderSettings()
  const isDisputed = order.status === 'DISPUTED'
  const disputable =
    ['DELIVERED', 'COMPLETED'].includes(order.status) &&
    (order.deliveredAt == null ||
      Date.now() - order.deliveredAt.getTime() <=
        orderSettings.disputeWindowDays * 24 * 60 * 60 * 1000)

  // SR-2.2 — sample verdict card data: printer name (when a separate print
  // leg exists), any existing verdict, and whether production already locked
  // it. SAMPLE orders only, once delivered.
  let sampleVerdictProps: {
    orderId: string
    productId: string
    printPartnerName: string | null
    initialProductVerdict: 'APPROVED' | 'REJECTED' | null
    initialPrintVerdict: 'APPROVED' | 'REJECTED' | null
    verdictLocked: boolean
  } | null = null
  if (order.orderType === 'SAMPLE' && isDelivered && product) {
    const [printSvc, verdict, producedCount] = await Promise.all([
      order.printProviderServiceId
        ? prisma.partnerService.findUnique({
            where: { id: order.printProviderServiceId },
            select: { partner: { select: { companyName: true } } },
          })
        : Promise.resolve(null),
      prisma.sampleVerdict
        .findUnique({
          where: { orderId: order.id },
          select: { productVerdict: true, printVerdict: true },
        })
        .catch(() => null),
      prisma.order.count({
        where: {
          creatorUserId: user.id,
          orderType: 'PRODUCTION',
          status: { notIn: ['CANCELLED'] },
          items: { some: { productId: product.id } },
        },
      }),
    ])
    sampleVerdictProps = {
      orderId: order.id,
      productId: product.id,
      printPartnerName: printSvc?.partner.companyName ?? null,
      initialProductVerdict: verdict?.productVerdict ?? null,
      initialPrintVerdict: verdict?.printVerdict ?? null,
      verdictLocked: producedCount > 0,
    }
  }

  // Phase L1.2a — stored orders carry a StorageAgreement; the panel data
  // (agreement + accrual + release history + default address) is assembled
  // server-side and handed to the client panel pre-serialized. P1 extends the
  // panel to FC-held stock (WAREHOUSE_PARTNER) — same agreement + release FSM,
  // worked from the FC's /outbound queue (docs/PARTNER_ROLE_ACCOUNTS.md §3.1.C).
  const storagePanel =
    order.shipToType === 'HOLD_AT_MANUFACTURER' || order.shipToType === 'WAREHOUSE_PARTNER'
      ? await getStoragePanelData(order.id, user.id)
      : null

  // P2 proof loop (D3) — proof rounds across this order's print job(s).
  const proofRounds: CreatorProofRoundView[] = (
    await prisma.proofRound.findMany({
      where: { orderDispatch: { orderId: order.id } },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        filename: true,
        status: true,
        annotation: true,
        createdAt: true,
      },
    })
  ).map((r) => ({
    id: r.id,
    version: r.version,
    filename: r.filename,
    status: r.status as string,
    annotation: r.annotation,
    createdAt: r.createdAt.toISOString(),
  }))

  // F — live production timeline (docs/EMAIL_NOTIFICATION_CENTER.md Part 3):
  // FSM state stamps + partner progress updates per dispatch, merged into one
  // running story.
  const progressByDispatch = await prisma.dispatchProgressUpdate.findMany({
    where: { dispatch: { orderId: order.id } },
    orderBy: { createdAt: 'asc' },
  })

  const timelineSources: DispatchTimelineSource[] = order.dispatches.map((d) => ({
    dispatchId: d.id,
    dispatchType: d.type,
    partnerName: d.partnerService.partner.companyName,
    createdAt: d.createdAt.toISOString(),
    acceptedAt: d.acceptedAt?.toISOString() ?? null,
    productionStartedAt: d.productionStartedAt?.toISOString() ?? null,
    qualityCheckStartedAt: d.qualityCheckStartedAt?.toISOString() ?? null,
    qualityCheckFailedAt: d.qualityCheckFailedAt?.toISOString() ?? null,
    readyAt: d.readyAt?.toISOString() ?? null,
    shippedAt: d.shippedAt?.toISOString() ?? null,
    inTransitAt: d.inTransitAt?.toISOString() ?? null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    declinedAt: d.declinedAt?.toISOString() ?? null,
    trackingCarrier: d.trackingCarrier,
    trackingNumber: d.trackingNumber,
    currentEtaAt: d.currentEtaAt?.toISOString() ?? null,
    progressUpdates: progressByDispatch
      .filter((u) => u.dispatchId === d.id)
      .map((u) => ({
        id: u.id,
        kind: u.kind,
        body: u.body,
        etaAt: u.etaAt?.toISOString() ?? null,
        photoAssetId: u.photoAssetId,
        milestone: u.milestone,
        authorName: u.authorName,
        createdAt: u.createdAt.toISOString(),
      })),
  }))
  const timelineEntries = buildOrderTimeline(timelineSources)
  // Order-level ETA: the latest running estimate across dispatches.
  const orderEta =
    timelineSources
      .map((s) => effectiveEta(s))
      .filter((e): e is string => e != null)
      .sort()
      .at(-1) ?? null

  return (
    <div className="space-y-6">
      {/* Cream header band — mirrors R10 list-card header */}
      <header className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3 text-[12px] text-ink-700">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-500 hover:text-ink-900"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" /> All orders
          </Link>
          <span className="h-3 w-px bg-ink-300" aria-hidden="true" />
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
            style={{
              background: palette.bg,
              color: palette.fg,
              borderColor: palette.border,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: palette.dot }}
            />
            {palette.label}
          </span>
          <span>
            <span className="text-ink-500">Order</span> &nbsp;{(order as { orderNumber?: string | null }).orderNumber ?? `#${order.id.slice(-8)}`}
          </span>
          <span className="ml-auto text-ink-500">
            Placed {new Date(order.createdAt).toLocaleDateString()}
          </span>
        </div>

        <div className="grid gap-3 px-5 py-5 sm:grid-cols-[1fr,auto] sm:items-end">
          <div className="min-w-0">
            <p className="text-[12px] uppercase tracking-[0.06em] text-ink-700">
              {order.brand.name}
            </p>
            <h1 className="mt-0.5 font-display text-ui-title text-ink-900">
              {product?.name ?? 'Order'}
            </h1>
            <p className="mt-1.5 text-[12.5px] text-ink-600">
              {order.dispatches.length === 0
                ? 'Dispatches will appear once payment processes and routing finds partners.'
                : `${order.dispatches.length} partner ${order.dispatches.length === 1 ? 'gate' : 'gates'} · ${humanAggregate(aggregate)}`}
            </p>
          </div>
        </div>
      </header>

      {/* Action-required banner on top of body when partners need adjustments */}
      {needsAdjust && product && (
        <ChangesRequestedBanner
          dispatches={changeRequestedDispatches.map((d) => ({
            id: d.id,
            type: d.type,
            partnerName: d.partnerService.partner.companyName,
            request: d.changeRequest as unknown as ChangeRequest | null,
          }))}
        />
      )}

      {/* Two-column body — dispatch timeline left, sticky rail right */}
      <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
        <div className="min-w-0 space-y-6">
        <section className="min-w-0 space-y-3">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
            Partner gates
          </h2>
          {order.dispatches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50/40 p-6 text-sm text-ink-500">
              Dispatches will appear here once payment processes and routing
              finds your partners.
            </div>
          ) : (
            order.dispatches.map((d) => {
              // Delay-accept proposal fields ship with a pending migration — cast.
              const dd = d as unknown as { proposedDeadlineAt: Date | null; delayProposedAt: Date | null; delayReason: string | null }
              return (
                <DispatchCard
                  key={d.id}
                  dispatch={{
                    id: d.id,
                    type: d.type,
                    status: d.status as DispatchStatusKey,
                    costCents: d.costCents,
                    acceptDeadlineAt: d.acceptDeadlineAt,
                    acceptedAt: d.acceptedAt,
                    productionStartedAt: d.productionStartedAt,
                    qualityCheckStartedAt: d.qualityCheckStartedAt,
                    qualityCheckFailedAt: d.qualityCheckFailedAt,
                    qualityCheckFailureNotes: d.qualityCheckFailureNotes,
                    readyAt: d.readyAt,
                    shippedAt: d.shippedAt,
                    inTransitAt: d.inTransitAt,
                    deliveredAt: d.deliveredAt,
                    trackingCarrier: d.trackingCarrier,
                    trackingNumber: d.trackingNumber,
                    serviceType: d.partnerService.type,
                    partnerName: d.partnerService.partner.companyName,
                    pendingDelay: dd.delayProposedAt != null && d.status === 'PENDING_ACCEPT',
                    proposedDeadlineAt: dd.proposedDeadlineAt,
                    delayReason: dd.delayReason,
                  }}
                />
              )
            })
          )}
        </section>

        {/* SR-2.2 — sample verdict: the moment that locks or reopens the
            production chain. Sample orders only, once delivered. */}
        {sampleVerdictProps && <SampleVerdictCard {...sampleVerdictProps} />}

        {/* Feedback module §5 — rate-your-partners nudge once delivered */}
        {isDelivered && (
          <Link
            href={`/orders/${order.id}/rate`}
            className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-[var(--bg-hero)] px-4 py-3 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-pink-700" aria-hidden="true" />
              <div>
                <div className="text-[13.5px] font-semibold text-ink-900">
                  How did your partners do?
                </div>
                <div className="text-[12px] text-ink-600">
                  Rate each partner + review your product — under a minute, shapes who wins work.
                </div>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white">
              Rate now
            </span>
          </Link>
        )}

        {/* F — live production timeline: FSM state stamps + partner progress
            updates (notes / revised ETAs / milestones) merged into one running
            story (docs/EMAIL_NOTIFICATION_CENTER.md Part 3). */}
        {timelineEntries.length > 0 && (
          <OrderTimelineView entries={timelineEntries} etaAt={orderEta} title="Production timeline" />
        )}

        {/* P2 proof loop (D3) — print-proof approval, when the print job has rounds */}
        {proofRounds.length > 0 && <ProofApprovalPanel rounds={proofRounds} />}

        {/* Phase L1.2a — stored-inventory panel + Release stock flow for
            HOLD_AT_MANUFACTURER orders (LOGISTICS_AND_FULFILLMENT §4/§9). */}
        {storagePanel && <StoredStockPanel data={storagePanel} />}
        </div>

        {/* Sticky right rail — totals + contextual actions */}
        <aside className="space-y-3 lg:sticky lg:top-[88px] lg:self-start">
          <ActionsCard
            productId={product?.id ?? null}
            orderId={order.id}
            needsAdjust={needsAdjust}
            isDelivered={isDelivered}
            cancellable={cancellable}
            disputable={disputable}
            isDisputed={isDisputed}
            supportUnlocked={supportUnlocked}
          />
          <TotalsCard
            order={{
              subtotalCents: order.subtotalCents,
              shippingCents: order.shippingCents,
              taxCents: order.taxCents,
              totalCents: order.totalCents,
              dispatchCount: order.dispatches.length,
            }}
          />
        </aside>
      </div>
    </div>
  )
}

// =============================================================================
// ChangesRequestedBanner — surfaces partner-flagged fields prominently
// =============================================================================

function ChangesRequestedBanner({
  dispatches,
}: {
  dispatches: Array<{
    id: string
    type: string
    partnerName: string
    request: ChangeRequest | null
  }>
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border-2 p-4"
      style={{
        background: '#FAEEDA',
        borderColor: '#BA7517',
      }}
    >
      <div className="flex items-start gap-2.5">
        <AlertOctagon
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          style={{ color: '#854F0B' }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold" style={{ color: '#5A3406' }}>
            {dispatches.length === 1
              ? 'A partner needs you to adjust this order'
              : `${dispatches.length} partners need you to adjust this order`}
          </h2>
          <p className="mt-1 text-[12.5px]" style={{ color: '#7C4A0E' }}>
            Open Adjust in the right rail to edit the flagged fields and
            resubmit — only the affected partner gates re-accept.
          </p>
          <div className="mt-3 space-y-2">
            {dispatches.map((d) => {
              if (!d.request) return null
              return (
                <div
                  key={d.id}
                  className="rounded-md border border-[#FAC775] bg-white/80 p-3"
                >
                  <p className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
                    {SERVICE_LABEL[d.type] ?? d.type} ·{' '}
                    <span className="text-ink-800">{d.partnerName}</span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.request.flaggedFields.map((f) => (
                      <span
                        key={f}
                        className="inline-flex rounded-full bg-[#FBEAF0] px-2 py-0.5 text-[10.5px] font-semibold text-[#72243E]"
                      >
                        {FIELD_LABEL[f] ?? f}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 rounded bg-ink-50 p-2 text-[12px] italic leading-snug text-ink-700">
                    &ldquo;{d.request.partnerNote}&rdquo;
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// DispatchCard — one per OrderDispatch, R10-style wide card
// =============================================================================

interface DispatchView {
  id: string
  type: string
  status: DispatchStatusKey
  costCents: number
  acceptDeadlineAt: Date
  // Per-state timestamps for the milestone timeline (B6 schema).
  acceptedAt: Date | null
  productionStartedAt: Date | null
  qualityCheckStartedAt: Date | null
  qualityCheckFailedAt: Date | null
  qualityCheckFailureNotes: string | null
  readyAt: Date | null
  shippedAt: Date | null
  inTransitAt: Date | null
  deliveredAt: Date | null
  trackingCarrier: string | null
  trackingNumber: string | null
  serviceType: string
  partnerName: string
  // Delay-accept (§7): the maker proposed a later delivery date awaiting the creator.
  pendingDelay: boolean
  proposedDeadlineAt: Date | null
  delayReason: string | null
}

function DispatchCard({ dispatch: d }: { dispatch: DispatchView }) {
  const palette = DISPATCH_STATUS[d.status]
  const Icon = TYPE_ICON[d.type] ?? Building2
  const serviceLabel = SERVICE_LABEL[d.serviceType] ?? d.serviceType
  // Manufacturer can't be re-routed — they own the recipe + production line.
  // Any other service (printer, copacker, warehouse) is replaceable.
  const isManufacturer = d.serviceType === 'MANUFACTURING'
  const isAccepted = POST_ACCEPTED.has(d.status)
  const isPending = d.status === 'PENDING_ACCEPT'
  const isFailure = ['DECLINED', 'TIMED_OUT', 'WITHDRAWN', 'FAILED_QC'].includes(d.status)
  const needsChange = d.status === 'CHANGES_REQUESTED'

  return (
    <article
      className={
        'overflow-hidden rounded-xl border bg-white ' +
        (needsChange ? 'border-[#FAC775] ring-1 ring-[#FAC775]/40' : 'border-ink-200')
      }
    >
      <header
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-ink-100 px-4 py-2.5 text-[12px] text-ink-700"
        style={{
          background: needsChange ? '#FDF6E8' : '#FAF8F2',
        }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
          style={{
            background: palette.bg,
            color: palette.fg,
            borderColor: palette.border,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: palette.dot }}
          />
          {palette.label}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-800">
          <Icon className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
          {serviceLabel}
        </span>
        {isManufacturer && (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-ink-500"
            title="The manufacturer is locked to this order — partner is set when production begins"
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
            Locked
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-ink-400">
          DSP-{d.id.slice(-6)}
        </span>
      </header>

      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
            Partner
          </p>
          <p className="mt-0.5 truncate text-[14px] font-semibold text-ink-900">
            {d.partnerName}
          </p>
          {isPending && d.pendingDelay && d.proposedDeadlineAt ? (
            <DelayApprovalPrompt
              dispatchId={d.id}
              proposedDeadlineAt={d.proposedDeadlineAt.toISOString()}
              delayReason={d.delayReason}
            />
          ) : isPending ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-ink-600">
              <Clock className="h-3 w-3 text-warning-700" aria-hidden="true" />
              Decision needed by{' '}
              {new Date(d.acceptDeadlineAt).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          ) : null}
          {isAccepted && <DispatchTimeline dispatch={d} />}
          {isFailure && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-danger-700">
              <AlertOctagon className="h-3 w-3" aria-hidden="true" />
              {palette.label} — re-routing kicked in automatically
            </p>
          )}
          {/* B6 — surface QC failure notes even when status is FAILED_QC
              so the creator knows what went wrong without DMing admin. */}
          {d.status === 'FAILED_QC' && d.qualityCheckFailureNotes && (
            <p className="mt-2 rounded-md bg-danger-50/60 px-2.5 py-1.5 text-[11.5px] text-danger-700">
              <span className="font-semibold">Failure note:</span>{' '}
              <span className="italic">{d.qualityCheckFailureNotes}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
            Cost
          </p>
          <p className="text-[15px] font-semibold tabular-nums text-ink-900">
            ${(d.costCents / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Footer action rail — same idea as R10 cards */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 bg-ink-50/50 px-5 py-2.5 text-[11.5px]">
        <button
          type="button"
          disabled
          title="Partner messaging is V1.1+"
          className="inline-flex items-center gap-1 text-ink-500 disabled:cursor-not-allowed"
        >
          <MessageSquare className="h-3 w-3" aria-hidden="true" />
          Ask partner
        </button>
        <Link
          href={`/orders/${d.id}/dispatch/${d.id}/manifest`}
          className="inline-flex items-center gap-1 text-ink-600 hover:text-ink-900"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          View manifest
        </Link>
        {!isManufacturer && !isAccepted && (
          <button
            type="button"
            disabled
            title="Manual re-route lands in V1.1 — auto re-route is already running"
            className="inline-flex items-center gap-1 text-ink-500 disabled:cursor-not-allowed"
          >
            <RefreshCcw className="h-3 w-3" aria-hidden="true" />
            Re-route
          </button>
        )}
      </footer>
    </article>
  )
}

// =============================================================================
// DispatchTimeline — vertical milestone list inside the dispatch card
// =============================================================================
//
// #108-next — surface the per-state timestamps the partner stamps as
// they advance: Accepted → Production → (QC) → Ready → Shipped →
// (In transit) → Delivered. QC and In Transit are optional beats — they
// only render when stamped. The most-recent completed step is the
// "current" one for visual emphasis (filled dot vs ring).
//
// Tracking carrier + number, when present on the SHIPPED step, render
// inline so the creator doesn't need to click into the dispatch detail
// to copy them.

function DispatchTimeline({ dispatch: d }: { dispatch: DispatchView }) {
  // Build the ordered milestone list. Each entry either has a
  // timestamp (= completed) or null (= not yet reached). We render only
  // the completed ones so the timeline grows visibly as the partner
  // advances — empty states would just be noise here.
  const steps: Array<{
    key: string
    label: string
    at: Date | null
    detail?: string | null
  }> = [
    { key: 'accepted', label: 'Accepted', at: d.acceptedAt },
    {
      key: 'producing',
      label: 'In production',
      at: d.productionStartedAt,
    },
    {
      key: 'qc',
      label: 'Quality check',
      at: d.qualityCheckStartedAt,
    },
    { key: 'ready', label: 'Ready to ship', at: d.readyAt },
    {
      key: 'shipped',
      label: 'Shipped',
      at: d.shippedAt,
      detail:
        d.trackingCarrier && d.trackingNumber
          ? `${d.trackingCarrier} · ${d.trackingNumber}`
          : d.trackingNumber ?? null,
    },
    { key: 'in_transit', label: 'In transit', at: d.inTransitAt },
    { key: 'delivered', label: 'Delivered', at: d.deliveredAt },
  ]

  const completed = steps.filter((s) => s.at != null)
  if (completed.length === 0) return null

  const lastIdx = completed.length - 1

  return (
    <ol className="mt-3 space-y-1.5 border-l border-ink-200 pl-3">
      {completed.map((step, idx) => {
        const isLast = idx === lastIdx
        return (
          <li
            key={step.key}
            className="relative flex items-baseline gap-2 text-[11.5px]"
          >
            <span
              className={
                'absolute -left-[15px] top-1.5 h-1.5 w-1.5 rounded-full ' +
                (isLast
                  ? 'bg-success-500 ring-2 ring-success-100'
                  : 'bg-success-300')
              }
              aria-hidden="true"
            />
            <span
              className={
                isLast ? 'font-semibold text-ink-900' : 'text-ink-700'
              }
            >
              {step.label}
            </span>
            <span className="text-ink-500">
              {new Date(step.at!).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {step.detail && (
              <span className="ml-1 truncate font-mono text-[10.5px] text-ink-500">
                · {step.detail}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// =============================================================================
// ActionsCard — sticky right-rail contextual actions
// =============================================================================

function ActionsCard({
  productId,
  orderId,
  needsAdjust,
  isDelivered,
  cancellable,
  disputable,
  isDisputed,
  supportUnlocked,
}: {
  productId: string | null
  orderId: string
  needsAdjust: boolean
  isDelivered: boolean
  cancellable: boolean
  disputable: boolean
  isDisputed: boolean
  supportUnlocked: boolean
}) {
  // R16.a — supportUnlocked is now resolved server-side through
  // @ilaunchify/plans' hasFeature(PRODUCT_SUPPORT) lookup, not a hardcoded
  // hasTier(creatorTier, 'builder') call. Admin flips the row in
  // /admin/tiers and this card honours it on the next reload.
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      {/* Adjust takes top spot when needed — that's the only action that
          actually moves the order forward in that state. */}
      {needsAdjust && productId ? (
        <div className="space-y-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#854F0B]">
            Needs your attention
          </p>
          <AdjustOrderButton productId={productId} orderId={orderId} />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
            What you can do
          </p>
          {isDelivered && productId && (
            <Link
              href={`/products/${productId}/checkout`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-neon-500 px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-ink-900 shadow-sm hover:bg-neon-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reorder
            </Link>
          )}
        </div>
      )}

      <div className="my-3 h-px bg-ink-100" />

      <ul className="space-y-2 text-[12.5px]">
        <li>
          <button
            type="button"
            disabled
            title="Partner messaging is V1.1+"
            className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-ink-500 disabled:cursor-not-allowed"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            Ask a partner
          </button>
        </li>
        <li>
          {/* Always available — opens a support ticket prefilled for this order. */}
          <Link
            href={`/help/new?category=order-issue&orderId=${orderId}`}
            className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Get order support
          </Link>
        </li>
        <li>
          {supportUnlocked ? (
            <Link
              href="/help"
              className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Get product support
            </Link>
          ) : (
            // V1.5-T6 — was: cross-app link to marketing /pricing?tier=builder.
            // Now: in-app /settings/plan where the upgrade actually happens
            // (one click → Stripe Checkout). marketingUrl() no longer needed
            // for this CTA.
            <Link
              href="/settings/plan?upgrade=builder"
              className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-pink-200 bg-pink-50/50 px-2 py-1.5 text-ink-700 hover:bg-pink-50 hover:text-ink-900"
              title="Concierge product support is included with Builder + Agency plans"
            >
              <span className="inline-flex items-center gap-2">
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Get product support
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-pink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-pink-700">
                <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                Builder
              </span>
            </Link>
          )}
        </li>
        {productId && (
          <li>
            <Link
              href={`/products/${productId}`}
              className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-ink-700 hover:bg-ink-50 hover:text-ink-900"
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              View product
            </Link>
          </li>
        )}
        {cancellable && (
          <li>
            <CancelOrderButton orderId={orderId} />
          </li>
        )}
        {disputable && (
          <li>
            <DisputeOrderButton orderId={orderId} />
          </li>
        )}
        {isDisputed && (
          <li>
            <span className="inline-flex w-full items-center gap-2 rounded-md bg-warning-50 px-2 py-1.5 text-[12px] font-medium text-warning-800">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Dispute under review
            </span>
          </li>
        )}
      </ul>
    </div>
  )
}

// =============================================================================
// TotalsCard — sticky right-rail order totals breakdown
// =============================================================================

function TotalsCard({
  order,
}: {
  order: {
    subtotalCents: number
    shippingCents: number
    taxCents: number
    totalCents: number
    dispatchCount: number
  }
}) {
  return (
    <div
      className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm"
      aria-labelledby="order-totals-heading"
    >
      <h3
        id="order-totals-heading"
        className="mb-3 text-[12px] font-bold uppercase tracking-widest text-ink-700"
      >
        Order totals
      </h3>
      <dl className="space-y-1.5 text-[13px]">
        <Line label={`Production × ${order.dispatchCount}`} value={order.subtotalCents} />
        <Line label="Shipping" value={order.shippingCents} dimmed={order.shippingCents === 0} />
        <Line label="Tax" value={order.taxCents} dimmed={order.taxCents === 0} />
      </dl>
      <div className="my-3 h-px bg-ink-100" />
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-ink-900">Total paid</span>
        <span className="font-display text-[18px] font-bold tabular-nums text-ink-900">
          ${(order.totalCents / 100).toFixed(2)}
        </span>
      </div>
      <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-ink-500">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Payment held until every partner accepts the manifest.
      </p>
    </div>
  )
}

function Line({
  label,
  value,
  dimmed,
}: {
  label: string
  value: number
  dimmed?: boolean
}) {
  return (
    <div
      className={
        'flex items-center justify-between gap-2 ' +
        (dimmed ? 'text-ink-400' : 'text-ink-700')
      }
    >
      <dt>{label}</dt>
      <dd className="font-medium tabular-nums">${(value / 100).toFixed(2)}</dd>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

interface OrderForStatus {
  status: string
  aggregateApprovalStatus: string | null
  dispatches: Array<{
    status: string
    partnerService: { type: string }
  }>
}

function deriveOrderStatus(o: OrderForStatus): OrderStatusKey {
  if (o.status === 'CANCELLED' || o.status === 'REFUNDED') return 'CANCELLED'
  if (o.aggregateApprovalStatus === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED'
  if (
    o.dispatches.some(
      (d) => d.status === 'WITHDRAWN' && d.partnerService.type !== 'MANUFACTURING',
    )
  ) {
    return 'REROUTING'
  }
  if (o.dispatches.length && o.dispatches.every((d) => d.status === 'DELIVERED')) {
    return 'DELIVERED'
  }
  if (o.dispatches.some((d) => ['SHIPPED', 'IN_TRANSIT'].includes(d.status))) {
    return 'SHIPPED'
  }
  if (
    o.dispatches.some((d) =>
      ['PRODUCING', 'QUALITY_CHECK', 'READY', 'ACCEPTED'].includes(d.status),
    )
  ) {
    return 'IN_PRODUCTION'
  }
  if (o.status === 'PENDING_PAYMENT') return 'DRAFT'
  return 'AWAITING_APPROVALS'
}

function humanAggregate(s: string): string {
  switch (s) {
    case 'AWAITING_PARTNERS':
      return 'Awaiting partner approvals'
    case 'PARTIALLY_ACCEPTED':
      return 'Some partners accepted'
    case 'CHANGES_REQUESTED':
      return 'Adjustments needed'
    case 'FULLY_ACCEPTED':
      return 'All partners approved · production starting'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return s
  }
}
