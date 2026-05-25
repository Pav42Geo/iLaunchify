'use server'

// Server actions for the creator Launch Checklist drawer.
// Per docs/CREATOR_ONBOARDING.md + Pavel decision 2026-05-25 (Suplifulpattern —
// non-blocking checklist sidebar instead of a route-based stepper).
//
// State lives in CreatorProfile.onboardingProgress JSON. Each action targets
// one key in that JSON so independent dashboard pages can stamp their step
// without coordinating.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { revalidatePath } from 'next/cache'

// -----------------------------------------------------------------------------
// Loader — single read for the drawer's initial state. Called from
// (dashboard)/layout.tsx so the drawer, sidebar badge, and any inline
// dashboard surfaces all stay in sync.
// -----------------------------------------------------------------------------

export async function getCreatorChecklistState() {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return null

  return await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    include: {
      brands: { select: { id: true, name: true, handle: true } },
      user: { select: { stripeAccountId: true, stripeAccountStatus: true } },
    },
  })
}

// -----------------------------------------------------------------------------
// Step 1 — "Tell us about you" (markets + audience).
// Markets stashed in onboardingProgress.declaredTargetMarketIds until Step 4
// creates the Brand row (then promoted to BrandTargetMarket).
// audienceSizeBand persists on CreatorProfile (already a column).
// -----------------------------------------------------------------------------

export type TellUsAboutYouInput = {
  targetMarketIds: string[]
  audienceSizeBand: string | null
}

export async function saveTellUsAboutYou(input: TellUsAboutYouInput) {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { ok: false, error: 'NOT_A_CREATOR' as const }
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingProgress: true },
  })
  if (!profile) return { ok: false, error: 'PROFILE_NOT_FOUND' as const }

  const progress = (profile.onboardingProgress as Record<string, unknown> | null) ?? {}
  const next = {
    ...progress,
    declaredTargetMarketIds: input.targetMarketIds,
    step1CompletedAt: new Date().toISOString(),
  }

  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: {
      audienceSizeBand: input.audienceSizeBand,
      onboardingProgress: next,
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/settings/profile')
  return { ok: true as const }
}

// -----------------------------------------------------------------------------
// Stamp drawer-dismissed so we don't auto-open on every dashboard load.
// The drawer auto-opens once, then respects the dismiss until creator
// re-opens it manually from the sidebar nav item.
// -----------------------------------------------------------------------------

export async function markChecklistOpened() {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false as const }

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingProgress: true },
  })
  if (!profile) return { ok: false as const }

  const progress = (profile.onboardingProgress as Record<string, unknown> | null) ?? {}
  if (progress.checklistOpenedAt) return { ok: true as const }

  await prisma.creatorProfile.update({
    where: { id: profile.id },
    data: {
      onboardingProgress: {
        ...progress,
        checklistOpenedAt: new Date().toISOString(),
      },
    },
  })

  revalidatePath('/dashboard')
  return { ok: true as const }
}
