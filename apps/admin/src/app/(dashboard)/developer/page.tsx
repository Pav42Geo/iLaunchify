// Integrations & API keys — control center (docs/INTEGRATIONS.md).
//
// SECURITY: this page shows whether each integration's env vars are CONFIGURED in
// the running environment. It never reads, displays, or stores secret values.
// Rotate keys in the vendor dashboard, then update your host's env vars.

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { getIntegrationMetaMap, getLogisticsSettings, prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ExternalLink, ShieldCheck, KeyRound, RotateCw } from 'lucide-react'
import {
  resolveIntegrationStatuses,
  computeRotationStatus,
  CATEGORY_ORDER,
  type IntegrationStatus,
  type EnvVarKind,
  type RotationStatus,
} from './integration-registry'
import { CopyEnvButton } from './CopyEnvButton'
import { TestConnectionButton } from './TestConnectionButton'
import { TestAllButton } from './TestAllButton'
import { RotationControl } from './RotationControl'

function RotationBadge({ r }: { r: RotationStatus }) {
  if (r.state === 'unknown') {
    return <span className="text-[11px] text-ink-400">Rotation not recorded</span>
  }
  const tone = {
    ok: 'text-success-700',
    'due-soon': 'text-warning-700',
    overdue: 'text-danger-700',
  }[r.state]
  const d = r.daysUntilDue ?? 0
  const label = r.state === 'overdue' ? `Overdue by ${Math.abs(d)}d` : r.state === 'due-soon' ? `Due in ${d}d` : `Healthy — due in ${d}d`
  return <span className={`text-[11px] font-medium ${tone}`}>{label}</span>
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Developer & API keys — Admin' }

const KIND_CHIP: Record<EnvVarKind, string> = {
  secret: 'bg-danger-50 text-danger-700 border-danger-200',
  config: 'bg-info-50 text-info-700 border-info-200',
  public: 'bg-ink-50 text-ink-500 border-ink-200',
}

/**
 * Gate pill for logistics rails: env configured is only HALF the switch —
 * the LogisticsSetting gate is the other half. One glance = full rail state.
 */
function GatePill({ state, on }: { state: IntegrationStatus['state']; on: boolean }) {
  const cls =
    state === 'configured' && on
      ? 'border-success-200 bg-success-50 text-success-700'
      : state === 'configured'
        ? 'border-warning-200 bg-warning-50 text-warning-800'
        : 'border-ink-200 bg-ink-50 text-ink-500'
  const label = state === 'configured' && on ? 'Rail live' : state === 'configured' ? 'Ready — gated off' : on ? 'Gate on, env missing' : 'Gate off'
  return (
    <Link
      href="/logistics/settings"
      className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold hover:opacity-80 ${cls}`}
      title="Flip in admin → Logistics → Gates"
    >
      {label}
    </Link>
  )
}

/** Last EasyPost tracker webhook seen — catches "key valid, webhook URL never registered". */
async function getLastEasyPostWebhookAt(): Promise<Date | null> {
  try {
    const row = await prisma.auditLog.findFirst({
      where: { action: 'SHIPMENT_LEG_TRACKING_UPDATE' },
      orderBy: { at: 'desc' },
      select: { at: true },
    })
    return row?.at ?? null
  } catch {
    return null
  }
}

function relTime(d: Date, now: Date): string {
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / (60 * 24))}d ago`
}

function StatePill({ state }: { state: IntegrationStatus['state'] }) {
  const map = {
    configured: 'border-success-200 bg-success-50 text-success-700',
    partial: 'border-warning-200 bg-warning-50 text-warning-800',
    missing: 'border-ink-200 bg-ink-50 text-ink-500',
  } as const
  const label = { configured: 'Configured', partial: 'Partial', missing: 'Not set' }[state]
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold ${map[state]}`}>
      {label}
    </span>
  )
}

export default async function IntegrationsPage() {
  await requireCapability('platform:admin')
  const statuses = resolveIntegrationStatuses()
  const metaMap = await getIntegrationMetaMap()
  // Logistics rails carry a second switch (LogisticsSetting gate) + webhook
  // liveness — fetched once, rendered per-card via def.gateKey.
  const gates = await getLogisticsSettings()
  const lastEasyPostWebhookAt = await getLastEasyPostWebhookAt()
  const now = new Date()

  const live = statuses.filter((s) => s.def.lifecycle === 'live')
  const configured = live.filter((s) => s.state === 'configured').length
  const partial = live.filter((s) => s.state === 'partial').length
  const missing = live.filter((s) => s.state === 'missing').length
  const planned = statuses.filter((s) => s.def.lifecycle === 'planned').length

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: statuses.filter((s) => s.def.category === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Integrations & API"
        title="API keys & integration status"
        description="Every external service the platform talks to, and whether it's configured in this environment. Rotate a key in the vendor's dashboard, then update the matching env var on your host."
      />

      {/* Security banner — the whole point of the design */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-success-200 bg-success-50/60 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4.5 w-4.5 flex-none text-success-600" />
        <p className="text-[12.5px] leading-relaxed text-success-900">
          <span className="font-semibold">Secret values are never shown or stored here.</span> This
          page only reports whether each variable is <em>set</em> in the running environment — the
          actual keys live in your host&apos;s env / secrets store, never in the database. To change a
          key: rotate it in the vendor dashboard, update the env var, redeploy/restart.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Live integrations', value: live.length, tone: 'text-ink-900' },
          { label: 'Configured', value: configured, tone: 'text-success-700' },
          { label: 'Partial / Not set', value: partial + missing, tone: (partial + missing) > 0 ? 'text-warning-700' : 'text-ink-900' },
          { label: 'Planned slots', value: planned, tone: 'text-ink-500' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
            <div className={`font-display text-[26px] font-bold tabular-nums ${k.tone}`}>{k.value}</div>
            <div className="text-[11.5px] text-ink-500">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Launch-readiness: probe every testable integration at once */}
      <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
        <div className="mb-2 flex items-center gap-2">
          <RotateCw className="h-3.5 w-3.5 text-ink-400" />
          <p className="text-[12.5px] text-ink-600">
            Verify everything&apos;s wired before a launch — runs each read-only probe in parallel.
          </p>
        </div>
        <TestAllButton />
      </div>

      {/* Per-category integration cards */}
      {byCategory.map(({ cat, items }) => (
        <section key={cat} className="space-y-3">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-700">{cat}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((s) => (
              <div key={s.def.key} className="rounded-2xl border border-ink-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-[15px] font-semibold text-ink-900">{s.def.name}</h3>
                      {s.environment && (
                        <span className={`rounded-full border px-1.5 py-[1px] text-[10px] font-semibold uppercase ${s.environment === 'live' ? 'border-danger-200 bg-danger-50 text-danger-700' : 'border-info-200 bg-info-50 text-info-700'}`}>
                          {s.environment}
                        </span>
                      )}
                      {s.def.lifecycle === 'planned' && (
                        <span className="rounded-full border border-ink-200 bg-ink-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase text-ink-400">
                          Planned
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-ink-500">{s.def.vendor}</p>
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    {s.def.gateKey && <GatePill state={s.state} on={gates[s.def.gateKey] === true} />}
                    {s.def.lifecycle === 'live' && <StatePill state={s.state} />}
                  </div>
                </div>

                <p className="mt-2 text-[12.5px] leading-snug text-ink-600">{s.def.description}</p>

                {/* env var checklist */}
                <ul className="mt-3 space-y-1.5">
                  {s.vars.map((v) => (
                    <li key={v.name} className="flex items-center gap-2 text-[12px]">
                      <span
                        className={`inline-flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                          v.present ? 'bg-success-100 text-success-700' : v.required ? 'bg-danger-100 text-danger-700' : 'bg-ink-100 text-ink-400'
                        }`}
                        title={v.present ? 'Set' : v.required ? 'Required — not set' : 'Optional — not set'}
                      >
                        {v.present ? '✓' : '○'}
                      </span>
                      <code className="font-mono text-[11.5px] text-ink-800">{v.name}</code>
                      <CopyEnvButton name={v.name} />
                      <span className={`rounded border px-1 py-[1px] text-[9px] font-semibold uppercase ${KIND_CHIP[v.kind]}`}>{v.kind}</span>
                      {v.required && <span className="text-[9.5px] font-semibold uppercase text-ink-400">req</span>}
                      {v.note && <span className="truncate text-[10.5px] text-ink-400">· {v.note}</span>}
                    </li>
                  ))}
                </ul>

                {/* footer links + rotation */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-2.5 text-[11.5px]">
                  {s.def.dashboardUrl && (
                    <a href={s.def.dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-pink-700 hover:text-pink-800">
                      <KeyRound className="h-3.5 w-3.5" /> Rotate keys <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {s.def.docsUrl && (
                    <a href={s.def.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-500 hover:text-ink-800">
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {s.def.rotationDays && (
                    <span className="inline-flex items-center gap-1 text-ink-400" title="Suggested rotation cadence">
                      <RotateCw className="h-3.5 w-3.5" /> rotate ~every {Math.round(s.def.rotationDays / 30)} mo
                    </span>
                  )}
                  {s.def.appLinks?.map((l) => (
                    <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-800">
                      {l.label}
                    </Link>
                  ))}
                  {s.def.key === 'easypost' && s.state === 'configured' && (
                    <span
                      className={`inline-flex items-center gap-1 ${lastEasyPostWebhookAt ? 'text-ink-400' : 'text-warning-700'}`}
                      title="Latest tracker webhook processed — 'never' with a configured key usually means the webhook URL isn't registered in the EasyPost dashboard"
                    >
                      webhook: {lastEasyPostWebhookAt ? relTime(lastEasyPostWebhookAt, now) : 'never received'}
                    </span>
                  )}
                </div>

                {s.def.testable && s.def.lifecycle === 'live' && (
                  <div className="mt-2.5">
                    <TestConnectionButton integrationKey={s.def.key} />
                  </div>
                )}

                {s.def.lifecycle === 'live' && s.vars.some((v) => v.kind === 'secret') && (() => {
                  const rot = computeRotationStatus(s.def, metaMap[s.def.key], now)
                  return (
                    <div className="mt-2.5 space-y-1.5 border-t border-ink-100 pt-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold uppercase tracking-wider text-ink-700">Rotation</span>
                        <RotationBadge r={rot} />
                      </div>
                      <RotationControl integrationKey={s.def.key} cadenceDays={rot.cadenceDays} />
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
