// Integrations & API keys — control center (docs/INTEGRATIONS.md).
//
// SECURITY: this page shows whether each integration's env vars are CONFIGURED in
// the running environment. It never reads, displays, or stores secret values.
// Rotate keys in the vendor dashboard, then update your host's env vars.

import { requireCapability } from '@ilaunchify/auth'
import { getIntegrationMetaMap } from '@ilaunchify/db'
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
import { RotationControl } from './RotationControl'

function RotationBadge({ r }: { r: RotationStatus }) {
  if (r.state === 'unknown') {
    return <span className="text-[11px] text-ink-400">Rotation not recorded</span>
  }
  const tone = {
    ok: 'text-emerald-700',
    'due-soon': 'text-amber-700',
    overdue: 'text-rose-700',
  }[r.state]
  const d = r.daysUntilDue ?? 0
  const label = r.state === 'overdue' ? `Overdue by ${Math.abs(d)}d` : r.state === 'due-soon' ? `Due in ${d}d` : `Healthy — due in ${d}d`
  return <span className={`text-[11px] font-medium ${tone}`}>{label}</span>
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Developer & API keys — Admin' }

const KIND_CHIP: Record<EnvVarKind, string> = {
  secret: 'bg-rose-50 text-rose-700 border-rose-200',
  config: 'bg-sky-50 text-sky-700 border-sky-200',
  public: 'bg-ink-50 text-ink-500 border-ink-200',
}

function StatePill({ state }: { state: IntegrationStatus['state'] }) {
  const map = {
    configured: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    partial: 'border-amber-200 bg-amber-50 text-amber-800',
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
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Developer &amp; API
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          API keys &amp; integration status
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
          Every external service the platform talks to, and whether it&apos;s configured in this
          environment. Rotate a key in the vendor&apos;s dashboard, then update the matching env
          var on your host.
        </p>
      </div>

      {/* Security banner — the whole point of the design */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4.5 w-4.5 flex-none text-emerald-600" />
        <p className="text-[12.5px] leading-relaxed text-emerald-900">
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
          { label: 'Configured', value: configured, tone: 'text-emerald-700' },
          { label: 'Partial / Not set', value: partial + missing, tone: (partial + missing) > 0 ? 'text-amber-700' : 'text-ink-900' },
          { label: 'Planned slots', value: planned, tone: 'text-ink-500' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
            <div className={`font-display text-[26px] font-bold tabular-nums ${k.tone}`}>{k.value}</div>
            <div className="text-[11.5px] text-ink-500">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Per-category integration cards */}
      {byCategory.map(({ cat, items }) => (
        <section key={cat} className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">{cat}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((s) => (
              <div key={s.def.key} className="rounded-2xl border border-ink-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-[15px] font-semibold text-ink-900">{s.def.name}</h3>
                      {s.environment && (
                        <span className={`rounded-full border px-1.5 py-[1px] text-[10px] font-semibold uppercase ${s.environment === 'live' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
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
                  {s.def.lifecycle === 'live' && <StatePill state={s.state} />}
                </div>

                <p className="mt-2 text-[12.5px] leading-snug text-ink-600">{s.def.description}</p>

                {/* env var checklist */}
                <ul className="mt-3 space-y-1.5">
                  {s.vars.map((v) => (
                    <li key={v.name} className="flex items-center gap-2 text-[12px]">
                      <span
                        className={`inline-flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                          v.present ? 'bg-emerald-100 text-emerald-700' : v.required ? 'bg-rose-100 text-rose-700' : 'bg-ink-100 text-ink-400'
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
                        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Rotation</span>
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
