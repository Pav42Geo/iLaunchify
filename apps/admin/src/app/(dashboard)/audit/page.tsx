// Admin audit log viewer.
// Reads from @ilaunchify/audit. Server-rendered; query params drive filters
// so links to a specific entity's history are shareable.

import { listAuditLogs, AUDIT_ENTITY_TYPES } from '@ilaunchify/audit'
import { prisma } from '@ilaunchify/db'
import { Card } from '@ilaunchify/ui'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Audit log — Admin' }

interface AuditPageProps {
  searchParams: Promise<{
    entityType?: string
    entityId?: string
    actorId?: string
    actorRole?: string
    action?: string
    since?: string
    until?: string
  }>
}

function isValidEntityType(s: string | undefined): s is (typeof AUDIT_ENTITY_TYPES)[number] {
  return !!s && (AUDIT_ENTITY_TYPES as readonly string[]).includes(s)
}

const ACTOR_ROLES = ['ADMIN', 'CREATOR', 'PARTNER', 'SYSTEM'] as const
function isValidActorRole(s: string | undefined): s is (typeof ACTOR_ROLES)[number] {
  return !!s && (ACTOR_ROLES as readonly string[]).includes(s)
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const sp = await searchParams

  const filters = {
    entityType: isValidEntityType(sp.entityType) ? sp.entityType : undefined,
    entityId: sp.entityId,
    actorId: sp.actorId,
    actorRole: isValidActorRole(sp.actorRole) ? sp.actorRole : undefined,
    action: sp.action,
    since: sp.since ? new Date(sp.since) : undefined,
    until: sp.until ? new Date(sp.until) : undefined,
  }

  const logs = await listAuditLogs({ ...filters, limit: 100 })

  // Resolve actor IDs to user records in one batch so we can show names
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))] as string[]
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, email: true, name: true, role: true },
  })
  const actorById = new Map(actors.map((u) => [u.id, u]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Append-only history of every state transition on partners, orders, dispatches,
          payments, and files. Last 100 entries shown.
        </p>
      </div>

      <FilterForm currentFilters={filters} />

      <Card className="overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No audit entries match these filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Change</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {logs.map((log) => {
                const actor = log.actorId ? actorById.get(log.actorId) : null
                return (
                  <tr key={log.id} className="hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {new Date(log.at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {log.actorRole === 'SYSTEM' ? (
                        <span className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700">
                          SYSTEM
                        </span>
                      ) : actor ? (
                        <div>
                          <div className="font-medium text-zinc-900">
                            {actor.name ?? actor.email}
                          </div>
                          <div className="text-xs text-zinc-500">{log.actorRole}</div>
                        </div>
                      ) : (
                        <span className="text-zinc-400">{log.actorRole}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/audit?entityType=${log.entityType}&entityId=${log.entityId}`}
                        className="text-brand-primary hover:underline"
                      >
                        {log.entityType}
                      </Link>
                      <div className="font-mono text-xs text-zinc-500">{log.entityId.slice(0, 12)}…</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{log.action}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600">
                      {log.fromValue || log.toValue ? (
                        <>
                          <span className="text-zinc-400">{log.fromValue ?? '∅'}</span>
                          <span className="mx-1 text-zinc-400">→</span>
                          <span className="font-medium text-zinc-900">{log.toValue ?? '∅'}</span>
                        </>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="max-w-md px-4 py-3 text-xs text-zinc-500">
                      {log.payload ? (
                        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs">
                          {JSON.stringify(log.payload, null, 0).slice(0, 120)}
                          {JSON.stringify(log.payload).length > 120 && '…'}
                        </pre>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function FilterForm({ currentFilters }: { currentFilters: Record<string, unknown> }) {
  // Use a GET form so filters are reflected in the URL — share-friendly + back-button-friendly
  return (
    <Card className="p-4">
      <form className="flex flex-wrap items-end gap-3" method="GET">
        <div className="flex flex-col text-xs">
          <label className="mb-1 font-medium text-zinc-700">Entity</label>
          <select
            name="entityType"
            defaultValue={(currentFilters.entityType as string) ?? ''}
            className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {AUDIT_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col text-xs">
          <label className="mb-1 font-medium text-zinc-700">Actor role</label>
          <select
            name="actorRole"
            defaultValue={(currentFilters.actorRole as string) ?? ''}
            className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="ADMIN">ADMIN</option>
            <option value="PARTNER">PARTNER</option>
            <option value="CREATOR">CREATOR</option>
            <option value="SYSTEM">SYSTEM</option>
          </select>
        </div>

        <div className="flex flex-col text-xs">
          <label className="mb-1 font-medium text-zinc-700">Action</label>
          <input
            name="action"
            type="text"
            defaultValue={(currentFilters.action as string) ?? ''}
            placeholder="e.g. PARTNER_ACTIVATE"
            className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col text-xs">
          <label className="mb-1 font-medium text-zinc-700">Entity ID</label>
          <input
            name="entityId"
            type="text"
            defaultValue={(currentFilters.entityId as string) ?? ''}
            placeholder="cuid"
            className="w-48 rounded border border-zinc-200 bg-white px-2 py-1.5 font-mono text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Filter
          </button>
          <Link
            href="/audit"
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Reset
          </Link>
        </div>
      </form>
    </Card>
  )
}
