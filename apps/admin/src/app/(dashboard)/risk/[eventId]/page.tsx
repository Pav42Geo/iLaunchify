// Risk-event detail — the adjudication page (Risk Center M2).
// Shows the REPRODUCIBLE decision snapshot (inputs + thresholds + formula
// version) so an admin can see exactly why the detector fired, then triage.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { DETECTORS, type DetectorKey } from '@ilaunchify/risk'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { TriageActions } from './TriageActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Risk event — Admin' }

type Resolution = 'ACK' | 'RESOLVED' | 'MUTED' | 'FALSE_POSITIVE' | 'OPEN'
const ALLOWED: Record<string, Resolution[]> = {
  OPEN: ['ACK', 'RESOLVED', 'MUTED', 'FALSE_POSITIVE'],
  ACK: ['RESOLVED', 'MUTED', 'FALSE_POSITIVE', 'OPEN'],
  MUTED: ['OPEN', 'RESOLVED', 'FALSE_POSITIVE'],
  RESOLVED: ['OPEN'],
  FALSE_POSITIVE: ['OPEN'],
}

const SEVERITY_PILL: Record<string, string> = {
  INFO: 'border-ink-200 bg-ink-50 text-ink-700',
  WARN: 'border-warning-200 bg-warning-50 text-warning-800',
  HIGH: 'border-danger-200 bg-danger-50 text-danger-800',
  CRITICAL: 'border-danger-300 bg-danger-100 text-danger-900',
}

interface Snapshot {
  formulaVersion?: string
  score?: number
  thresholds?: Record<string, number>
  inputs?: Record<string, unknown>
  reasons?: string[]
  uncappedAction?: string
  partnerServiceId?: string
}

export default async function RiskEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  await requireCapability('orders:read')
  const { eventId } = await params

  const event = await prisma.riskEvent.findUnique({ where: { id: eventId } })
  if (!event) notFound()

  const meta = DETECTORS[event.detectorKey as DetectorKey]
  const snap = (event.scoreSnapshotJson ?? {}) as Snapshot

  // Entity context — order revenue + platform-fee view when it's an Order event.
  const order =
    event.entityType === 'Order'
      ? await prisma.order.findUnique({
          where: { id: event.entityId },
          select: { id: true, orderNumber: true, status: true, totalCents: true, subtotalCents: true },
        })
      : null

  const resolver = event.resolvedById
    ? await prisma.user.findUnique({ where: { id: event.resolvedById }, select: { name: true, email: true } })
    : null

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={`Risk Center · ${event.detectorKey}`}
        title={meta?.title ?? event.detectorKey}
        description={`Fired ${event.createdAt.toLocaleString()} · decision ${event.decision} · benchmark: ${meta?.benchmark ?? '—'}`}
        actions={
          <Link
            href="/risk"
            className="inline-flex items-center rounded-full border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            ← Risk Inbox
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Status + triage */}
        <section className="rounded-2xl border border-ink-200 bg-white p-5 lg:col-span-1">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">Status</h2>
          <div className="mt-3 flex items-center gap-2">
            <span className={cn('inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider', SEVERITY_PILL[event.severity] ?? SEVERITY_PILL.INFO)}>
              {event.severity}
            </span>
            <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider text-ink-700">
              {event.status}
            </span>
          </div>
          {snap.uncappedAction && snap.uncappedAction !== event.decision && (
            <p className="mt-3 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] leading-relaxed text-warning-800">
              Shadow mode: this detector <strong>would have {snap.uncappedAction}</strong> at full promotion — the
              ladder capped it to {event.decision}. That gap is the calibration signal.
            </p>
          )}
          {resolver && (
            <p className="mt-3 text-[12px] text-ink-500">
              Resolved by {resolver.name ?? resolver.email} · {event.resolvedAt?.toLocaleString()}
            </p>
          )}
          <div className="mt-4">
            <TriageActions eventId={event.id} allowed={ALLOWED[event.status] ?? []} />
          </div>
        </section>

        {/* Entity context */}
        <section className="rounded-2xl border border-ink-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">Entity</h2>
          {order ? (
            <div className="mt-3 space-y-1.5 text-[13px]">
              <p>
                <Link href={`/orders/${order.id}`} className="font-semibold text-ink-900 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-900">
                  Order {order.orderNumber ?? `#${order.id.slice(-8)}`}
                </Link>{' '}
                <span className="text-ink-500">· {order.status}</span>
              </p>
              <p className="text-ink-700">
                Revenue at risk: <strong className="tabular-nums">${(order.totalCents / 100).toLocaleString()}</strong>
                <span className="ml-3 text-ink-500">
                  Platform fee at risk (secondary): $
                  {(Math.max(0, order.totalCents - order.subtotalCents) / 100).toLocaleString()}
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-3 font-mono text-[12px] text-ink-700">
              {event.entityType} · {event.entityId}
            </p>
          )}
          {snap.reasons && snap.reasons.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">Why it fired</h3>
              <ul className="mt-2 space-y-1.5">
                {snap.reasons.map((r, i) => (
                  <li key={i} className="rounded-xl bg-ink-50 px-3 py-2 text-[13px] leading-relaxed text-ink-800">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Reproducible snapshot */}
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">Decision snapshot</h2>
          <p className="text-[12px] text-ink-500">
            formula <span className="font-mono">{snap.formulaVersion ?? '—'}</span> · score{' '}
            <span className="font-mono tabular-nums">{snap.score ?? '—'}</span>
          </p>
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Thresholds at decision time</h3>
            <pre className="mt-1.5 overflow-x-auto rounded-xl bg-ink-950 p-4 font-mono text-[11.5px] leading-relaxed text-ink-100">
              {JSON.stringify(snap.thresholds ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Inputs</h3>
            <pre className="mt-1.5 overflow-x-auto rounded-xl bg-ink-950 p-4 font-mono text-[11.5px] leading-relaxed text-ink-100">
              {JSON.stringify(snap.inputs ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </section>
    </div>
  )
}
