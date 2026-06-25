// =============================================================================
// /admin/security — Security & Access (Settings → Security & Access)
// =============================================================================
//
// V1 surface per docs/SECURITY_ARCHITECTURE.md (LOCKED 2026-06-05) + Pavel
// 2026-06-05: management controls + monitoring for the security substrate.
//   ① Cream hero + 5-KPI strip (locked admin v2 chrome)
//   ② Active sessions table — revoke one / revoke all per user
//   ③ Security event feed — security-relevant AuditLog rows
//   ④ Rate-limit pressure — live RateLimitBucket scopes
//   ⑤ Admins & roles overview
//
// Sessions are Auth.js DATABASE sessions: deleting the row signs the user
// out on their next request — that's the V1 kill switch.

import Link from 'next/link'
import {
  ShieldCheck,
  MonitorSmartphone,
  Crown,
  Gauge,
  History,
  type LucideIcon,
} from 'lucide-react'
import { requireCapability } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { loadSecurityData, type SecurityData } from './security-data'
import { SessionRowControls } from './SessionRowControls'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Security & Access — Admin' }

export default async function SecurityPage() {
  await requireCapability('security:admin')
  const data = await loadSecurityData()

  return (
    <div className="space-y-6">
      <Header kpis={data.kpis} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <SessionsPanel sessions={data.sessions} />
          <EventsPanel events={data.events} />
        </div>
        <div className="space-y-6">
          <AdminsPanel admins={data.admins} roleCounts={data.roleCounts} />
          <RatePressurePanel rows={data.ratePressure} />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Header — cream rounded-3xl band + KPI strip (locked v2 chrome)
// =============================================================================

function Header({ kpis }: { kpis: SecurityData['kpis'] }) {
  return (
    <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Settings · Security &amp; Access
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Security &amp; Access
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            Live sessions, security-relevant activity, and rate-limit pressure.
            Revoking a session signs that device out on its next request;
            &ldquo;revoke all&rdquo; is the account-compromise response.
          </p>
        </div>
        <Link
          href="/audit"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          <History className="h-3 w-3" aria-hidden="true" />
          Full audit log
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Active sessions" value={kpis.activeSessions} icon={MonitorSmartphone} tone="ink" />
        <KpiCard label="Admins" value={kpis.adminCount} icon={Crown} tone="pink" subline={`${kpis.totalUsers.toLocaleString()} users total`} />
        <KpiCard label="Security events · 24h" value={kpis.securityEvents24h} icon={ShieldCheck} tone="amber" />
        <KpiCard label="Rate buckets live" value={kpis.activeRateBuckets} icon={Gauge} tone="sky" />
        <KpiCard label="Users" value={kpis.totalUsers} icon={History} tone="ink" />
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  subline,
  tone,
}: {
  label: string
  value: number
  icon: LucideIcon
  subline?: string
  tone: 'ink' | 'sky' | 'pink' | 'amber'
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    sky: 'bg-sky-100 text-sky-700',
    pink: 'bg-pink-100 text-pink-700',
    amber: 'bg-amber-100 text-amber-700',
  }
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
            {value.toLocaleString()}
          </p>
          {subline && <p className="mt-1 truncate text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// ② Active sessions — sortable-by-default-recent plain <table> + revoke
// =============================================================================

const ROLE_TONE: Record<string, string> = {
  ADMIN: 'border-pink-200 bg-pink-50 text-pink-800',
  PARTNER: 'border-sky-200 bg-sky-50 text-sky-800',
  CREATOR: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

function SessionsPanel({ sessions }: { sessions: SecurityData['sessions'] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
        <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
          Active sessions <span className="font-normal text-ink-500">· {sessions.length}</span>
        </h2>
      </header>
      {sessions.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-ink-500">No active sessions.</p>
      ) : (
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
              <th className="px-4 py-2 font-semibold">User</th>
              <th className="px-2 py-2 font-semibold">Role</th>
              <th className="px-2 py-2 font-semibold">Expires</th>
              <th className="px-4 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-ink-50 last:border-0 hover:bg-zinc-50/60">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink-900">{s.user.name ?? '—'}</p>
                  <p className="text-[11px] text-ink-500">{s.user.email}</p>
                </td>
                <td className="px-2 py-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                      ROLE_TONE[s.user.role] ?? 'border-ink-200 bg-zinc-100 text-ink-700',
                    )}
                  >
                    {s.user.role}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-[11.5px] tabular-nums text-ink-600">
                  {s.expires.toLocaleDateString()}{' '}
                  <span className="text-ink-400">
                    {s.expires.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <SessionRowControls sessionId={s.id} userId={s.user.id} email={s.user.email} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// =============================================================================
// ③ Security event feed
// =============================================================================

function EventsPanel({ events }: { events: SecurityData['events'] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex items-center justify-between border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
        <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
          Security events
        </h2>
        <Link
          href="/audit"
          className="text-[11px] font-medium text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          View all →
        </Link>
      </header>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-ink-500">
          No security-relevant events yet.
        </p>
      ) : (
        <ul className="divide-y divide-ink-50">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5">
              <span className="font-mono text-[12px] uppercase tracking-wide text-ink-700">
                {e.at.toLocaleDateString()}{' '}
                {e.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="rounded-full border border-ink-200 bg-zinc-50 px-1.5 py-[1px] font-mono text-[10px] text-ink-700">
                {e.action}
              </span>
              <span className="text-[11.5px] text-ink-600">
                {e.entityType} · {e.actor ? (e.actor.name ?? e.actor.email) : 'system'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// =============================================================================
// ④ Rate-limit pressure + ⑤ Admins & roles
// =============================================================================

function RatePressurePanel({ rows }: { rows: SecurityData['ratePressure'] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
        <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
          Rate-limit pressure <span className="font-normal text-ink-500">· live windows</span>
        </h2>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-ink-500">
          No active rate windows — quiet right now.
        </p>
      ) : (
        <ul className="divide-y divide-ink-50">
          {rows.map((r) => (
            <li key={r.scope} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="font-mono text-[11.5px] text-ink-800">{r.scope}</span>
              <span className="text-[11px] tabular-nums text-ink-500">
                {r.buckets} bucket{r.buckets === 1 ? '' : 's'} · hottest{' '}
                <span className="font-semibold text-ink-900">{r.maxCount}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AdminsPanel({
  admins,
  roleCounts,
}: {
  admins: SecurityData['admins']
  roleCounts: SecurityData['roleCounts']
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
        <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
          Admins &amp; roles
        </h2>
      </header>
      <div className="flex flex-wrap gap-1.5 border-b border-ink-50 px-4 py-3">
        {roleCounts.map((r) => (
          <span
            key={r.role}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-wider',
              ROLE_TONE[r.role] ?? 'border-ink-200 bg-zinc-100 text-ink-700',
            )}
          >
            {r.role}
            <span className="font-normal tabular-nums">· {r.count.toLocaleString()}</span>
          </span>
        ))}
      </div>
      <ul className="divide-y divide-ink-50">
        {admins.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-ink-900">{a.name ?? '—'}</p>
              <p className="truncate text-[11px] text-ink-500">{a.email}</p>
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-ink-500">
              {a.sessionCount} session{a.sessionCount === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-ink-50 px-4 py-2.5 text-[10.5px] leading-snug text-ink-500">
        Role changes and 2FA enforcement are Tier 1.5 — admins are invite-only
        (signup refuses ADMIN), so this list only grows by deliberate action.
      </p>
    </section>
  )
}
