// Cron reliability ledger writers. Replaces the audit-prefix inference the
// admin "System Health" row uses today with a real CronRun table.
//
// Usage:
//   const runId = await recordCronRun('sla-sweep')
//   try { ... ; await finishCronRun(runId, { ok: true, payload: { processed } }) }
//   catch (e) { await finishCronRun(runId, { ok: false, error: String(e) }); throw e }
//
// Both writers are fire-and-forget (never throw) so instrumentation can't break
// the job it wraps. See docs/ANALYTICS_P0_SUBSTRATE_SPEC.md §2.5.

import { prisma } from '@ilaunchify/db'

/** Start a cron run; returns the row id to pass to finishCronRun (or null on failure). */
export async function recordCronRun(name: string): Promise<string | null> {
  try {
    const row = await prisma.cronRun.create({ data: { name, status: 'RUNNING' } })
    return row.id
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analytics] recordCronRun failed', {
      name,
      err: (err as Error).message,
    })
    return null
  }
}

export async function finishCronRun(
  id: string | null,
  result: { ok: boolean; error?: string; payload?: Record<string, unknown> },
): Promise<void> {
  if (!id) return
  try {
    const row = await prisma.cronRun.findUnique({
      where: { id },
      select: { startedAt: true },
    })
    const finishedAt = new Date()
    await prisma.cronRun.update({
      where: { id },
      data: {
        status: result.ok ? 'OK' : 'FAILED',
        finishedAt,
        durationMs: row ? finishedAt.getTime() - row.startedAt.getTime() : null,
        error: result.error ?? null,
        payload: (result.payload ?? undefined) as never,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analytics] finishCronRun failed', {
      id,
      err: (err as Error).message,
    })
  }
}
