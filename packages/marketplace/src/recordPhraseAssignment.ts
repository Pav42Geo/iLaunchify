// @ilaunchify/marketplace — audit helper for per-product phrase assignments.
// Writes one PhraseAssignmentAudit row per assignment event so the admin queue
// + analytics can replay exactly who/what/when added or removed each phrase on
// a ProductTemplate. Mirrors recordNicheAssignment.
//
// Audit writes never throw — a logging failure must not block the business
// operation that triggered it.
// =============================================================================

import { prisma } from '@ilaunchify/db'
import type { RecordPhraseAssignmentInput } from './types'

/**
 * Append a PhraseAssignmentAudit row capturing one phrase-add or phrase-remove
 * event. `applied=true` for an assignment, `applied=false` for a removal.
 *
 * Sources:
 *   - AUTO_RULE     — engine attached a rule-suggested phrase (typically ruleId)
 *   - MANUFACTURER  — partner toggled the phrase in the editor
 *   - ADMIN         — admin override during product review
 *
 * Fails silently to console.error so a downstream audit outage never blocks the
 * user-visible mutation. The product-level AuditLog (via @ilaunchify/audit's
 * `logAuditAs`) is still written by the calling action.
 */
export async function recordPhraseAssignment(
  input: RecordPhraseAssignmentInput,
): Promise<void> {
  try {
    await prisma.phraseAssignmentAudit.create({
      data: {
        productTemplateId: input.productTemplateId,
        mandatoryPhraseId: input.mandatoryPhraseId,
        source: input.source,
        ruleId: input.ruleId ?? null,
        actorUserId: input.actorUserId ?? null,
        applied: input.applied,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[marketplace] failed to write PhraseAssignmentAudit', {
      input,
      err: (err as Error).message,
    })
  }
}
