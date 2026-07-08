// PartnerService lifecycle FSM — shared core.
// Pure transition table + guard; DB update + AuditLog at the call site (matches
// assertPartnerTransition / assertOrderTransition). ServiceStatus = DRAFT |
// ACTIVE | PAUSED (schema). Go-live (DRAFT→ACTIVE) is the D8 per-service gate;
// PAUSED is a partner/admin pause; DRAFT (from ACTIVE/PAUSED) deactivates.

import type { ServiceStatus } from '@ilaunchify/db'

export const SERVICE_ALLOWED_TRANSITIONS: Partial<Record<ServiceStatus, ServiceStatus[]>> = {
  DRAFT: ['ACTIVE'], // go live once approved + activation-complete
  ACTIVE: ['PAUSED', 'DRAFT'], // pause (blackout/suspend) or deactivate
  PAUSED: ['ACTIVE', 'DRAFT'], // resume or deactivate
}

export function isServiceTransitionAllowed(from: ServiceStatus, to: ServiceStatus): boolean {
  return SERVICE_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Throws on a structurally invalid PartnerService.status change. Call before any
 * inline prisma.partnerService.update({ status }), then write the AuditLog.
 */
export function assertServiceTransition(from: ServiceStatus, to: ServiceStatus): void {
  if (from === to) return
  if (!isServiceTransitionAllowed(from, to)) {
    throw new Error(`Invalid PartnerService transition: ${from} → ${to}`)
  }
}
