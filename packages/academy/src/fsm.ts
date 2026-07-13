// @ilaunchify/academy — status FSM (ACADEMY_SPEC §8, §10).
//
// The ONLY path that writes an Academy entity's status. Enforces the shared
// lifecycle, sets publishedAt on publish, and writes an AuditLog row. Never call
// prisma.update({ data: { status } }) directly (CLAUDE.md FSM rule).
//
//   DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED
//   IN_REVIEW → DRAFT        (kick back for edits)
//   PUBLISHED → ARCHIVED     (retire)
//   ARCHIVED  → DRAFT        (revive for re-editing)
//
// Server-side only — relies on the @ilaunchify/db Prisma client + @ilaunchify/audit.

import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import type { AcademyStatus } from '@ilaunchify/db'

export type AcademyEntity = 'course' | 'lesson' | 'category'

const ENTITY_TO_AUDIT_TYPE: Record<AcademyEntity, 'AcademyCourse' | 'AcademyLesson' | 'AcademyCategory'> = {
  course: 'AcademyCourse',
  lesson: 'AcademyLesson',
  category: 'AcademyCategory',
}

/** Allowed transitions. A target is reachable only if listed under its source. */
const ALLOWED: Record<AcademyStatus, AcademyStatus[]> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
}

export function canTransitionAcademyStatus(from: AcademyStatus, to: AcademyStatus): boolean {
  if (from === to) return false
  return ALLOWED[from]?.includes(to) ?? false
}

export type TransitionResult =
  | { ok: true; from: AcademyStatus; to: AcademyStatus }
  | { ok: false; error: string }

/**
 * Transition an Academy entity's status. Validates the move, stamps publishedAt
 * (course/lesson) on PUBLISHED, clears it when leaving PUBLISHED, and audits.
 */
export async function transitionAcademyStatus(input: {
  entity: AcademyEntity
  id: string
  to: AcademyStatus
  actor: { id: string; role: 'ADMIN' | 'CREATOR' | 'PARTNER' | 'DESIGNER' }
}): Promise<TransitionResult> {
  const { entity, id, to, actor } = input

  const current = await readStatus(entity, id)
  if (current == null) return { ok: false, error: `${entity} not found.` }
  if (!canTransitionAcademyStatus(current, to)) {
    return { ok: false, error: `Cannot move ${entity} from ${current} to ${to}.` }
  }

  // publishedAt: set on entering PUBLISHED, clear when leaving it.
  // AcademyCategory has no publishedAt column — only stamp where it exists.
  const stampPublished = entity !== 'category'
  const data: Record<string, unknown> = { status: to }
  if (stampPublished) {
    if (to === 'PUBLISHED') data.publishedAt = new Date()
    else if (current === 'PUBLISHED') data.publishedAt = null
  }

  await writeStatus(entity, id, data)

  await logAuditAs(actor, {
    entityType: ENTITY_TO_AUDIT_TYPE[entity],
    entityId: id,
    action: 'ACADEMY_STATUS_CHANGE',
    fromValue: current,
    toValue: to,
  })

  return { ok: true, from: current, to }
}

async function readStatus(entity: AcademyEntity, id: string): Promise<AcademyStatus | null> {
  if (entity === 'course') {
    const r = await prisma.academyCourse.findUnique({ where: { id }, select: { status: true } })
    return r?.status ?? null
  }
  if (entity === 'lesson') {
    const r = await prisma.academyLesson.findUnique({ where: { id }, select: { status: true } })
    return r?.status ?? null
  }
  const r = await prisma.academyCategory.findUnique({ where: { id }, select: { status: true } })
  return r?.status ?? null
}

async function writeStatus(entity: AcademyEntity, id: string, data: Record<string, unknown>): Promise<void> {
  if (entity === 'course') {
    await prisma.academyCourse.update({ where: { id }, data: data as never })
    return
  }
  if (entity === 'lesson') {
    await prisma.academyLesson.update({ where: { id }, data: data as never })
    return
  }
  await prisma.academyCategory.update({ where: { id }, data: data as never })
}
