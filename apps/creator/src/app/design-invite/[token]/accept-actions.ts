'use server'

// Designer invite acceptance + NDA gate — Shared Design Workspace C2/C4.
// D-W6: the NDA is a HARD gate. If no designer NDA is published yet in the
// Legal CMS (slug "designer-nda"), the seat activates but stays access-dead
// (evaluateCollaboratorAccess denies while ndaAcceptedAt is null) and the page
// says so honestly — safe-by-construction dark launch until counsel's doc (C1).

import { headers } from 'next/headers'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { recordLegalAcceptances } from '@ilaunchify/auth/server'
import { acceptDesignerInvite, markSeatNdaAccepted } from '@ilaunchify/orders'
import { getPublishedLegalDocument } from '@ilaunchify/legal'

export const DESIGNER_NDA_SLUG = 'designer-nda'

export async function acceptInviteAction(token: string): Promise<
  | { ok: true; roomId: string; seatId: string; ndaAccepted: boolean }
  | { ok: false; error: string }
> {
  const user = await requireUser()
  return acceptDesignerInvite(
    { id: user.id, email: user.email ?? '', role: user.role },
    token,
  )
}

export async function acceptNdaAction(seatId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()

  const doc = await getPublishedLegalDocument(prisma, DESIGNER_NDA_SLUG)
  if (!doc?.currentVersion) {
    return { ok: false, error: 'The designer agreement is being finalized — you will be notified when the workspace opens.' }
  }

  const h = await headers()
  await recordLegalAcceptances(
    { id: user.id, email: user.email ?? '', role: user.role },
    [doc.currentVersion.id],
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    h.get('user-agent'),
  )
  return markSeatNdaAccepted(seatId, user.id)
}
