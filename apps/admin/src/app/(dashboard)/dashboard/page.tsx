// Admin Dashboard home — the first thing the admin sees on sign-in.
//
// Layout (locked design system + Pavel-approved):
//   1. HeroGreeting    — friendly time-aware greeting + system status pill
//   2. KpiRow          — six clickable metric tiles (Orders / Revenue / etc)
//   3. Two columns:
//        L (wider): OrdersByStatusChart  +  SignupsChart
//        R:        InboxPreview        +  ActivityFeed
//
// Every widget is a self-contained card. Each metric / row / queue item
// links into an existing surface — no admin functionality is touched, only
// re-presented. The dashboard is purely additive.

import { auth } from '@ilaunchify/auth'
import {
  loadKpiCards,
  loadOrdersByStatus,
  loadSignupsTimeseries,
  loadInboxPreview,
  loadRecentActivity,
} from './dashboard-data'
import { KpiCard } from './widgets/KpiCard'
import { OrdersByStatusChart } from './widgets/OrdersByStatusChart'
import { SignupsChart } from './widgets/SignupsChart'
import { InboxPreview } from './widgets/InboxPreview'
import { ActivityFeed } from './widgets/ActivityFeed'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — Admin' }

export default async function AdminDashboardPage() {
  const session = await auth()
  // Load every widget's data in parallel — none of these queries depend on
  // each other, so paying for one round-trip rather than five matters.
  const [kpis, ordersByStatus, signups, inbox, activity] = await Promise.all([
    loadKpiCards(),
    loadOrdersByStatus(),
    loadSignupsTimeseries(),
    loadInboxPreview(),
    loadRecentActivity(),
  ])

  const displayName =
    (session?.user?.name?.split(' ')[0] ??
      session?.user?.email?.split('@')[0] ??
      'admin')

  return (
    <div className="space-y-6">
      <HeroGreeting name={displayName} />

      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <KpiCard key={k.id} data={k} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <OrdersByStatusChart data={ordersByStatus} />
          <SignupsChart data={signups} />
        </div>
        <div className="space-y-6">
          <InboxPreview rows={inbox} />
          <ActivityFeed rows={activity} />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// HeroGreeting — small but emotionally heavy first impression
// =============================================================================
//
// Time-aware salutation, brand-italic emphasis in Fraunces (locked DS token).
// Sits on a cream band that echoes the page-section header pattern used
// across the platform (DESIGN_SYSTEM.md §6).

function HeroGreeting({ name }: { name: string }) {
  const hour = new Date().getHours()
  const greeting =
    hour < 5
      ? 'Up late'
      : hour < 12
        ? 'Good morning'
        : hour < 17
          ? 'Good afternoon'
          : 'Good evening'
  const fullDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <section className="relative overflow-hidden rounded-2xl border border-ink-200 bg-gradient-to-br from-[#FBFAF7] via-white to-pink-50/40 px-6 py-5">
      <div className="relative">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
          {fullDate}
        </p>
        <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink-900">
          {greeting}, <span className="font-serif italic text-pink-700">{name}</span>
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-600">
          Here&rsquo;s what&rsquo;s happening across the iLaunchify platform —
          the inbox you control, the orders flowing through, and the people
          joining the marketplace.
        </p>
      </div>
      {/* Decorative pink accent — Fraunces "i" letterform-as-mark, sits at the right edge. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-4 font-serif text-[160px] font-bold italic leading-none text-pink-500/[0.06] select-none"
      >
        i
      </span>
    </section>
  )
}
