// Partner production-dispatch detail.
//
// Partner-v2 surface (Pavel 2026-06-05): cream hero + live status pill +
// accept-deadline urgency + a horizontal production-stage tracker driven by
// the real per-state timestamps (B6), a product/payout panel, a vertical
// event timeline, and a tracking panel. The action rail (DispatchActions),
// change-request card and production manifest are unchanged.

import { prisma } from '@ilaunchify/db'
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
import { ProductionManifestView } from '@ilaunchify/ui'
import { ChangeRequestCard } from './ChangeRequestCard'
import { DisputeResponsePanel } from './DisputeResponsePanel'
import type { ProductionManifest } from '@ilaunchify/orders'

export const dynamic = 'force-dynamic'

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  PENDING_ACCEPT: { label: 'Awaiting your acceptance', cls: 'border-pink-200 bg-pink-50 text-pink-800' },
  CHANGES_REQUESTED: { label: 'Changes requested', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  ACCEPTED: { label: 'Accepted', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  PRODUCING: { label: 'In production', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  QUALITY_CHECK: { label: 'Quality check', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  READY: { label: 'Ready to ship', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  SHIPPED: { label: 'Shipped', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  IN_TRANSIT: { label: 'In transit', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  DELIVERED: { label: 'Delivered', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  DECLINED: { label: 'Declined · rerouted', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
  TIMED_OUT: { label: 'Auto-declined · timed out', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
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
      partnerService: { partner: { userId: user.id } },
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

  // ---- Production-stage tracker -------------------------------------------
  // Drive "done" purely from the per-state timestamps so a skipped QC still
  // lights up as the batch passed through to READY.
  const stages: { key: string; label: string; at: Date | null; icon: LucideIcon }[] = [
    { key: 'accepted', label: 'Accepted', at: dispatch.acceptedAt, icon: ClipboardCheck },
    { key: 'producing', label: 'In production', at: dispatch.productionStartedAt, icon: Factory },
    { key: 'qc', label: 'Quality check', at: dispatch.qualityCheckStartedAt, icon: FlaskConical },
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
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              Manufacturing · {isProduct ? 'Production' : 'Label print'} dispatch
            </p>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              {item?.product.name ?? (isProduct ? 'Production dispatch' : 'Label print dispatch')}
              <span className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider ${pill.cls}`}>
                {pill.label}
              </span>
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-600">
              Order <span className="font-medium text-ink-800">#{dispatch.order.id.slice(-8)}</span>
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
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : hrsLeft <= 6
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
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
                  <span className="font-medium text-amber-700">
                    · you accepted v{dispatch.acceptedManifestVersion} — re-review the changes
                  </span>
                )}
            </p>
          </section>

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

          {/* Production manifest */}
          <ProductionManifestView
            manifest={(dispatch.finishManifestJson as unknown as ProductionManifest | null) ?? null}
            status={dispatch.bundleStatus}
            manifestDownloadHref={`/api/manifest/${dispatch.id}`}
          />

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
          <DispatchActions dispatchId={dispatch.id} status={dispatch.status} type={dispatch.type} />
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
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-700" aria-hidden="true" />
          <div className="text-[12.5px]">
            <p className="font-semibold text-rose-800">{haltLabel}</p>
            {haltNotes && <p className="mt-0.5 text-rose-700">{haltNotes}</p>}
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
                    done && !skipped ? 'bg-emerald-300' : done ? 'bg-emerald-200' : 'bg-ink-200'
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                  current
                    ? 'border-pink-500 bg-pink-50 text-pink-700'
                    : done
                      ? skipped
                        ? 'border-emerald-200 bg-white text-emerald-500'
                        : 'border-emerald-500 bg-emerald-500 text-white'
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
              e.tone === 'bad' ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
          />
          <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
            <span className={`text-[13px] font-medium ${e.tone === 'bad' ? 'text-rose-800' : 'text-ink-800'}`}>
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
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</dt>
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
