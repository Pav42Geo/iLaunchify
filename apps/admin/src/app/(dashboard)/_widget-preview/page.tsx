// Admin · dev-only widget preview.
//
// Renders one of each @ilaunchify/ui dashboard variant with mock data so
// the visual parity of the lifted primitives can be verified against the
// existing admin widgets. NOT linked from the sidebar — hit
// /_widget-preview by URL after dev server start.
//
// Underscore prefix keeps it out of `next build` discovery in production
// if we ever flip it; for now Pavel will land on this manually.

import {
  Activity,
  Bell,
  Building2,
  CheckCircle2,
  DollarSign,
  Inbox,
  PackageOpen,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  ChartArea,
  ChartBar,
  ChartDonut,
  ChartLine,
  ChartWidget,
  KpiWidget,
  ListWidget,
  QueueWidget,
  StatusWidget,
  TimelineWidget,
  Widget,
} from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Widget preview — Admin' }

// Mock data — deterministic so the visual is stable across reloads.
const SPARK_DEMO = [4, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 18]
const SPARK_HEALTH = [22, 25, 24, 28, 27, 30, 32, 31, 33, 30, 29, 31]

const KPI_DELTA_UP = { value: '4%', direction: 'up' as const }
const KPI_DELTA_DOWN = { value: '12%', direction: 'down' as const }
const KPI_DELTA_FLAT = { value: '0%', direction: 'flat' as const }

const SIGNUPS_SERIES = [
  {
    name: 'Creators',
    tone: 'pink' as const,
    data: [
      { x: 'Mon', y: 4 },
      { x: 'Tue', y: 7 },
      { x: 'Wed', y: 5 },
      { x: 'Thu', y: 9 },
      { x: 'Fri', y: 8 },
      { x: 'Sat', y: 12 },
      { x: 'Sun', y: 11 },
    ],
  },
  {
    name: 'Partners',
    tone: 'ink' as const,
    data: [
      { x: 'Mon', y: 1 },
      { x: 'Tue', y: 2 },
      { x: 'Wed', y: 1 },
      { x: 'Thu', y: 3 },
      { x: 'Fri', y: 2 },
      { x: 'Sat', y: 4 },
      { x: 'Sun', y: 3 },
    ],
  },
]

const TOP_SKU_SERIES = [
  {
    name: 'Dispatches',
    tone: 'pink' as const,
    data: [
      { x: 'Strawberry Whey', y: 142 },
      { x: 'Vanilla Whey', y: 96 },
      { x: 'Berry Booster', y: 71 },
      { x: 'Greens Daily', y: 48 },
      { x: 'BCAA Pop', y: 33 },
    ],
  },
]

const DONUT_SEGMENTS = [
  { name: 'Producing', value: 42, tone: 'pink' as const },
  { name: 'Ready', value: 28, tone: 'success' as const },
  { name: 'In transit', value: 15, tone: 'info' as const },
  { name: 'Delivered', value: 60, tone: 'ink' as const },
  { name: 'Issues', value: 5, tone: 'danger' as const },
]

const LINE_SERIES = [
  {
    name: 'Requests / hr',
    tone: 'pink' as const,
    data: Array.from({ length: 24 }, (_, i) => ({
      x: `${i}:00`,
      y: Math.round(40 + Math.sin(i / 3) * 18 + (i % 3) * 4),
    })),
  },
]

export default function WidgetPreviewPage() {
  return (
    <div className="space-y-10 px-6 py-10">
      <header>
        <p className="text-[12px] uppercase tracking-[0.06em] text-ink-700">
          packages/ui · dev
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Dashboard widget preview
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          One of each @ilaunchify/ui dashboard variant rendered with mock data.
          Compare against /admin/dashboard and /admin/partners to verify visual
          parity before the rebuild lands.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      <Section title="KpiWidget — 5-card KPI strip">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiWidget
            href="/dashboard"
            label="Total creators"
            value={1284}
            icon={Users}
            tone="pink"
            delta={KPI_DELTA_UP}
            sparkline={SPARK_DEMO}
            span={3}
            active
          />
          <KpiWidget
            href="/partners"
            label="Active partners"
            value={42}
            icon={Building2}
            tone="ink"
            delta={KPI_DELTA_FLAT}
            sparkline={SPARK_DEMO}
            span={3}
          />
          <KpiWidget
            href="/products"
            label="Live products"
            value={318}
            icon={PackageOpen}
            tone="info"
            delta={KPI_DELTA_UP}
            span={3}
          />
          <KpiWidget
            href="/orders"
            label="Orders today"
            value={47}
            icon={ShoppingBag}
            tone="success"
            delta={KPI_DELTA_DOWN}
            sparkline={SPARK_DEMO}
            span={3}
          />
          <KpiWidget
            href="/orders?period=30d"
            label="Revenue · 30d"
            value="$48.2k"
            icon={DollarSign}
            tone="neon"
            delta={KPI_DELTA_UP}
            sparkline={SPARK_HEALTH}
            sublabel="vs $41.0k last period"
            span={3}
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="ChartWidget — Area / Bar / Donut / Line">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <ChartWidget
            title="Signups · last 7 days"
            subtitle="Creators vs partners"
            tone="pink"
            icon={TrendingUp}
            footerLink={{ href: '/tiers', label: 'Open Tiers' }}
            span={6}
          >
            <ChartArea series={SIGNUPS_SERIES} height={220} />
          </ChartWidget>

          <ChartWidget
            title="Top SKUs · 30 days"
            subtitle="By dispatch volume"
            tone="ink"
            icon={PackageOpen}
            span={6}
          >
            <ChartBar series={TOP_SKU_SERIES} horizontal height={220} />
          </ChartWidget>

          <ChartWidget
            title="Orders by status"
            subtitle="All-time distribution"
            tone="success"
            icon={ShoppingBag}
            span={4}
          >
            <ChartDonut
              segments={DONUT_SEGMENTS}
              height={220}
              centerLabel={
                <div>
                  <p className="font-display text-2xl font-semibold tabular-nums text-ink-900">
                    150
                  </p>
                  <p className="text-[11px] text-ink-500">total</p>
                </div>
              }
            />
          </ChartWidget>

          <ChartWidget
            title="Webhook traffic · 24h"
            subtitle="Stripe events / hour"
            tone="info"
            icon={Activity}
            span={8}
          >
            <ChartLine series={LINE_SERIES} height={220} />
          </ChartWidget>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="ListWidget — Inbox preview">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <ListWidget
            title="Inbox"
            subtitle="5 oldest pending items, across every queue"
            tone="pink"
            icon={Inbox}
            footerLink={{ href: '/leads', label: 'Open Leads' }}
            span={6}
            items={[
              {
                id: 'lead-1',
                label: 'New lead from contact form',
                sublabel: 'Lead · Acme Foods · ops@acme.test',
                href: '/leads/1',
                tone: 'warning',
                trailingLabel: '3d',
              },
              {
                id: 'partner-1',
                label: 'Sunrise Co-Pack awaiting verification',
                sublabel: 'Partner · OPS_PENDING_REVIEW',
                href: '/partners/1',
                tone: 'info',
                trailingLabel: '2d',
              },
              {
                id: 'product-1',
                label: 'Berry Booster gummy under review',
                sublabel: 'Product · PENDING_REVIEW',
                href: '/products/1',
                tone: 'pink',
                trailingLabel: '1d',
              },
              {
                id: 'ingredient-1',
                label: 'Self-attested: Stevia Reb-M',
                sublabel: 'Ingredient · SELF_ATTESTED',
                href: '/ingredients/1',
                tone: 'success',
                trailingLabel: 'today',
              },
              {
                id: 'cert-1',
                label: 'NSF cert pending renewal',
                sublabel: 'Cert · expires in 28d',
                href: '/certificate-types/1',
                tone: 'danger',
                value: 'URGENT',
                trailingLabel: '28d',
              },
            ]}
          />

          <ListWidget
            title="Top SKUs"
            subtitle="Last 30 days"
            tone="ink"
            icon={PackageOpen}
            span={6}
            items={[
              { id: '1', label: 'Strawberry Whey Protein 500g', value: '142' },
              { id: '2', label: 'Vanilla Whey Protein 500g', value: '96' },
              { id: '3', label: 'Berry Booster Gummy', value: '71' },
              { id: '4', label: 'Greens Daily Powder', value: '48' },
              { id: '5', label: 'BCAA Pop Pre-workout', value: '33' },
            ]}
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="QueueWidget — Moderation queue">
        <QueueWidget
          title="Awaiting your attention"
          subtitle="5 items past their threshold"
          tone="pink"
          icon={<Bell className="h-4 w-4" aria-hidden="true" />}
          footerLink={{ href: '/inbox', label: 'Open full inbox' }}
          span={12}
          items={[
            {
              id: 'q-lead-1',
              label: 'Acme Foods lead — stuck 6 days',
              sublabel: 'Lead · ops@acme.test',
              icon: <Inbox className="h-4 w-4" aria-hidden="true" />,
              tone: 'warning',
              primaryAction: { label: 'Triage', href: '/leads/1', tone: 'ink' },
            },
            {
              id: 'q-product-1',
              label: 'Berry Booster gummy — stuck 5 days',
              sublabel: 'Product · PENDING_REVIEW',
              icon: <PackageOpen className="h-4 w-4" aria-hidden="true" />,
              tone: 'pink',
              primaryAction: { label: 'Review', href: '/products/1', tone: 'pink' },
            },
            {
              id: 'q-partner-1',
              label: 'Sunrise Co-Pack — stuck 7 days',
              sublabel: 'Partner · OPS_PENDING_REVIEW',
              icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
              tone: 'info',
              primaryAction: { label: 'Review', href: '/partners/1', tone: 'ink' },
            },
            {
              id: 'q-dispatch-1',
              label: 'Dispatch DSP-294 — past accept deadline',
              sublabel: 'OrderDispatch · auto-cancel pending',
              icon: <ShoppingBag className="h-4 w-4" aria-hidden="true" />,
              tone: 'danger',
              primaryAction: { label: 'Cancel', href: '/orders/1', tone: 'danger' },
            },
            {
              id: 'q-ingredient-1',
              label: 'Stevia Reb-M — self-attested 8 days',
              sublabel: 'Ingredient · SELF_ATTESTED',
              icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
              tone: 'success',
              primaryAction: { label: 'Promote', href: '/ingredients/1', tone: 'success' },
            },
          ]}
        />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="StatusWidget — System health">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <StatusWidget
            title="Service health"
            subtitle="Updated every 60s"
            tone="info"
            icon={Activity}
            span={6}
            indicators={[
              {
                label: 'Compliance service',
                value: '142ms',
                sublabel: 'Avg render · last 100 calls',
                status: 'green',
                sparkline: SPARK_HEALTH,
              },
              {
                label: 'Stripe webhooks',
                value: '99.7%',
                sublabel: 'Success rate · 24h',
                status: 'green',
                sparkline: SPARK_HEALTH,
              },
              {
                label: 'auto-cancel-dispatches cron',
                value: '4h ago',
                sublabel: 'Last successful run',
                status: 'amber',
              },
              {
                label: 'audit-retention cron',
                value: '23h ago',
                sublabel: 'Stale — expected hourly',
                status: 'red',
              },
            ]}
          />

          <StatusWidget
            title="Stripe Connect"
            subtitle="Onboarding gates"
            tone="success"
            icon={CheckCircle2}
            span={6}
            indicators={[
              { label: 'KYB complete', status: 'green' },
              { label: 'Payouts enabled', status: 'green' },
              { label: 'Debits available', status: 'amber', value: 'pending' },
            ]}
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="TimelineWidget — Recent activity">
        <TimelineWidget
          title="Recent activity"
          subtitle="Latest 6 platform events"
          tone="pink"
          icon={Activity}
          footerLink={{ href: '/audit', label: 'Open audit log' }}
          span={12}
          items={[
            {
              id: 'a-1',
              when: new Date(Date.now() - 1000 * 60 * 7),
              title: 'Pavel activated Sunrise Co-Pack',
              body: 'Partner status moved DRAFT → ACTIVE',
              href: '/partners/1',
              tone: 'success',
            },
            {
              id: 'a-2',
              when: new Date(Date.now() - 1000 * 60 * 42),
              title: 'Order ORD-1842 paid',
              body: '$1,420 · Berry Booster gummy · 500 units',
              href: '/orders/1',
              tone: 'pink',
            },
            {
              id: 'a-3',
              when: new Date(Date.now() - 1000 * 60 * 60 * 3),
              title: 'Anna requested changes on Mango Whey',
              body: 'Product · ingredient slot 2 review',
              href: '/products/2',
              tone: 'warning',
            },
            {
              id: 'a-4',
              when: new Date(Date.now() - 1000 * 60 * 60 * 9),
              title: 'New creator signed up · @glowco',
              href: '/creators/3',
              tone: 'ink',
            },
            {
              id: 'a-5',
              when: new Date(Date.now() - 1000 * 60 * 60 * 26),
              title: 'NSF cert verified for North Shore Labs',
              href: '/partners/4',
              tone: 'info',
            },
          ]}
        />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Widget — loading + error states">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Widget
            title="Loading widget"
            subtitle="Render-test for skeleton state"
            tone="ink"
            icon={Activity}
            loading
            span={6}
          />
          <Widget
            title="Error widget"
            subtitle="Render-test for the error state"
            tone="danger"
            icon={Activity}
            error="Failed to fetch dispatches: ETIMEDOUT"
            span={6}
          />
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-3 font-display text-[15px] font-bold uppercase tracking-[0.08em] text-ink-700">
        {title}
      </h2>
      {children}
    </section>
  )
}
