// Query helpers for the AuditLog table. Used by the admin /audit page and by
// per-entity history side-panels (e.g. "show history for this Partner").

import { prisma } from '@ilaunchify/db'
import type { AuditEntityType, AuditEntry } from './types'

export interface ListAuditLogsParams {
  limit?: number
  cursor?: string                         // last seen id for pagination
  entityType?: AuditEntityType
  entityId?: string
  actorId?: string
  actorRole?: 'ADMIN' | 'CREATOR' | 'PARTNER' | 'SYSTEM'
  action?: string
  since?: Date
  until?: Date
}

/**
 * Filtered list of audit log rows, newest first. All filters are optional and
 * additive. Default limit 50; max 200 to avoid runaway pages.
 */
export async function listAuditLogs(
  params: ListAuditLogsParams = {},
): Promise<AuditEntry[]> {
  const limit = Math.min(params.limit ?? 50, 200)
  return prisma.auditLog.findMany({
    where: {
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.actorRole ? { actorRole: params.actorRole } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.since || params.until
        ? {
            at: {
              ...(params.since ? { gte: params.since } : {}),
              ...(params.until ? { lte: params.until } : {}),
            },
          }
        : {}),
    },
    orderBy: { at: 'desc' },
    take: limit,
    ...(params.cursor
      ? { cursor: { id: params.cursor }, skip: 1 }
      : {}),
  })
}

/**
 * Shorthand for "history of a specific entity" — used in detail-page side panels.
 */
export async function listEntityHistory(
  entityType: AuditEntityType,
  entityId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  return listAuditLogs({ entityType, entityId, limit })
}

/**
 * Shorthand for "everything a specific actor did" — useful for admin
 * accountability views.
 */
export async function listActorHistory(
  actorId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  return listAuditLogs({ actorId, limit })
}
