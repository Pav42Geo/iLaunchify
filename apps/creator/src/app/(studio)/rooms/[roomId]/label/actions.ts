'use server'

// Room label Studio — save action (A8). Persists the editable Fabric JSON to a
// room-scoped Design row (Design.roomId). Access is re-checked here via the
// shared collaborator guard — NEVER trust the client. C9 attribution: every
// save stamps savedByUserId; saves coalesce within an editing turn (same user,
// recent) so autosave doesn't explode the version list.
//
// Submit-to-room is NOT here — that's creatorSubmitLabelProof (owner-only) in
// the (dashboard) room actions; the client calls it after composing the proof.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { getCollaboratorAccessForUser } from '@ilaunchify/orders'

export type SaveResult = { ok: true; version: number } | { ok: false; error: string }

/** Same-editor saves within this window update the latest version in place. */
const TURN_COALESCE_MS = 2 * 60 * 1000

export async function saveRoomLabelDesign(roomId: string, designJson: unknown): Promise<SaveResult> {
  const user = await requireUser()
  const access = await getCollaboratorAccessForUser(roomId, user.id)
  if (!access.canEdit) return { ok: false, error: 'You don’t have edit access to this design.' }

  if (!designJson || typeof designJson !== 'object') return { ok: false, error: 'Nothing to save.' }

  const design = await prisma.design.findFirst({
    where: { roomId },
    select: {
      id: true,
      versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, savedByUserId: true, createdAt: true } },
    },
  })
  if (!design) return { ok: false, error: 'Design workspace not initialized — reopen the editor.' }

  const latest = design.versions[0]
  const data = { designJson: designJson as object }

  // Coalesce within an editing turn: same saver, recent → overwrite in place.
  if (
    latest &&
    latest.savedByUserId === user.id &&
    Date.now() - latest.createdAt.getTime() < TURN_COALESCE_MS
  ) {
    await prisma.designVersion.update({ where: { id: latest.id }, data })
    return { ok: true, version: latest.version }
  }

  const version = (latest?.version ?? 0) + 1
  await prisma.designVersion.create({
    data: { designId: design.id, version, savedByUserId: user.id, source: 'USER_UPLOAD', ...data },
  })
  return { ok: true, version }
}
