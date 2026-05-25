'use server'

// Side server action for the "You're live!" welcome modal that fires once
// when a partner first lands on /dashboard after being activated.
//
// Stamps Partner.onboardingProgress.activeWelcomeSeen so the modal doesn't
// show twice. The dashboard page reads the flag on each load and only
// renders the modal when it's missing AND status is ACTIVE/INTEGRATION_ENHANCED.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'

export async function markActiveWelcomeSeen() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false as const }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingProgress: true },
  })
  if (!partner) return { ok: false as const }

  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  if (progress.activeWelcomeSeen === true) return { ok: true as const }

  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      onboardingProgress: {
        ...progress,
        activeWelcomeSeen: true,
        activeWelcomeSeenAt: new Date().toISOString(),
      },
    },
  })

  revalidatePath('/dashboard')
  return { ok: true as const }
}
