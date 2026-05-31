// Phase G6.f — creator-side subscriptions list.
//
// Before G6.f, the only evidence a creator's Subscribe & save acceptance
// even worked was a Stripe email receipt. This page lists their
// production-run subscriptions with cadence, runs progress, next charge
// date, and a per-row cancel CTA.
//
// Layout mirrors /orders (R10) — a cream header band, then either a
// wide-card list or an empty-state illustration. Per-row right rail
// summarises money + next run; left side surfaces the brand + product.
//
// V1.5: pair with task #554 (Creator self-serve tier upgrade flow) and
// fold both this page + the future /account/billing/upgrade flow under
// a single /account/ tree.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  Repeat,
  ShieldCheck,
  Sparkles,
  AlertOctagon,
  CalendarClock,
  Package,
} from 'lucide-react'
import { CancelSubscriptionButton } from './CancelSubscriptionButton'

export const dynamic = 'force-dynamic'

type SubStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED'
type Cadence = 'MONTHLY' | 'QUARTERLY'

const STATUS_PILL: Record<
  SubStatus,
  { label: string; bg: string; fg: string; border: string; dot: string }
> = {
  ACTIVE:    { label: 'Active',    bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  PAUSED:    { label: 'Paused',    bg: '#FAEEDA', fg: '#854F0B', border: '#FAC775', dot: '#BA7517' },
  CANCELLED: { label: 'Cancelled', bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1', dot: '#E24B4A' },
  COMPLETED: { label: 'Completed', bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
}

export default async function CreatorSubscriptionsPage() {
  const user = await requireUser()

  const subs = await prisma.productionSubscription.findMany({
    where: { creatorUserId: user.id },
    include: {
      brand: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 bg-[#F3EFE8] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.06em] text-zinc-500">
              Subscribe &amp; save
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-zinc-900">
              Recurring production runs
            </h1>
            <p className="mt-1 text-[12.5px] text-zinc-600">
              {subs.length === 0
                ? 'You haven’t locked in any recurring runs yet. The Subscribe option appears in checkout once you’ve picked a quantity.'
                : `${subs.length} ${subs.length === 1 ? 'subscription' : 'subscriptions'} — manage cadence, run count, and cancellation here.`}
            </p>
          </div>
        </div>
      </header>

      {subs.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {subs.map((s) => (
            <SubscriptionCard
              key={s.id}
              sub={{
                id: s.id,
                productId: s.productId,
                productName: s.product.name,
                brandName: s.brand.name,
                cadence: s.cadence as Cadence,
                totalRuns: s.totalRuns,
                runsCompleted: s.runsCompleted,
                nextRunAt: s.nextRunAt,
                status: s.status as SubStatus,
                discountBp: s.discountBp,
                subtotalCentsAtCreation: s.subtotalCentsAtCreation,
                cancelledAt: s.cancelledAt,
                cancelledReason: s.cancelledReason,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// =============================================================================
// SubscriptionCard
// =============================================================================

interface SubView {
  id: string
  productId: string
  productName: string
  brandName: string
  cadence: Cadence
  totalRuns: number | null
  runsCompleted: number
  nextRunAt: Date | null
  status: SubStatus
  discountBp: number
  subtotalCentsAtCreation: number
  cancelledAt: Date | null
  cancelledReason: string | null
}

function SubscriptionCard({ sub }: { sub: SubView }) {
  const palette = STATUS_PILL[sub.status]
  const cadenceLabel = sub.cadence === 'QUARTERLY' ? 'every 3 months' : 'every month'
  const runsLabel = sub.totalRuns
    ? `Run ${sub.runsCompleted + (sub.status === 'ACTIVE' ? 1 : 0)} of ${sub.totalRuns}`
    : `${sub.runsCompleted} runs completed (open-ended)`
  const perRunCents = Math.max(
    0,
    Math.round(
      (sub.subtotalCentsAtCreation * (10_000 - sub.discountBp)) / 10_000,
    ),
  )
  const pctOff = (sub.discountBp / 100).toFixed(0)

  return (
    <li>
      <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {/* Header band */}
        <header
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-zinc-100 px-5 py-2.5 text-[12px] text-zinc-700"
          style={{ background: '#FAF8F2' }}
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
          <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800">
            <Repeat className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            Subscribe &amp; save
          </span>
          {sub.discountBp > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-[2px] text-[10.5px] font-semibold text-emerald-700">
              <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
              {pctOff}% off
            </span>
          )}
          <span className="ml-auto font-mono text-[11px] text-zinc-400">
            SUB-{sub.id.slice(-6)}
          </span>
        </header>

        {/* Body */}
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr,auto] sm:items-start">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.06em] text-zinc-500">
              {sub.brandName}
            </p>
            <Link
              href={`/products/${sub.productId}`}
              className="mt-0.5 inline-block truncate font-display text-lg font-semibold text-zinc-900 hover:text-pink-700"
            >
              {sub.productName}
            </Link>
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-3">
              <Field
                label="Cadence"
                value={cadenceLabel}
                icon={<CalendarClock className="h-3 w-3" />}
              />
              <Field
                label="Progress"
                value={runsLabel}
                icon={<Package className="h-3 w-3" />}
              />
              <Field
                label="Next charge"
                value={
                  sub.status === 'ACTIVE' && sub.nextRunAt
                    ? new Date(sub.nextRunAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : sub.status === 'CANCELLED'
                      ? '—'
                      : 'Pending'
                }
                icon={<ShieldCheck className="h-3 w-3" />}
              />
            </dl>
            {sub.status === 'CANCELLED' && sub.cancelledReason && (
              <p className="mt-3 inline-flex items-start gap-1.5 rounded-md bg-red-50/60 px-2.5 py-1.5 text-[11.5px] text-red-700">
                <AlertOctagon
                  className="mt-0.5 h-3 w-3 flex-shrink-0"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold">Cancelled</span>
                  {sub.cancelledAt && (
                    <>
                      {' '}
                      on{' '}
                      {new Date(sub.cancelledAt).toLocaleDateString()}
                    </>
                  )}
                  <span className="ml-1 italic">
                    &mdash; {sub.cancelledReason}
                  </span>
                </span>
              </p>
            )}
          </div>

          {/* Right — money + actions */}
          <div className="flex flex-col items-end gap-2 sm:min-w-[180px]">
            <div className="text-right">
              <p className="text-[10.5px] uppercase tracking-widest text-zinc-500">
                Per run
              </p>
              <p className="font-display text-xl font-bold tabular-nums text-zinc-900">
                ${(perRunCents / 100).toFixed(2)}
              </p>
              {sub.discountBp > 0 && (
                <p className="text-[10.5px] text-zinc-400 line-through">
                  ${(sub.subtotalCentsAtCreation / 100).toFixed(2)}
                </p>
              )}
            </div>
            {sub.status === 'ACTIVE' && (
              <CancelSubscriptionButton subscriptionId={sub.id} />
            )}
          </div>
        </div>
      </article>
    </li>
  )
}

function Field({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 inline-flex items-center gap-1 truncate text-zinc-900">
        {icon && <span className="text-zinc-400">{icon}</span>}
        <span className="truncate">{value}</span>
      </dd>
    </div>
  )
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 text-pink-700"
      >
        <Repeat className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-zinc-900">
        No recurring runs yet
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-zinc-600">
        Subscribe &amp; save locks in a cadence so you never have to re-spec a
        production run again. Save up to 12% on every cycle. The option
        appears at checkout once you&rsquo;ve picked a quantity.
      </p>
      <Link
        href="/products"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-white hover:bg-black"
      >
        Pick a product
      </Link>
    </div>
  )
}
