// @ilaunchify/audit — append-only audit log writer + query helpers.
//
// All write paths (server actions, webhook handlers, cron jobs, migrations)
// should call logAudit() or logAuditAs() instead of touching prisma.auditLog
// directly. This keeps the actor-role + payload conventions consistent.
//
// Reads are exposed via the AuditLogQuery helpers used by /admin/audit page.

export { logAudit, logAuditAs, logSystemAudit } from './log'
export { listAuditLogs, listEntityHistory, listActorHistory } from './query'
// Runtime constants (the const arrays themselves) — needed by admin UI for
// the audit filter dropdown. The TYPE forms are also exported below.
export { AUDIT_ENTITY_TYPES, AUDIT_ACTIONS } from './types'
export type {
  AuditEntry,
  AuditEntryInput,
  AuditEntityType,
  AuditAction,
} from './types'
