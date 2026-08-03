// Channel-inbound plan detail (Phase L3b — docs/LOGISTICS_AND_FULFILLMENT.md
// §7 + §9). Deep-linked from the list page's RowActionsMenu (locked pattern:
// never inline-mutate from the list). Guarded like the sibling logistics
// detail pages — requireCapability('platform:admin'); the cancel server
// action repeats the same fence.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import type { ChannelInboundPlanStatus } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { PlanAdminActions } from './PlanAdminActions'
import {
  formatCents,
  parseDestinations,
  parsePlacementFees,
  parseReconciliation,
  placementLabel,
  PLAN_STATUS_LABEL,
} from '../plan-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channel inbound plan — Admin' }

const STATUS_PILL: Record<
  ChannelInboundPlanStatus,
  { bg: string; text: string; border: string; dot: string }
> = {
  DRAFT: { bg: 'bg-warning-100', text: 'text-warning-800', border: 'border-warning-200', dot: 'bg-warning-500' },
  CONFIRMED: { bg: 'bg-info-100', text: 'text-info-800', border: 'border-info-200', dot: 'bg-info-500' },
  SHIPPED: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200', dot: 'bg-pink-500' },
  CHECKED_IN: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
  RECONCILED: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500' },
  CANCELLED: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400' },
}

interface PageProps {
  params: Promise<{ planId: string }>
}

export default async function ChannelPlanDetailPage({ params }: PageProps) {
  await requireCapability('platform:admin')
  const { planId } = await params

  const plan = await prisma.channelInboundPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      orderId: true,
      externalPlanId: true,
      externalShipmentIds: true,
      placementChoice: true,
      feesJson: true,
      destinationsJson: true,
      labelAssetIds: true,
      appointmentAt: true,
      status: true,
      reconciliationJson: true,
      createdAt: true,
      updatedAt: true,
      order: { select: { id: true, orderNumber: true } },
      channelConnection: {
        select: {
          status: true,
          channel: { select: { code: true, displayName: true } },
          creator: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })
  if (!plan) notFound()

  const orderRef = plan.order.orderNumber ?? `#${plan.order.id.slice(-8)}`
  const creator = plan.channelConnection.creator
  const channel = plan.channelConnection.channel
  const fees = parsePlacementFees(plan.feesJson)
  const destinations = parseDestinations(plan.destinationsJson)
  const recon = parseReconciliation(plan.reconciliationJson)
  const tone = STATUS_PILL[plan.status]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Channel inbound"
        title={`Inbound plan · ${orderRef}`}
        description={`${channel.displayName} inbound plan ${plan.externalPlanId} — placement, appointment and check-in reconciliation for this order's channel leg.`}
        actions={
          <Link
            href={`/audit?entityType=Order&entityId=${plan.orderId}`}
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Audit history
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------------ Plan facts */}
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            Plan facts
          </h2>
          <dl className="mt-3 space-y-2.5 text-[12.5px]">
            <Fact label="Status">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                  tone.bg,
                  tone.text,
                  tone.border,
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                {PLAN_STATUS_LABEL[plan.status]}
              </span>
            </Fact>
            <Fact label="Order">
              <Link
                href={`/orders/${plan.orderId}`}
                className="font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
              >
                {orderRef}
              </Link>
            </Fact>
            <Fact label="Creator">
              <Link
                href={`/creators/${creator.id}`}
                className="text-ink-800 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
              >
                {creator.name ?? creator.email}
              </Link>
            </Fact>
            <Fact label="Channel">
              <span className="inline-flex items-center gap-1.5">
                {channel.displayName}
                <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium uppercase text-ink-600">
                  {channel.code}
                </span>
                <span className="text-[11px] text-ink-500">
                  connection {plan.channelConnection.status.toLowerCase().replaceAll('_', ' ')}
                </span>
              </span>
            </Fact>
            <Fact label="External plan ID">
              <span className="font-mono text-[11.5px] text-ink-700">{plan.externalPlanId}</span>
            </Fact>
            <Fact label="External shipments">
              {plan.externalShipmentIds.length === 0 ? (
                <Dash />
              ) : (
                <span className="flex flex-wrap gap-1">
                  {plan.externalShipmentIds.map((sid) => (
                    <span
                      key={sid}
                      className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 font-mono text-[10.5px] text-ink-700"
                    >
                      {sid}
                    </span>
                  ))}
                </span>
              )}
            </Fact>
            <Fact label="Label assets">
              {plan.labelAssetIds.length === 0 ? (
                <Dash />
              ) : (
                <span className="text-ink-700">
                  {plan.labelAssetIds.length} file{plan.labelAssetIds.length === 1 ? '' : 's'}
                  <span className="ml-1.5 font-mono text-[10.5px] text-ink-500">
                    {plan.labelAssetIds.join(', ')}
                  </span>
                </span>
              )}
            </Fact>
            <Fact label="Appointment">
              {plan.appointmentAt ? (
                <span title={plan.appointmentAt.toLocaleString()}>
                  {plan.appointmentAt.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}{' '}
                  ·{' '}
                  {plan.appointmentAt.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              ) : (
                <Dash />
              )}
            </Fact>
            <Fact label="Created">
              <span title={plan.createdAt.toLocaleString()}>
                {plan.createdAt.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </Fact>
            <Fact label="Last updated">
              <span title={plan.updatedAt.toLocaleString()}>
                {plan.updatedAt.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </Fact>
          </dl>
        </section>

        {/* ------------------------------------ Placement breakdown (feesJson) */}
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            Placement breakdown
          </h2>
          <p className="mt-1 text-[11.5px] text-ink-500">
            1 destination + per-unit placement fee vs 4+ destinations + $0 fee but extra freight
            legs — the optimizer picks the cheaper total (§7.2).
          </p>
          {fees ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <PlacementOption
                  label="Minimal splits"
                  totalCents={fees.minimalTotalCents}
                  chosen={(plan.placementChoice ?? fees.choice) === 'MINIMAL_SPLITS'}
                />
                <PlacementOption
                  label="Optimized splits"
                  totalCents={fees.optimizedTotalCents}
                  chosen={(plan.placementChoice ?? fees.choice) === 'OPTIMIZED_SPLITS'}
                />
              </div>
              <div className="mt-3 space-y-1 text-[12px] text-ink-600">
                <p>
                  Chosen:{' '}
                  <span className="font-semibold text-ink-900">
                    {placementLabel(plan.placementChoice ?? fees.choice) ?? '—'}
                  </span>
                </p>
                {fees.savingsCents !== null && (
                  <p>
                    Estimated savings vs the alternative:{' '}
                    <span className="font-semibold tabular-nums text-success-700">
                      {formatCents(fees.savingsCents)}
                    </span>
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="mt-3 text-[12px] text-ink-400">
              No placement-fee snapshot on this plan yet — it lands when the plan is drafted
              against the channel's placement options.
            </p>
          )}
        </section>

        {/* ---------------------------------- Destinations (destinationsJson) */}
        {plan.destinationsJson !== null && (
          <section className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
              Channel-assigned destinations
            </h2>
            {destinations ? (
              <ul className="mt-3 divide-y divide-ink-100">
                {destinations.map((d, i) => (
                  <li key={`${d.label}-${i}`} className="flex items-baseline gap-3 py-2 text-[12.5px]">
                    <span className="font-semibold text-ink-900">{d.label}</span>
                    {d.detail && <span className="text-ink-600">{d.detail}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <RawJson value={plan.destinationsJson} />
            )}
          </section>
        )}

        {/* ------------------------------- Reconciliation (reconciliationJson) */}
        {plan.reconciliationJson !== null && (
          <section className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
              Check-in reconciliation
            </h2>
            {recon && recon.lines.length > 0 ? (
              <>
                <table className="mt-3 w-full text-[12.5px]">
                  <thead className="text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-semibold">Line</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Expected</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Received</th>
                      <th className="py-1.5 text-right font-semibold">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {recon.lines.map((l, i) => {
                      const delta =
                        l.expected !== null && l.received !== null ? l.received - l.expected : null
                      return (
                        <tr key={`${l.key}-${i}`}>
                          <td className="py-2 pr-3 font-medium text-ink-800">{l.key}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-ink-700">
                            {l.expected ?? '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-ink-700">
                            {l.received ?? '—'}
                          </td>
                          <td
                            className={cn(
                              'py-2 text-right font-semibold tabular-nums',
                              delta === null
                                ? 'text-ink-400'
                                : delta === 0
                                  ? 'text-success-700'
                                  : 'text-danger-700',
                            )}
                          >
                            {delta === null ? '—' : delta > 0 ? `+${delta}` : delta}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p
                  className={cn(
                    'mt-3 text-[12px] font-medium',
                    recon.hasDiff ? 'text-danger-700' : 'text-success-700',
                  )}
                >
                  {recon.hasDiff
                    ? 'Mismatch — received differs from expected. Channels fine plan-vs-actual deviations; review with the partner.'
                    : 'Received matches expected.'}
                </p>
              </>
            ) : (
              <RawJson value={plan.reconciliationJson} />
            )}
          </section>
        )}

        {/* -------------------------------------------------- Admin actions */}
        <PlanAdminActions planId={plan.id} status={plan.status} orderRef={orderRef} />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Presentational bits
// -----------------------------------------------------------------------------

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[130px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-ink-800">{children}</dd>
    </div>
  )
}

function Dash() {
  return <span className="text-[11px] text-ink-400">—</span>
}

function PlacementOption({
  label,
  totalCents,
  chosen,
}: {
  label: string
  totalCents: number | null
  chosen: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        chosen ? 'border-success-300 bg-success-50/40' : 'border-ink-200 bg-white',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-600">
          {label}
        </p>
        {chosen && (
          <span className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-pink-800">
            Chosen
          </span>
        )}
      </div>
      <p className="mt-1.5 font-display text-[18px] font-bold tabular-nums text-ink-900">
        {totalCents !== null ? formatCents(totalCents) : '—'}
      </p>
      <p className="text-[10.5px] text-ink-500">estimated total (fees + freight)</p>
    </div>
  )
}

/** Fallback for Json payloads that don't match the expected shape. */
function RawJson({ value }: { value: unknown }) {
  return (
    <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-ink-50 p-3 font-mono text-[11px] leading-relaxed text-ink-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}
