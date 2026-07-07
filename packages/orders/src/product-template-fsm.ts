// ProductTemplate finite-state-machine — the missing lifecycle home.
//
// Structural fix (2026-07-06): ProductTemplate status changes were scattered as
// inline `prisma.productTemplate.update({ status })` across partner + admin
// actions with no shared transition table — the "route through an FSM helper"
// invariant had no home for products. This is that home, in the same
// assert-guard style as order-fsm / dispatch-fsm / rating-appeal.
//
// Pattern (matches assertOrderTransition): the guard + table live here and are
// pure/unit-testable; the DB update + AuditLog stay at the call site, which
// calls assertProductTemplateTransition(from, to) BEFORE mutating.
//
// States from prisma ProductTemplateStatus enum:
//   DRAFT → PENDING_REVIEW → (PUBLISHED | NEEDS_CHANGES | REJECTED)
//   PUBLISHED → (PAUSED | PENDING_EDIT_REVIEW)   PAUSED → (PUBLISHED | REJECTED)
//   Legacy aliases: UNDER_REVIEW (= PENDING_REVIEW), ARCHIVED (= REJECTED, terminal)

import type { ProductTemplateStatus } from '@ilaunchify/db'

export const PRODUCT_TEMPLATE_TRANSITIONS: Partial<
  Record<ProductTemplateStatus, ProductTemplateStatus[]>
> = {
  DRAFT: ['PENDING_REVIEW', 'REJECTED'], // submit for review; partner self-archive (REJECTED/ARCHIVED role)
  PENDING_REVIEW: ['PUBLISHED', 'NEEDS_CHANGES', 'REJECTED'],
  NEEDS_CHANGES: ['PENDING_REVIEW', 'REJECTED'], // resubmit after admin-requested changes
  PUBLISHED: ['PAUSED', 'PENDING_EDIT_REVIEW'], // pause live listing; edit-to-live held for review
  PENDING_EDIT_REVIEW: ['PUBLISHED', 'NEEDS_CHANGES'],
  PAUSED: ['PUBLISHED', 'REJECTED'], // resume, or retire a paused listing
  REJECTED: ['PENDING_REVIEW'], // partner may resubmit as a fresh submission
  // Legacy aliases preserved for back-compat with pre-2026-05-24 rows.
  UNDER_REVIEW: ['PUBLISHED', 'NEEDS_CHANGES', 'REJECTED'],
  ARCHIVED: [],
}

export function isProductTemplateTransitionAllowed(
  from: ProductTemplateStatus,
  to: ProductTemplateStatus,
): boolean {
  return PRODUCT_TEMPLATE_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Throws on a structurally invalid ProductTemplate status change. Call this at
 * the top of any action that flips ProductTemplate.status, then do the DB update
 * + AuditLog. Same contract as assertOrderTransition.
 */
export function assertProductTemplateTransition(
  from: ProductTemplateStatus,
  to: ProductTemplateStatus,
): void {
  if (from === to) return // idempotent no-op flips are allowed
  if (!isProductTemplateTransitionAllowed(from, to)) {
    throw new Error(`Invalid ProductTemplate transition: ${from} → ${to}`)
  }
}
