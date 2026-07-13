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
import { getCollaboratorAccessForUser, resolveEditLock } from '@ilaunchify/orders'
import { logAuditAs } from '@ilaunchify/audit'

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

  // Server-authoritative turn: a live lock held by someone else blocks the save
  // (client gates too, but never trust it). Free/stale/mine → allowed.
  const lock = await prisma.designEditLock.findUnique({ where: { designId: design.id } })
  const verdict = resolveEditLock(lock, user.id)
  if (verdict.action === 'REQUEST' || verdict.action === 'WAIT') {
    return { ok: false, error: 'Someone else is editing this label right now.' }
  }

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

// ── C6 turn-based edit lock (D-W4) ───────────────────────────────────────────
// The pure engine (resolveEditLock) decides ACQUIRE/ALREADY_HELD/REQUEST/WAIT
// from the persisted DesignEditLock; these actions just apply the verdict.
// pokeEditLock is idempotent — everyone in the room calls it on a timer.

export interface EditLockView {
  /** I currently hold the lock (may edit). */
  iHold: boolean
  state: 'EDITING' | 'WAITING' | 'VIEWER'
  /** Who's editing now (null when the lock is free). */
  holderName: string | null
  /** Set when I'm the holder and someone is waiting to take over. */
  pendingRequesterName: string | null
  /** Grace remaining (ms) while I wait for a takeover to mature. */
  remainingMs?: number
}

async function roomDesignForEdit(
  roomId: string,
  userId: string,
): Promise<{ designId: string; canEdit: boolean; userName: string } | null> {
  const access = await getCollaboratorAccessForUser(roomId, userId)
  const design = await prisma.design.findFirst({ where: { roomId }, select: { id: true } })
  if (!design) return null
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  return { designId: design.id, canEdit: access.canEdit, userName: me?.name ?? 'You' }
}

async function nameOf(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  return u?.name ?? 'Someone'
}

/** Idempotent poll/claim — resolves the verdict and applies its write. */
export async function pokeEditLock(roomId: string): Promise<EditLockView> {
  const user = await requireUser()
  const ctx = await roomDesignForEdit(roomId, user.id)
  if (!ctx || !ctx.canEdit) return { iHold: false, state: 'VIEWER', holderName: null, pendingRequesterName: null }

  const lock = await prisma.designEditLock.findUnique({ where: { designId: ctx.designId } })
  const verdict = resolveEditLock(lock, user.id)

  switch (verdict.action) {
    case 'ACQUIRE': {
      await prisma.designEditLock.upsert({
        where: { designId: ctx.designId },
        create: { designId: ctx.designId, holderUserId: user.id, heartbeatAt: new Date() },
        update: { holderUserId: user.id, heartbeatAt: new Date(), requestedByUserId: null, requestedAt: null },
      })
      // Audit the TURN change (who took edit control) — not the 20s heartbeats,
      // which are deliberately unaudited (too chatty; ALREADY_HELD path).
      await logAuditAs(user, {
        entityType: 'Design',
        entityId: ctx.designId,
        action: 'DESIGN_EDIT_LOCK_ACQUIRED',
        payload: { roomId, tookOverFrom: lock && lock.holderUserId !== user.id ? lock.holderUserId : null },
      })
      return { iHold: true, state: 'EDITING', holderName: ctx.userName, pendingRequesterName: null }
    }
    case 'ALREADY_HELD': {
      await prisma.designEditLock.update({ where: { designId: ctx.designId }, data: { heartbeatAt: new Date() } })
      return {
        iHold: true,
        state: 'EDITING',
        holderName: ctx.userName,
        pendingRequesterName: await nameOf(lock?.requestedByUserId ?? null),
      }
    }
    case 'REQUEST': {
      await prisma.designEditLock.update({
        where: { designId: ctx.designId },
        data: { requestedByUserId: user.id, requestedAt: new Date() },
      })
      return { iHold: false, state: 'WAITING', holderName: await nameOf(lock?.holderUserId ?? null), pendingRequesterName: null }
    }
    case 'WAIT':
      return {
        iHold: false,
        state: 'WAITING',
        holderName: await nameOf(lock?.holderUserId ?? null),
        pendingRequesterName: null,
        remainingMs: verdict.remainingMs,
      }
  }
}

/** Yield the lock (holder leaving, or "give control" to a waiter). */
export async function releaseEditLock(roomId: string): Promise<void> {
  const user = await requireUser()
  const design = await prisma.design.findFirst({ where: { roomId }, select: { id: true } })
  if (!design) return
  // Only the current holder may release.
  const { count } = await prisma.designEditLock.deleteMany({
    where: { designId: design.id, holderUserId: user.id },
  })
  if (count > 0) {
    await logAuditAs(user, {
      entityType: 'Design',
      entityId: design.id,
      action: 'DESIGN_EDIT_LOCK_RELEASED',
      payload: { roomId },
    })
  }
}
