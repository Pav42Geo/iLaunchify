'use server'

// REBUILD R4 — guest gate for the Start Launching CTA.
//
// Goal: a guest hits Start Launching on a marketplace detail page →
// inline modal collects name / email / brand name → one round-trip
// creates the User + CreatorProfile + Brand, then returns a URL that:
//   1. sends the new user to the real creator /login (magic-link / Google) —
//      no bypass (H5 A2); the launch intent rides on callbackUrl
//   2. after sign-in, bounces to /api/launch-after-signin which has the new
//      session and creates the Product
//   3. redirects to the Design Studio canvas

import { createUserWithRole } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { creatorUrl } from './app-urls'
import type { StartLaunchInput } from './launch-actions'

export interface GuestSignupAndLaunchInput extends StartLaunchInput {
  name: string
  email: string
  brandName: string
}

export type GuestSignupAndLaunchResult =
  | { ok: true; signinUrl: string }
  | { ok: false; reason: 'EMAIL_TAKEN'; message: string }
  | { ok: false; reason: 'INVALID_INPUT'; message: string }
  | { ok: false; reason: 'INTERNAL'; message: string }

export async function signupGuestAndPrepareLaunch(
  input: GuestSignupAndLaunchInput,
): Promise<GuestSignupAndLaunchResult> {
  const name = input.name.trim()
  const email = input.email.toLowerCase().trim()
  const brandName = input.brandName.trim()

  if (!name) {
    return { ok: false, reason: 'INVALID_INPUT', message: 'Please add your name.' }
  }
  if (!brandName) {
    return {
      ok: false,
      reason: 'INVALID_INPUT',
      message: 'Pick a brand name (you can change it later).',
    }
  }

  // 1. Create the user + creator profile.
  const signup = await createUserWithRole({
    role: 'CREATOR',
    name,
    email,
    brandName,
  })
  if (!signup.ok) {
    if (signup.error === 'EMAIL_TAKEN') {
      return {
        ok: false,
        reason: 'EMAIL_TAKEN',
        message: signup.message,
      }
    }
    return {
      ok: false,
      reason: signup.error === 'INVALID_EMAIL' || signup.error === 'INVALID_INPUT'
        ? 'INVALID_INPUT'
        : 'INTERNAL',
      message: signup.message,
    }
  }

  // 2. Create the Brand row immediately so the post-signin Product
  //    creation finds one (startLaunchFromTemplate returns NO_BRAND
  //    otherwise). Minimal shape — creator can flesh it out later in
  //    Brand Identity Studio.
  try {
    const profile = await prisma.creatorProfile.findUnique({
      where: { userId: signup.userId },
      select: { id: true },
    })
    if (!profile) {
      return {
        ok: false,
        reason: 'INTERNAL',
        message: 'Creator profile missing after signup.',
      }
    }
    await prisma.brand.create({
      data: {
        creatorProfileId: profile.id,
        name: brandName,
        handle: deriveBrandHandle(brandName, email),
      },
    })
  } catch (err) {
    return {
      ok: false,
      reason: 'INTERNAL',
      message: 'Could not create your brand. ' + (err as Error).message,
    }
  }

  // 3. Build the sign-in URL. The guest goes through the REAL creator login
  //    (magic-link / Google) — never the dev-login bypass (H5 A2). The launch
  //    intent rides on callbackUrl: after sign-in, the creator origin has a real
  //    session and /api/launch-after-signin resumes the launch (creates the
  //    Product + redirects to canvas), its shape unchanged.
  const launchCallback = creatorUrl('/api/launch-after-signin', {
    template: input.templateSlug,
    ...(input.flavor ? { flavor: input.flavor } : {}),
    ...(input.size ? { size: input.size } : {}),
    ...(input.packaging ? { packaging: input.packaging } : {}),
    ...(input.quantity ? { quantity: String(input.quantity) } : {}),
    // Slice C8.2 — carry the chosen decoration offering through signup so the
    // post-signin product gets its primary PackagingComponent.
    ...(input.partnerOfferingId ? { partnerOfferingId: input.partnerOfferingId } : {}),
  })
  const signinUrl = creatorUrl('/login', {
    email, // prefill hint for the login form
    callbackUrl: launchCallback,
  })

  return { ok: true, signinUrl }
}

function deriveBrandHandle(brandName: string, email: string): string {
  const base = brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32) || 'brand'
  // Brand.handle has @unique constraint — append a short token from
  // the email + time so collisions are vanishingly unlikely without
  // a retry loop. Brand identity Studio lets the creator rename.
  const tail = `${email.split('@')[0]?.slice(0, 4) ?? 'b'}-${Date.now()
    .toString(36)
    .slice(-4)}`
  return `${base}-${tail}`.replace(/-+/g, '-')
}
