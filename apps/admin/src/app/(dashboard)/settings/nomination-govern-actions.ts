'use server'

// Governed reject / reroute for partner nominations (D7) — the platform's
// override. docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. A nomination is
// always overridable: the platform can REJECT a not-yet-live pin or force-unpin
// (REVOKE → reroute to auto-rotation) an ACTIVE one for merit / risk / safety
// reasons. Both require a reason (the governance record), are FSM-guarded, and
// audited. Not gated on isNominationEnabled(): governance de-escalates and must
// always be available (a lingering pin can be torn down even after the feature
// is switched off).

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { assertNominationTransition } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

export type GovernResult = { ok: true } | { ok: false; error: string }

/** Governed reject — platform declines to honor a not-yet-live nomination. */
export async function rejectNomination(
  nominationId: string,
  reason: string,
): Promise<GovernResult> {
  const admin = await requireCapability('platform:admin')
  const trimmed = reason.trim()
  if (!trimmed) return { ok: false, error: 'A reason is required to reject a nomination.' }

  const nom = await prisma.partnerNomination.findUnique({
    where: { id: nominationId },
    select: { id: true, status: true },
  })
  if (!nom) return { ok: false, error: 'Nomination not found.' }
  try {
    assertNominationTransition(nom.status, 'REJECTED')
  } catch {
    return { ok: false, error: `Cannot reject a nomination in ${nom.status}.` }
  }

  await prisma.partnerNomination.update({
    where: { id: nominationId },
    data: { status: 'REJECTED', rejectedReason: trimmed },
  })
  await logAuditAs(admin, {
    entityType: 'PartnerNomination',
    entityId: nominationId,
    action: 'NOMINATION_REJECTED',
    fromValue: nom.status,
    toValue: 'REJECTED',
    payload: { reason: trimmed },
  })
  revalidatePath('/settings/nomination')
  return { ok: true }
}

/** Governed force-unpin (reroute) — override an ACTIVE pin; the leg falls back to rotation. */
export async function forceUnpinNomination(
  nominationId: string,
  reason: string,
): Promise<GovernResult> {
  const admin = await requireCapability('platform:admin')
  const trimmed = reason.trim()
  if (!trimmed) return { ok: false, error: 'A reason is required to force-unpin a nomination.' }

  const nom = await prisma.partnerNomination.findUnique({
    where: { id: nominationId },
    select: { id: true, status: true },
  })
  if (!nom) return { ok: false, error: 'Nomination not found.' }
  try {
    assertNominationTransition(nom.status, 'REVOKED')
  } catch {
    return { ok: false, error: `Cannot force-unpin a nomination in ${nom.status}.` }
  }

  await prisma.partnerNomination.update({
    where: { id: nominationId },
    data: { status: 'REVOKED', rejectedReason: trimmed },
  })
  await logAuditAs(admin, {
    entityType: 'PartnerNomination',
    entityId: nominationId,
    action: 'NOMINATION_FORCE_UNPINNED',
    fromValue: nom.status,
    toValue: 'REVOKED',
    payload: { reason: trimmed },
  })
  revalidatePath('/settings/nomination')
  return { ok: true }
}

// Void-returning wrappers so the console's inline forms can bind them directly
// (React form actions must resolve to void). The reason input is `required` in
// the UI; an empty reason no-ops in the underlying action.
export async function rejectNominationFromForm(
  nominationId: string,
  formData: FormData,
): Promise<void> {
  await rejectNomination(nominationId, String(formData.get('reason') ?? ''))
}

export async function forceUnpinNominationFromForm(
  nominationId: string,
  formData: FormData,
): Promise<void> {
  await forceUnpinNomination(nominationId, String(formData.get('reason') ?? ''))
}
