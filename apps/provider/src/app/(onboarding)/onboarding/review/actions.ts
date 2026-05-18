'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'

export async function submitForReview({ partnerId }: { partnerId: string }) {
  const user = await requireUser()

  const partner = await prisma.partner.findFirst({
    where: { id: partnerId, userId: user.id },
    include: { services: true },
  })
  if (!partner) return { ok: false as const, error: 'Partner not found' }

  if (partner.status === 'UNDER_REVIEW') {
    return { ok: false as const, error: 'Already submitted' }
  }

  // Basic completeness checks before allowing submission
  if (!partner.city || !partner.state || !partner.addressLine1) {
    return { ok: false as const, error: 'Complete company details first' }
  }
  if (
    !partner.services.some((s) => Object.keys(s.capabilities as Record<string, unknown>).length > 1)
  ) {
    return { ok: false as const, error: 'Complete the service profile first' }
  }

  await prisma.partner.update({
    where: { id: partner.id },
    data: { status: 'UNDER_REVIEW' },
  })

  revalidatePath('/onboarding')
  revalidatePath('/onboarding/review')
  return { ok: true as const }
}
