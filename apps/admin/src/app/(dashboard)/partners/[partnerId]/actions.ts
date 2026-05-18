'use server'

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function activatePartner({ partnerId }: { partnerId: string }): Promise<Result> {
  await requireRole('ADMIN')

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: { services: true },
  })
  if (!partner) return { ok: false, error: 'Partner not found' }
  if (!['UNDER_REVIEW', 'SUSPENDED'].includes(partner.status)) {
    return { ok: false, error: `Cannot activate from ${partner.status}` }
  }

  await prisma.$transaction(async (tx) => {
    await tx.partner.update({
      where: { id: partnerId },
      data: { status: 'ACTIVE' },
    })
    // Flip every DRAFT service to ACTIVE on first activation
    if (partner.status === 'UNDER_REVIEW') {
      await tx.partnerService.updateMany({
        where: { partnerId, status: 'DRAFT' },
        data: { status: 'ACTIVE' },
      })
    }
  })

  revalidatePath('/partners')
  revalidatePath(`/partners/${partnerId}`)
  return { ok: true }
}

export async function suspendPartner({ partnerId }: { partnerId: string }): Promise<Result> {
  await requireRole('ADMIN')

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } })
  if (!partner) return { ok: false, error: 'Partner not found' }
  if (partner.status !== 'ACTIVE') {
    return { ok: false, error: `Cannot suspend from ${partner.status}` }
  }

  await prisma.$transaction(async (tx) => {
    await tx.partner.update({ where: { id: partnerId }, data: { status: 'SUSPENDED' } })
    await tx.partnerService.updateMany({
      where: { partnerId, status: 'ACTIVE' },
      data: { status: 'PAUSED' },
    })
  })

  revalidatePath('/partners')
  revalidatePath(`/partners/${partnerId}`)
  return { ok: true }
}

export async function requestChanges({ partnerId }: { partnerId: string }): Promise<Result> {
  await requireRole('ADMIN')

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } })
  if (!partner) return { ok: false, error: 'Partner not found' }
  if (partner.status !== 'UNDER_REVIEW') {
    return { ok: false, error: `Cannot request changes from ${partner.status}` }
  }

  await prisma.partner.update({
    where: { id: partnerId },
    data: { status: 'IN_PROGRESS' },
  })

  revalidatePath('/partners')
  revalidatePath(`/partners/${partnerId}`)
  return { ok: true }
}
