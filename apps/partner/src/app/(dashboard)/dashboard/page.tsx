// Partner dashboard — landing page.
//
// Partner-v2 chrome (Pavel 2026-06-05): cream rounded-3xl hero + KPI strip,
// matching /products. Data wiring (dispatch snapshot + active-welcome modal)
// is unchanged from the prior version.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import Link from 'next/link'
import { Inbox, Factory, PackageCheck, Wrench, ArrowRight, type LucideIcon } from 'lucide-react'
import { ActiveWelcomeModal } from './ActiveWelcomeModal'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — Partners' }

export default async function ProviderDashboardHome() {
  const user = await requireUser()

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: {
        include: {
          dispatches: {
            where: { status: { in: ['PENDING_ACCEPT', 'ACCEPTED', 'PRODUCING', 'READY', 'SHIPPED'] } },
            include: { order: true },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      },
    },
  })

  if (!partner) return null

  const pendingDispatches = partner.services.flatMap((s) => s.dispatches)
  const count = (st: string) => pendingDispatches.filter((d) => d.status === st).length
  const awaitingAccept = count('PENDING_ACCEPT')
  const producing = count('PRODUCING')
  const ready = count('READY')
  const activeServices = partner.services.filter((s) => s.status === 'ACTIVE').length

  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  const showActiveWelcome =
    progress.activeWelcomeSeen !== true &&
    (partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED')

  return (
    <div className="space-y-6">
      {showActiveWelcome && <ActiveWelcomeModal companyName={partner.companyName} />}

      {/* Cream hero + KPI strip */}
      <div className="rounded-3xl border border-ink-200 bg-[#F3EFE8] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              Manufacturing · Dashboard
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Welcome back
            </h1>
            <p className="mt-1 text-[13px] text-ink-600">{partner.companyName}</p>
          </div>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Inbox className="h-4 w-4" aria-hidden="true" /> Open order inbox
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi href="/orders" label="Awaiting acceptance" value={awaitingAccept} icon={Inbox} tone="pink" />
          <Kpi href="/orders" label="In production" value={producing} icon={Factory} tone="amber" />
          <Kpi href="/orders" label="Ready to ship" value={ready} icon={PackageCheck} tone="sky" />
          <Kpi href="/services" label="Active services" value={activeServices} icon={Wrench} tone="ink" />
        </div>
      </div>

      {/* Recent dispatches */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="flex items-center justify-between border-b border-ink-100 bg-cream px-4 py-2.5">
          <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
            Recent dispatches
          </h2>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            All orders <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </header>
        {pendingDispatches.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-ink-500">
            No active dispatches. Real orders begin routing with the Stripe + order flow; today
            this reflects any seeded test dispatches.
          </p>
        ) : (
          <ul className="divide-y divide-ink-50">
            {pendingDispatches.slice(0, 8).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-ink-900">
                    {d.order?.id ? `Order ${d.order.id.slice(0, 8)}` : 'Dispatch'}
                  </p>
                  <p className="text-[10.5px] text-ink-500">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <DispatchPill status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------

function Kpi({
  href,
  label,
  value,
  icon: Icon,
  tone,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone: 'ink' | 'sky' | 'pink' | 'amber'
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    sky: 'bg-sky-100 text-sky-700',
    pink: 'bg-pink-100 text-pink-700',
    amber: 'bg-amber-100 text-amber-700',
  }
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </Link>
  )
}

const DISPATCH_PILL: Record<string, { label: string; cls: string }> = {
  PENDING_ACCEPT: { label: 'Awaiting', cls: 'border-pink-200 bg-pink-50 text-pink-800' },
  ACCEPTED: { label: 'Accepted', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  PRODUCING: { label: 'Producing', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  READY: { label: 'Ready', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  SHIPPED: { label: 'Shipped', cls: 'border-ink-200 bg-zinc-100 text-ink-700' },
}

function DispatchPill({ status }: { status: string }) {
  const p = DISPATCH_PILL[status] ?? { label: status, cls: 'border-ink-200 bg-zinc-100 text-ink-700' }
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
        p.cls,
      )}
    >
      {p.label}
    </span>
  )
}
