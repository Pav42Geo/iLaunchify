'use server'

// Billing-details persistence (docs/BILLING_AND_ACCOUNTING.md slice 1).
// Plain invoice/tax contact data — no payment instruments touch this path.

import { requireUser } from '@ilaunchify/auth'
import { upsertBillingProfile, type BillingProfileValues } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export async function saveBillingDetails(
  values: BillingProfileValues,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  try {
    // Ownership is implicit: we only ever write the signed-in user's own profile
    // (keyed by user.id), so a creator can never edit another tenant's billing.
    await upsertBillingProfile(user.id, values)
    await logAuditAs(user, {
      entityType: 'BillingProfile',
      entityId: user.id,
      action: 'BILLING_PROFILE_UPDATED',
    })
    revalidatePath('/settings/billing')
    return { ok: true }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[billing] saveBillingDetails failed', (err as Error).message)
    return { ok: false, error: 'Could not save billing details. Please try again.' }
  }
}
