'use server'

// Re-acceptance action for the creator dashboard gate (Phase L3).
// Thin wrapper over the shared recorder in @ilaunchify/auth: reads request IP/UA
// (same pattern as the partner e-sign action) and records the acceptances.

import { headers } from 'next/headers'
import { requireUser, recordLegalAcceptances } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'

export async function acceptLegalVersions(
  versionIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser()
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null
  try {
    await recordLegalAcceptances(user, versionIds, ip, userAgent)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not record acceptance: ${(err as Error).message}` }
  }
}
