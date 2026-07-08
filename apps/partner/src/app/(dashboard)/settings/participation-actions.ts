'use server'

// Partner market-participation switch (Pavel 2026-07-08).
// PUBLIC = open-market: discoverable + auto-rotation + nominatable (higher
// obligations). INVITED_ONLY = private operator: nomination-only, no rotation,
// invisible in discovery. Switching TO PUBLIC is gated by a recorded clickwrap
// acknowledgment (Public Operator Terms — a section of the signed partner
// agreement) + a capacity confirmation; the evidentiary record is stamped on the
// Partner (version/time/IP/UA) and audited. Switching back to INVITED_ONLY only
// de-escalates, so it's a plain confirm. Reversible either way.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { PUBLIC_OPERATOR_TERMS_VERSION } from './participation-terms'

export type ParticipationResult = { ok: true } | { ok: false; error: string }

export async function setParticipationMode(input: {
  mode: 'PUBLIC' | 'INVITED_ONLY'
  /** Required when going PUBLIC: the Public Operator Terms version the partner accepted. */
  acceptedTermsVersion?: string
  /** Required when going PUBLIC: the partner re-affirmed MOQ / capacity / lead times. */
  capacityConfirmed?: boolean
}): Promise<ParticipationResult> {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, participationMode: true },
  })
  if (!partner) return { ok: false, error: 'No partner account found.' }
  if (partner.participationMode === input.mode) return { ok: true } // no-op

  if (input.mode === 'PUBLIC') {
    // Going open-market is the higher-obligation path — gate it.
    if (input.acceptedTermsVersion !== PUBLIC_OPERATOR_TERMS_VERSION) {
      return { ok: false, error: 'You must accept the current Public Operator Terms to go public.' }
    }
    if (!input.capacityConfirmed) {
      return { ok: false, error: 'Please confirm your capacity, MOQ and lead times are current.' }
    }

    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
    const userAgent = h.get('user-agent') ?? null
    const now = new Date()

    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        participationMode: 'PUBLIC',
        publicModeTermsVersion: input.acceptedTermsVersion,
        publicModeAcceptedAt: now,
        publicModeAcceptedIp: ip,
        publicModeAcceptedUserAgent: userAgent,
        publicModeCapacityConfirmedAt: now,
      },
    })
    await logAuditAs(user, {
      entityType: 'Partner',
      entityId: partner.id,
      action: 'PARTICIPATION_MODE_PUBLIC',
      fromValue: partner.participationMode,
      toValue: 'PUBLIC',
      payload: {
        termsVersion: input.acceptedTermsVersion,
        capacityConfirmed: true,
        ip,
      },
    })
    revalidatePath('/settings')
    return { ok: true }
  }

  // Back to private — de-escalating; plain confirm, no gate.
  await prisma.partner.update({
    where: { id: partner.id },
    data: { participationMode: 'INVITED_ONLY' },
  })
  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'PARTICIPATION_MODE_INVITED_ONLY',
    fromValue: partner.participationMode,
    toValue: 'INVITED_ONLY',
  })
  revalidatePath('/settings')
  return { ok: true }
}
