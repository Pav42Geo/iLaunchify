// Settings → Analytics (admin config for the analytics stack).
//
// Two halves:
//   • Status — read-only, env-backed (like the Integrations registry): is PostHog
//     configured, which host, is the AnalyticsEvent substrate migrated. Shows
//     configured/missing, never secret values.
//   • Config — the editable AnalyticsSetting singleton (capture switch + thresholds
//     the Insights surface reads). Saved via a server action, audited.
//
// Viewing analytics lives at the top-level /insights surface; this page is the knobs.

import { requireCapability } from '@ilaunchify/auth'
import { getAnalyticsSettings, prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { AnalyticsSettingsForm } from './AnalyticsSettingsForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Analytics — Admin' }

export default async function AnalyticsSettingsPage() {
  await requireCapability('platform:admin')
  const settings = await getAnalyticsSettings()

  // Env-backed status (server-only — never expose the key value itself).
  const serverKey = Boolean(process.env.POSTHOG_KEY)
  const clientKey = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
  const host = process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

  // Is the P0 analytics substrate migrated? Probe with a cheap count.
  let substrate: { migrated: boolean; count: number | null } = { migrated: false, count: null }
  try {
    const count = await (
      prisma as unknown as { analyticsEvent: { count: () => Promise<number> } }
    ).analyticsEvent.count()
    substrate = { migrated: true, count }
  } catch {
    substrate = { migrated: false, count: null }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Settings"
        title="Analytics"
        description="Configure the analytics stack — the behavioral-capture switch and the targets the Insights surface reads. PostHog credentials are set via environment variables (status below), never stored here. View the metrics themselves under Insights."
      />

      {/* Status */}
      <section className="rounded-2xl border border-ink-200 bg-white">
        <div className="border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3">
          <h2 className="font-display text-[14px] font-semibold text-ink-900">Status</h2>
        </div>
        <div className="divide-y divide-ink-100">
          <StatusRow
            label="PostHog — server sink"
            ok={serverKey}
            value={serverKey ? 'Configured (POSTHOG_KEY set)' : 'Not configured — server events stay in the local store only'}
          />
          <StatusRow
            label="PostHog — client capture"
            ok={clientKey}
            value={clientKey ? 'Configured (NEXT_PUBLIC_POSTHOG_KEY set)' : 'Not configured — behavioral events not forwarded'}
          />
          <StatusRow label="Ingestion host" ok neutral value={host} />
          <StatusRow
            label="Event substrate"
            ok={substrate.migrated}
            value={
              substrate.migrated
                ? `Migrated · ${substrate.count?.toLocaleString() ?? 0} events stored`
                : 'Not migrated — run db:push + db:generate (P0)'
            }
          />
        </div>
      </section>

      <AnalyticsSettingsForm initial={settings} />
    </div>
  )
}

function StatusRow({
  label,
  value,
  ok,
  neutral,
}: {
  label: string
  value: string
  ok: boolean
  neutral?: boolean
}) {
  const dot = neutral ? 'bg-ink-300' : ok ? 'bg-success-500' : 'bg-warning-500'
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-[12.5px] font-semibold text-ink-800">{label}</span>
      <span className="flex items-center gap-2 text-right text-[12.5px] text-ink-600">
        {value}
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      </span>
    </div>
  )
}
