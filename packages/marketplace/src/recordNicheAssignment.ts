// @ilaunchify/marketplace — audit helper for niche assignments.
// Slice 3A. Writes one NicheAssignmentAudit row per assignment event so
// the admin queue + analytics can replay exactly who/what/when added or
// removed each niche on a ProductTemplate.
//
// Audit writes never throw — a logging failure must not block the business
// operation that triggered it. Mirrors the @ilaunchify/audit pattern.
// =============================================================================

import { prisma } from '@ilaunchify/db'
import type { RecordNicheAssignmentInput } from './types'

/**
 * Append a NicheAssignmentAudit row capturing one niche-add or niche-remove
 * event. `applied=true` for an assignment, `applied=false` for a removal.
 *
 * Sources:
 *   - AUTO_RULE     — engine accepted a rule suggestion (typically with ruleId)
 *   - MANUFACTURER  — partner toggled the chip in the editor
 *   - ADMIN         — admin override during product review
 *
 * Fails silently to console.error so a downstream audit outage never blocks
 * the user-visible mutation. The product-level AuditLog (via
 * @ilaunchify/audit's `logAuditAs`) is still written by the calling action
 * so we don't lose the forensic trail either way.
 */
export async function recordNicheAssignment(
  input: RecordNicheAssignmentInput,
): Promise<void> {
  try {
    await prisma.nicheAssignmentAudit.create({
      data: {
        productTemplateId: input.productTemplateId,
        nicheId: input.nicheId,
        source: input.source,
        ruleId: input.ruleId ?? null,
        actorUserId: input.actorUserId ?? null,
        applied: input.applied,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[marketplace] failed to write NicheAssignmentAudit', {
      input,
      err: (err as Error).message,
    })
  }
}
