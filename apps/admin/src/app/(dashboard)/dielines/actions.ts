'use server'

// Admin die-line review — verify a partner-confirmed die-line into ACTIVE (or
// send it back). docs/DIELINE_FRAME_EDITOR_SPEC.md §3/Phase D.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function verifyDieline(dielineId: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const dl = await prisma.packagingDieline.findUnique({ where: { id: dielineId }, select: { id: true, status: true } })
  if (!dl) return { ok: false, error: 'Die-line not found.' }
  if (dl.status !== 'PARTNER_CONFIRMED') return { ok: false, error: `Cannot verify from ${dl.status}.` }

  await prisma.packagingDieline.update({
    where: { id: dielineId },
    data: { status: 'ACTIVE', adminVerifiedAt: new Date(), adminVerifiedById: admin.id },
  })
  await logAuditAs(admin, {
    entityType: 'PackagingDieline',
    entityId: dielineId,
    action: 'dieline.verified',
    fromValue: dl.status,
    toValue: 'ACTIVE',
  })
  revalidatePath('/dielines')
  return { ok: true }
}

export async function sendBackDieline(dielineId: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const dl = await prisma.packagingDieline.findUnique({ where: { id: dielineId }, select: { id: true, status: true } })
  if (!dl) return { ok: false, error: 'Die-line not found.' }
  if (dl.status !== 'PARTNER_CONFIRMED') return { ok: false, error: `Cannot send back from ${dl.status}.` }

  await prisma.packagingDieline.update({ where: { id: dielineId }, data: { status: 'UPLOADED', partnerConfirmedAt: null } })
  await logAuditAs(admin, {
    entityType: 'PackagingDieline',
    entityId: dielineId,
    action: 'dieline.sent-back',
    fromValue: dl.status,
    toValue: 'UPLOADED',
  })
  revalidatePath('/dielines')
  return { ok: true }
}
