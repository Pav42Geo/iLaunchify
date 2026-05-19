// Writers for the AuditLog table. Use these instead of `prisma.auditLog.create`
// directly so the actor-role + payload conventions stay consistent.

import { prisma } from '@ilaunchify/db'
import type { AuditEntryInput } from './types'

/**
 * Low-level audit writer. Pass actor info explicitly. Returns the created row.
 *
 * Failures are logged but don't throw — audit writes should NEVER block the
 * business operation that triggered them. If the audit insert fails, the
 * caller's transaction still commits.
 */
export async function logAudit(input: AuditEntryInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        fromValue: input.fromValue ?? null,
        toValue: input.toValue ?? null,
        // Prisma JSON field accepts null or undefined to skip; coerce explicitly
        payload: (input.payload ?? undefined) as never,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write audit log entry', {
      entry: input,
      err: (err as Error).message,
    })
  }
}

/**
 * Convenience writer when you have a User object handy (most server actions
 * call requireUser() at the top). Maps user.role -> actorRole automatically.
 */
export async function logAuditAs(
  user: { id: string; role: 'ADMIN' | 'CREATOR' | 'PARTNER' },
  entry: Omit<AuditEntryInput, 'actorId' | 'actorRole'>,
): Promise<void> {
  return logAudit({
    ...entry,
    actorId: user.id,
    actorRole: user.role,
  })
}

/**
 * Convenience writer for SYSTEM-triggered events (Stripe webhooks, cron jobs,
 * scheduled state transitions). Use this so the audit row clearly indicates
 * the platform itself initiated the change.
 */
export async function logSystemAudit(
  entry: Omit<AuditEntryInput, 'actorId' | 'actorRole'>,
): Promise<void> {
  return logAudit({
    ...entry,
    actorId: null,
    actorRole: 'SYSTEM',
  })
}
