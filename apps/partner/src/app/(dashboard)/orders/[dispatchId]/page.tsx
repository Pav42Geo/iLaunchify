// Partner production-dispatch detail.
//
// Partner-v2 surface (Pavel 2026-06-05): cream hero + live status pill +
// accept-deadline urgency + a horizontal production-stage tracker driven by
// the real per-state timestamps (B6), a product/payout panel, a vertical
// event timeline, and a tracking panel. The action rail (DispatchActions),
// change-request card and production manifest are unchanged.

import { prisma, isLogisticsEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ClipboardCheck,
  Factory,
  FlaskConical,
  PackageCheck,
  Truck,
  MapPin,
  Clock,
  AlertTriangle,
  Check,
  Package,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import { DispatchActions } from './DispatchActions'
import { ProductionManifestView, RolePacketView } from '@ilaunchify/ui'
import { ChangeRequestCard } from './ChangeRequestCard'
import { DisputeResponsePanel } from './DisputeResponsePanel'
import { ShipRequirementsCard, type ShipDocRowView, type UploadedShipDoc } from './ShipRequirementsCard'
import { PrintJobCard, type PrintOutputSpecView } from './PrintJobCard'
import { WorkOrderCard, type ComponentLegView } from './WorkOrderCard'
import { ProofPanel, type ProofRoundView } from './ProofPanel'
import { isProofRequired } from './proof-actions'
import { ProductionLotsCard, type ProductionLotView } from './ProductionLotsCard'
import { StorageReleasesCard, type StorageReleaseView } from './StorageReleasesCard'
// F — job-progress capture (docs/EMAIL_NOTIFICATION_CENTER.md Part 3)
import { ProgressUpdatePanel } from './ProgressUpdatePanel'
import { listProgressUpdates } from './progress-actions'
import { getDispatchShippingContext } from './ship-requirements'
import { SHIP_DOC_LABELS, PARTNER_UPLOADED_DOC_TYPES } from '@ilaunchify/shipping'
import type { ProductionManifest } from '@ilaunchify/orders'
import { serviceOwnedBy } from '@/lib/partner-context'

export const dynamic = 'force-dynamic'

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  PENDING_ACCEPT: { label: 'Awaiting your acceptance', cls: 'border-pink-200 bg-pink-50 text-pink-800' },
  CHANGES_REQUESTED: { label: 'Changes requested', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
  ACCEPTED: { label: 'Accepted', cls: 'border-info-200 bg-info-50 text-info-800' },
  PRODUCING: { label: 'In production', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
  QUALITY_CHECK: { label: 'Quality check', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
  READY: { label: 'Ready to ship', cls: 'border-success-200 bg-success-50 text-success-800' },
  SHIPPED: { label: 'Shipped', cls: 'border-info-200 bg-info-50 text-info-800' },
  IN_TRANSIT: { label: 'In transit', cls: 'border-info-200 bg-info-50 text-info-800' },
  DELIVERED: { label: 'Delivered', cls: 'border-success-200 bg-success-50 text-success-800' },
  DECLINED: { label: 'Declined · rerouted', cls: 'border-danger-200 bg-danger-50 text-danger-800' },
  TIMED_OUT: { label: 'Auto-declined · timed out', cls: 'border-danger-200 bg-danger-50 text-danger-800' },
  CANCELLED: { label: 'Cancelled', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
}

const TERMINAL = new Set(['DECLINED', 'TIMED_OUT', 'CANCELLED'])

export default async function DispatchDetailPage({
  params,
}: {
  params: Promise<{ dispatchId: string }>
}) {
  const user = await requireUser()

  const dispatch = await prisma.orderDispatch.findFirst({
    where: {
      id: (await params).dispatchId,
      partnerService: serviceOwnedBy(user.id),
    },
    include: {
      order: {
        include: {
          brand: true,
          items: { include: { product: { include: { recipe: true } } } },
        },
      },
      partnerService: true,
    },
  })
  if (!dispatch) notFound()

  // Open quality dispute on this order (cast-guarded — OrderDispute is a
  // pending-migration model). Surfaces a respond panel so the partner can add
  // their side. Fail-safe to null so it never breaks the page.
  const openDispute = await (
    prisma as unknown as {
      orderDispute: {
        findFirst: (a: unknown) => Promise<{
          id: string
          category: string
          description: string
          partnerResponse: string | null
        } | null>
      }
    }
  ).orderDispute
    .findFirst({
      where: { orderId: dispatch.order.id, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      select: { id: true, category: true, description: true, partnerResponse: true },
    })
    .catch(() => null)

  const item = dispatch.order.items[0]
  const pill = STATUS_PILL[dispatch.status] ?? { label: dispatch.status, cls: 'border-ink-200 bg-ink-100 text-ink-700' }
  const isProduct = dispatch.type === 'PRODUCT'
  const isLabel = dispatch.type === 'LABEL'
  const isCopack = (dispatch.type as string) === 'COPACKING'

  // ---- P2 role skins (docs/PARTNER_ROLE_ACCOUNTS.md §3.2/§3.3) -------------
  // LABEL → print contract + artwork gate; COPACKING → component readiness
  // from the sibling legs of the same order's workflow graph.
  const printSpec: PrintOutputSpecView | null = isLabel
    ? await prisma.partnerPrintOutputSpec
        .findUnique({
          where: { partnerServiceId: dispatch.partnerServiceId },
          select: {
            preferredFileFormat: true,
            colorSpace: true,
            iccProfile: true,
            tacLimitPct: true,
            spotColorsAccepted: true,
            minDpi: true,
            bleedMm: true,
            fontPolicy: true,
            dielineDeliveryFormat: true,
            dielineLayerName: true,
          },
        })
        .then((s) =>
          s
            ? {
                ...s,
                preferredFileFormat: s.preferredFileFormat as string,
                colorSpace: s.colorSpace as string,
                fontPolicy: s.fontPolicy as string,
                dielineDeliveryFormat: s.dielineDeliveryFormat as string,
                bleedMm: String(s.bleedMm),
              }
            : null,
        )
    : null
  const componentLegs: ComponentLegView[] = isCopack
    ? (
        await prisma.orderDispatch.findMany({
          where: { orderId: dispatch.order.id, id: { not: dispatch.id } },
          select: { id: true, type: true, status: true, shippedAt: true, deliveredAt: true },
          orderBy: { createdAt: 'asc' },
        })
      ).map((d) => ({
        id: d.id,
        type: d.type as string,
        status: d.status as string,
        shippedAt: d.shippedAt?.toISOString() ?? null,
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
      }))
    : []

  // P2 proof loop (D3) — rounds + requirement for LABEL jobs.
  const proofRounds: ProofRoundView[] = isLabel
    ? (
        await prisma.proofRound.findMany({
          where: { orderDispatchId: dispatch.id },
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            filename: true,
            status: true,
            annotation: true,
            createdAt: true,
            decidedAt: true,
            assetId: true,
          },
        })
      ).map((r) => ({
        id: r.id,
        version: r.version,
        filename: r.filename,
        status: r.status as string,
        annotation: r.annotation,
        createdAt: r.createdAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
        url: `/api/ship-doc/${r.assetId}`, // proofs are PartnerFiles — same guarded route
      }))
    : []
  const proofRequired = isLabel
    ? await isProofRequired({
        id: dispatch.id,
        type: dispatch.type as string,
        partnerServiceId: dispatch.partnerServiceId,
        order: { creatorUserId: dispatch.order.creatorUserId },
      })
    : false
  const proofCanUpload = ['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK'].includes(dispatch.status)

  // P2 lot traceability — output-lot records on producing dispatches (§3.2.B).
  const productionLots: ProductionLotView[] = !isLabel
    ? (
        await prisma.productionLot.findMany({
          where: { orderDispatchId: dispatch.id },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            lotNumber: true,
            expiryAt: true,
            unitsProduced: true,
            unitsExpected: true,
            scrapReason: true,
            ingredientLotsJson: true,
          },
        })
      ).map((l) => ({
        id: l.id,
        lotNumber: l.lotNumber,
        expiryAt: l.expiryAt?.toISOString() ?? null,
        unitsProduced: l.unitsProduced,
        unitsExpected: l.unitsExpected,
        scrapReason: l.scrapReason,
        ingredientLots: Array.isArray(l.ingredientLotsJson)
          ? (l.ingredientLotsJson as { ingredientName: string; supplierLot: string }[])
          : [],
      }))
    : []
  const canRecordLots =
    !isLabel &&
    ['PRODUCING', 'QUALITY_CHECK', 'READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(dispatch.status)

  const eyebrow = isCopack
    ? 'Co-packing · Work order'
    : isLabel
      ? 'Print production · Print job'
      : 'Manufacturing · Production dispatch'
  const titleFallback = isCopack ? 'Work order' : isLabel ? 'Print job' : 'Production dispatch'

  // ---- Phase L1.1b — shipping requirements + doc gate ----------------------
  // Computed once server-side and shared with the action rail; the shipDispatch
  // action re-runs the same gate (never trust the client). Only relevant once
  // the dispatch is accepted and until it's delivered.
  const SHIP_CONTEXT_STATUSES = new Set([
    'ACCEPTED',
    'PRODUCING',
    'QUALITY_CHECK',
    'READY',
    'SHIPPED',
    'IN_TRANSIT',
    'DELIVERED',
  ])
  const shippingCtx = SHIP_CONTEXT_STATUSES.has(dispatch.status)
    ? await getDispatchShippingContext(dispatch.id)
    : null

  const canUploadShipDocs = shippingCtx !== null
  // Evidence lock — no deletes once the goods have physically shipped.
  const canDeleteShipDocs =
    shippingCtx !== null && !['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(dispatch.status)

  const toUploadedDoc = (d: NonNullable<typeof shippingCtx>['documents'][number]): UploadedShipDoc => ({
    id: d.id,
    filename: d.filename ?? 'document',
    url: `/api/ship-doc/${d.assetId}`,
    lotNumbers: d.lotNumbers,
    uploadedAt: d.createdAt.toISOString(),
  })
  const shipDocRows: ShipDocRowView[] = shippingCtx
    ? shippingCtx.gate.required.map((type) => ({
        type,
        label: SHIP_DOC_LABELS[type],
        gating: PARTNER_UPLOADED_DOC_TYPES.includes(type),
        requiresLotNumbers: type === 'COA',
        uploaded: shippingCtx.documents.filter((d) => d.type === type).map(toUploadedDoc),
      }))
    : []
  const qcPhotos: UploadedShipDoc[] = shippingCtx
    ? shippingCtx.documents.filter((d) => d.type === 'QC_PHOTO').map(toUploadedDoc)
    : []

  // ---- Phase L2a — platform label purchase gate ----------------------------
  // Visible only when the EasyPost rail is admin-enabled AND the env key is
  // configured (presence checked HERE server-side — the key itself never
  // reaches the client) AND the doc gate passes. label-actions.ts re-checks
  // all of this server-side on every call; this boolean is UX only.
  const platformLabelEnabled =
    dispatch.status === 'READY' &&
    shippingCtx?.gate.canShip === true &&
    Boolean(process.env.EASYPOST_API_KEY) &&
    (await isLogisticsEnabled('carrier:easypost'))

  // ---- Phase L1.2a — storage releases (HOLD_AT_MANUFACTURER) ---------------
  // The card renders only when this dispatch belongs to the STORING service —
  // enforced by the partnerServiceId match in the query (a co-dispatched
  // printer never sees the storage queue), on top of the ownership guard the
  // dispatch query already ran.
  const storageAgreement =
    dispatch.order.shipToType === 'HOLD_AT_MANUFACTURER'
      ? await prisma.storageAgreement.findFirst({
          where: { orderId: dispatch.order.id, partnerServiceId: dispatch.partnerServiceId },
          include: { releases: { orderBy: { createdAt: 'desc' } } },
        })
      : null
  const storageReleases: StorageReleaseView[] = (storageAgreement?.releases ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    quantity: r.quantity,
    destinationSummary: summarizeReleaseDestination(r.destinationJson),
    tracking: summarizeReleaseTracking(r.destinationJson),
    requestedAt: r.createdAt.toISOString(),
  }))

  // ---- Production-stage tracker -------------------------------------------
  // Drive "done" purely from the per-state timestamps so a skipped QC still
  // lights up as the batch passed through to READY.
  const stages: { key: string; label: string; at: Date | null; icon: LucideIcon }[] = [
    { key: 'accepted', label: 'Accepted', at: dispatch.acceptedAt, icon: ClipboardCheck },
    {
      key: 'producing',
      label: isLabel ? 'Printing' : isCopack ? 'Filling & assembly' : 'In production',
      at: dispatch.productionStartedAt,
      icon: Factory,
    },
    {
      key: 'qc',
      label: isLabel ? 'Finishing & QC' : 'Quality check',
      at: dispatch.qualityCheckStartedAt,
      icon: FlaskConical,
    },
    { key: 'ready', label: 'Ready to ship', at: dispatch.readyAt, icon: PackageCheck },
    { key: 'shipped', label: 'Shipped', at: dispatch.shippedAt, icon: Truck },
    { key: 'delivered', label: 'Delivered', at: dispatch.deliveredAt, icon: MapPin },
  ]
  let lastDone = -1
  stages.forEach((s, i) => {
    if (s.at) lastDone = Math.max(lastDone, i)
  })
  const halted = TERMINAL.has(dispatch.status) || !!dispatch.withdrawnAt || !!dispatch.qualityCheckFailedAt
  const currentIndex = halted ? -1 : lastDone + 1 // first not-yet-done stage

  // Accept-deadline urgency (PENDING_ACCEPT only)
  const now = Date.now()
  const deadlineMs = new Date(dispatch.acceptDeadlineAt).getTime()
  const hrsLeft = Math.round((deadlineMs - now) / 3_600_000)
  const overdue = hrsLeft < 0

  return (
    <div className="space-y-6">
      {/* Cream hero */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              {eyebrow}
            </p>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              {item?.product.name ?? titleFallback}
              <span className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider ${pill.cls}`}>
                {pill.label}
              </span>
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-600">
              Order <span className="font-medium text-ink-800">{(dispatch.order as { orderNumber?: string | null }).orderNumber ?? `#${dispatch.order.id.slice(-8)}`}</span>
              {' · '}Brand <span className="font-medium text-ink-800">{dispatch.order.brand.name}</span>
              {' · '}Created {fmtDate(dispatch.createdAt)}
            </p>
          </div>
          <Link
            href="/orders"
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All orders
          </Link>
        </div>

        {/* Accept-deadline urgency banner */}
        {dispatch.status === 'PENDING_ACCEPT' && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-medium ${
              overdue
                ? 'border-danger-200 bg-danger-50 text-danger-800'
                : hrsLeft <= 6
                  ? 'border-warning-200 bg-warning-50 text-warning-800'
                  : 'border-ink-200 bg-white text-ink-700'
            }`}
          >
            <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {overdue ? (
              <span>Accept window passed {fmtDate(dispatch.acceptDeadlineAt)} — this may auto-reroute soon.</span>
            ) : (
              <span>
                Respond within <span className="font-semibold tabular-nums">{hrsLeft}h</span> · accept deadline{' '}
                {fmtDate(dispatch.acceptDeadlineAt)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Production-stage tracker */}
      <ProductionTracker
        stages={stages}
        lastDone={lastDone}
        currentIndex={currentIndex}
        halted={halted}
        haltLabel={
          dispatch.qualityCheckFailedAt
            ? 'Quality check failed'
            : dispatch.withdrawnAt
              ? 'Withdrawn after acceptance'
              : dispatch.status === 'TIMED_OUT'
                ? 'Auto-declined (no response in time)'
                : dispatch.status === 'DECLINED'
                  ? 'Declined — order rerouted'
                  : dispatch.status === 'CANCELLED'
                    ? 'Cancelled'
                    : 'Halted'
        }
        haltNotes={dispatch.qualityCheckFailureNotes ?? dispatch.withdrawReason ?? dispatch.declineNotes ?? null}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,340px]">
        <div className="space-y-6">
          {/* Quality dispute — partner's response panel (B.1) */}
          {openDispute && (
            <DisputeResponsePanel
              disputeId={openDispute.id}
              category={openDispute.category}
              description={openDispute.description}
              existingResponse={openDispute.partnerResponse}
            />
          )}

          {/* P2 role skins — print contract / component readiness */}
          {isLabel && <PrintJobCard spec={printSpec} status={dispatch.status} />}
          {isLabel && (proofRequired || proofRounds.length > 0) && (
            <ProofPanel
              dispatchId={dispatch.id}
              required={proofRequired}
              rounds={proofRounds}
              canUpload={proofCanUpload}
            />
          )}
          {isCopack && <WorkOrderCard components={componentLegs} />}
          {!isLabel && (canRecordLots || productionLots.length > 0) && (
            <ProductionLotsCard dispatchId={dispatch.id} lots={productionLots} canRecord={canRecordLots} />
          )}

          {/* F — job-progress capture: notes / revised ETA / milestones → creator timeline */}
          <ProgressUpdatePanel
            dispatchId={dispatch.id}
            canPost={['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK', 'READY', 'SHIPPED', 'IN_TRANSIT'].includes(dispatch.status)}
            currentEtaAt={dispatch.currentEtaAt?.toISOString() ?? null}
            updates={await listProgressUpdates(dispatch.id)}
          />

          {/* Product + payout */}
          <section className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
              <Package className="h-4 w-4 text-ink-500" aria-hidden="true" /> Product & payout
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field label="Product" value={item?.product.name} />
              <Field label="Category" value={item?.product.category} />
              <Field label="Quantity" value={item ? `${item.quantity.toLocaleString()} units` : '—'} />
              <Field
                label="Unit price"
                value={item ? `$${(item.unitPriceCents / 100).toFixed(2)}` : '—'}
              />
              <Field
                label="Order value"
                value={item ? `$${((item.unitPriceCents * item.quantity) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              />
              <Field
                label="Your payout"
                value={`$${(dispatch.costCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                emphasis
                hint="Transferred on ship confirmation"
              />
            </dl>
            <p className="mt-4 flex items-center gap-1.5 border-t border-ink-100 pt-3 text-[11.5px] text-ink-500">
              <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
              Manifest v{dispatch.manifestVersion}
              {dispatch.acceptedManifestVersion != null &&
                dispatch.acceptedManifestVersion !== dispatch.manifestVersion && (
                  <span className="font-medium text-warning-700">
                    · you accepted v{dispatch.acceptedManifestVersion} — re-review the changes
                  </span>
                )}
            </p>
          </section>

          {/* Shipping requirements — doc gate + pre-departure QC (L1.1b) */}
          {shippingCtx && (
            <ShipRequirementsCard
              dispatchId={dispatch.id}
              docGateApplies={shippingCtx.docGateApplies}
              canShip={shippingCtx.gate.canShip}
              missingLabels={shippingCtx.gate.missing.map((t) => SHIP_DOC_LABELS[t])}
              rows={shipDocRows}
              qcPhotos={qcPhotos}
              checklist={shippingCtx.checklist.map((i) => ({ key: i.key, label: i.label }))}
              canUpload={canUploadShipDocs}
              canDelete={canDeleteShipDocs}
            />
          )}

          {/* Storage releases — HOLD_AT_MANUFACTURER release queue (L1.2a) */}
          {storageAgreement && (
            <StorageReleasesCard
              dispatchId={dispatch.id}
              mode={storageAgreement.mode}
              agreementStatus={storageAgreement.status}
              unitsRemaining={storageAgreement.unitsRemaining}
              releases={storageReleases}
            />
          )}

          {/* Tracking (only once carrier/tracking present) */}
          {(dispatch.trackingCarrier || dispatch.trackingNumber) && (
            <section className="rounded-2xl border border-ink-200 bg-white p-5">
              <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
                <Truck className="h-4 w-4 text-ink-500" aria-hidden="true" /> Tracking
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Carrier" value={dispatch.trackingCarrier} />
                <Field label="Tracking #" value={dispatch.trackingNumber} mono />
              </dl>
            </section>
          )}

          {/* Change request (renders only when CHANGES_REQUESTED) */}
          <ChangeRequestCard
            changeRequest={dispatch.changeRequest as unknown as never}
            status={dispatch.status}
          />

          {/* Work packet — the role-scoped need-to-know slice (partner-order-packets).
              New dispatches persist a RolePacket; legacy/ungenerated ones fall back to
              the full-manifest view. */}
          {dispatch.finishManifestJson &&
          typeof dispatch.finishManifestJson === 'object' &&
          'role' in (dispatch.finishManifestJson as object) ? (
            <section className="rounded-2xl border border-ink-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-[15px] font-semibold text-ink-900">Your work packet</h2>
                <a
                  href={`/api/manifest/${dispatch.id}`}
                  className="text-[12px] font-semibold text-pink-700 hover:underline"
                >
                  Download JSON
                </a>
              </div>
              <RolePacketView
                packet={dispatch.finishManifestJson as unknown as Parameters<typeof RolePacketView>[0]['packet']}
              />
            </section>
          ) : (
            <ProductionManifestView
              manifest={(dispatch.finishManifestJson as unknown as ProductionManifest | null) ?? null}
              status={dispatch.bundleStatus}
              manifestDownloadHref={`/api/manifest/${dispatch.id}`}
            />
          )}

          {/* Event timeline */}
          <section className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
              <Clock className="h-4 w-4 text-ink-500" aria-hidden="true" /> Timeline
            </h2>
            <Timeline
              events={[
                { label: 'Dispatch created', at: dispatch.createdAt },
                { label: 'Accepted', at: dispatch.acceptedAt },
                { label: 'Production started', at: dispatch.productionStartedAt },
                { label: 'Quality check started', at: dispatch.qualityCheckStartedAt },
                { label: 'Quality check failed', at: dispatch.qualityCheckFailedAt, tone: 'bad' },
                { label: 'Ready to ship', at: dispatch.readyAt },
                { label: 'Shipped', at: dispatch.shippedAt },
                { label: 'In transit', at: dispatch.inTransitAt },
                { label: 'Delivered', at: dispatch.deliveredAt },
                { label: 'Declined', at: dispatch.declinedAt, tone: 'bad' },
                { label: 'Withdrawn', at: dispatch.withdrawnAt, tone: 'bad' },
              ]}
            />
          </section>
        </div>

        {/* Action rail */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <DispatchActions
            dispatchId={dispatch.id}
            status={dispatch.status}
            type={dispatch.type}
            shippedAtIso={dispatch.shippedAt?.toISOString() ?? null}
            trackingCarrier={dispatch.trackingCarrier}
            trackingNumber={dispatch.trackingNumber}
            shipping={
              shippingCtx
                ? {
                    canShip: shippingCtx.gate.canShip,
                    missingDocLabels: shippingCtx.gate.missing.map((t) => SHIP_DOC_LABELS[t]),
                    // LABEL dispatches ship printed stock ambient — never show
                    // the product's cold-chain fields on a label shipment.
                    storageClass: shippingCtx.docGateApplies ? shippingCtx.storageClass : 'AMBIENT',
                    mode: shippingCtx.mode,
                    platformLabelEnabled,
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// Horizontal production-stage tracker
// ===========================================================================

function ProductionTracker({
  stages,
  lastDone,
  currentIndex,
  halted,
  haltLabel,
  haltNotes,
}: {
  stages: { key: string; label: string; at: Date | null; icon: LucideIcon }[]
  lastDone: number
  currentIndex: number
  halted: boolean
  haltLabel: string
  haltNotes: string | null
}) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      {halted && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger-700" aria-hidden="true" />
          <div className="text-[12.5px]">
            <p className="font-semibold text-danger-800">{haltLabel}</p>
            {haltNotes && <p className="mt-0.5 text-danger-700">{haltNotes}</p>}
          </div>
        </div>
      )}
      <ol className="flex items-start gap-0 overflow-x-auto pb-1">
        {stages.map((s, i) => {
          const done = i <= lastDone
          const current = i === currentIndex
          const skipped = !s.at && done // e.g. QC skipped but batch advanced
          const Icon = s.icon
          return (
            <li key={s.key} className="relative flex min-w-[88px] flex-1 flex-col items-center text-center">
              {/* connector to previous node */}
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute right-1/2 top-5 h-[2px] w-full ${
                    done && !skipped ? 'bg-success-300' : done ? 'bg-success-200' : 'bg-ink-200'
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                  current
                    ? 'border-pink-500 bg-pink-50 text-pink-700'
                    : done
                      ? skipped
                        ? 'border-success-200 bg-white text-success-500'
                        : 'border-success-500 bg-success-500 text-white'
                      : 'border-ink-200 bg-white text-ink-400'
                } ${current ? 'ring-4 ring-pink-100' : ''}`}
              >
                {done && !skipped ? <Check className="h-[18px] w-[18px]" aria-hidden="true" /> : <Icon className="h-[18px] w-[18px]" aria-hidden="true" />}
              </span>
              <span
                className={`mt-2 text-[11.5px] font-medium leading-tight ${
                  current ? 'text-pink-700' : done ? 'text-ink-800' : 'text-ink-400'
                }`}
              >
                {s.label}
              </span>
              <span className="mt-0.5 text-[10px] tabular-nums text-ink-400">
                {s.at ? fmtShort(s.at) : skipped ? 'skipped' : current ? 'now' : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ===========================================================================
// Vertical event timeline (only rows with timestamps render)
// ===========================================================================

function Timeline({
  events,
}: {
  events: { label: string; at: Date | null | undefined; tone?: 'bad' }[]
}) {
  const rows = events.filter((e) => e.at) as { label: string; at: Date; tone?: 'bad' }[]
  rows.sort((a, b) => a.at.getTime() - b.at.getTime())
  if (rows.length === 0) {
    return <p className="mt-3 text-[13px] text-ink-500">No events recorded yet.</p>
  }
  return (
    <ol className="mt-4 space-y-0">
      {rows.map((e, i) => (
        <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
          {i < rows.length - 1 && (
            <span aria-hidden="true" className="absolute left-[5px] top-3 h-full w-[2px] bg-ink-200" />
          )}
          <span
            className={`relative z-10 mt-1 h-3 w-3 flex-shrink-0 rounded-full ring-2 ring-white ${
              e.tone === 'bad' ? 'bg-danger-500' : 'bg-success-500'
            }`}
          />
          <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
            <span className={`text-[13px] font-medium ${e.tone === 'bad' ? 'text-danger-800' : 'text-ink-800'}`}>
              {e.label}
            </span>
            <span className="text-[11.5px] tabular-nums text-ink-500">{fmtDate(e.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ===========================================================================
// Small presentational helpers
// ===========================================================================

function Field({
  label,
  value,
  emphasis,
  hint,
  mono,
}: {
  label: string
  value: string | null | undefined
  emphasis?: boolean
  hint?: string
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</dt>
      <dd
        className={`mt-1 ${emphasis ? 'font-display text-[18px] font-bold text-ink-900' : 'text-[14px] text-ink-800'} ${
          mono ? 'font-mono text-[13px]' : ''
        }`}
      >
        {value || '—'}
      </dd>
      {hint && <p className="mt-0.5 text-[10.5px] text-ink-400">{hint}</p>}
    </div>
  )
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function fmtShort(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Phase L1.2a — defensive destinationJson readers. The column is Json (written
// creator-side as an address snapshot; releases-actions.ts merges tracking in
// at SHIPPED) — never trust its shape at read time.
// ---------------------------------------------------------------------------

function summarizeReleaseDestination(v: unknown): string {
  if (typeof v !== 'object' || v === null) return 'Creator address'
  const o = v as Record<string, unknown>
  const str = (k: string): string | null =>
    typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string) : null
  const contact = str('contactName')
  const line1 = str('addressLine1')
  const city = str('city')
  const state = str('state')
  const postal = str('postalCode')
  const place = [line1, [city, state].filter(Boolean).join(', '), postal].filter(Boolean).join(' · ')
  if (!contact && !place) return 'Creator address'
  return [contact, place].filter(Boolean).join(' — ')
}

function summarizeReleaseTracking(v: unknown): string | null {
  if (typeof v !== 'object' || v === null) return null
  const t = (v as Record<string, unknown>).tracking
  if (typeof t !== 'object' || t === null) return null
  const o = t as Record<string, unknown>
  const carrier = typeof o.carrier === 'string' ? o.carrier : null
  const number = typeof o.number === 'string' ? o.number : null
  if (!carrier && !number) return null
  return [carrier, number].filter(Boolean).join(' · ')
}
