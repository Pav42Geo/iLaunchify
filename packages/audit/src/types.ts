// Audit log types — kept as string unions (not enums) so callers from any
// app can pass values without having to import a shared enum. The DB still
// stores them as strings; the AuditActorRole enum on the Prisma side enforces
// the small fixed set for actorRole only.

import type { AuditActorRole as PrismaActorRole, AuditLog } from '@prisma/client'

/**
 * Canonical list of entity types that flow through the audit log.
 * Add a new value here when you start logging a new model — keeping the
 * list central makes the /admin/audit filter dropdown easy.
 */
export const AUDIT_ENTITY_TYPES = [
  'Partner',
  'PartnerService',
  'PartnerVerificationSection',
  'PartnerFile',
  'User',
  'Lead',
  'Order',
  'OrderDispatch',
  'Charge',
  'Transfer',
  'Refund',
  'ProductTemplate',
  'Product',
  'PackagingSystem',
  'RulePack',
] as const
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

/**
 * Canonical list of audit actions. Free-form string in the DB so future
 * additions don't require a migration, but having a list makes review
 * dashboards consistent.
 */
export const AUDIT_ACTIONS = [
  // Partner lifecycle
  'PARTNER_APPLY',
  'PARTNER_SUBMIT_FOR_REVIEW',
  'PARTNER_ACTIVATE',
  'PARTNER_SUSPEND',
  'PARTNER_REACTIVATE',
  'PARTNER_REQUEST_CHANGES',
  // Verification
  'VERIFICATION_SECTION_VERIFY',
  'VERIFICATION_SECTION_NEEDS_CHANGES',
  'VERIFICATION_SECTION_REJECT',
  'VERIFICATION_SECTION_RESET',
  // Files
  'FILE_UPLOAD',
  'FILE_DELETE',
  // Service / capability edits
  'SERVICE_UPDATE',
  // Lead lifecycle
  'LEAD_QUALIFY',
  'LEAD_DISQUALIFY',
  // Creator production orders
  'ORDER_CREATED',
  'ORDER_PAID',
  'ORDER_CANCELLED',
  // Order / dispatch
  'DISPATCH_ACCEPT',
  'DISPATCH_DECLINE',
  'DISPATCH_PRODUCING',
  'DISPATCH_READY',
  'DISPATCH_SHIPPED',
  'DISPATCH_DELIVERED',
  'DISPATCH_AUTO_CANCEL',
  // Payments (mostly SYSTEM actor from webhooks)
  'CHARGE_SUCCEEDED',
  'TRANSFER_QUEUED',
  'TRANSFER_PAID',
  'REFUND_ISSUED',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {})

export type AuditActorRole = PrismaActorRole // re-export Prisma enum

export interface AuditEntryInput {
  actorId: string | null
  actorRole: AuditActorRole
  entityType: AuditEntityType
  entityId: string
  action: AuditAction
  fromValue?: string | null
  toValue?: string | null
  payload?: Record<string, unknown> | null
}

export type AuditEntry = AuditLog
