'use server'

// REBUILD R4 — guest gate for the Start Launching CTA.
//
// Goal: a guest hits Start Launching on a marketplace detail page →
// inline modal collects name / email / brand name → one round-trip
// creates the User + CreatorProfile + Brand, then returns a URL that:
//   1. signs the new user in (writes the session cookie on the
//      apps/creator origin via /api/dev/login)
//   2. bounces to /api/launch-after-signin which has the new session
//      and creates the Product
//   3. redirects to the Design Studio canvas
//
// V1 dev uses /api/dev/login (cookie set on creator origin, callbackUrl
// preserved). For prod this swaps to real auth (magic-link or password)
// — TODO inline.

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

  // 3. Build the signin URL that:
  //    a) hits creator /api/dev/login → sets the session cookie on
  //       the apps/creator origin
  //    b) then bounces to /api/launch-after-signin which has the
  //       fresh session and creates the Product + redirects to canvas.
  //
  // TODO(prod): swap /api/dev/login for the real magic-link or
  // password sign-in flow once we wire Resend/etc. The shape of
  // launch-after-signin stays identical — only the cookie setter
  // changes.
  const launchCallback = creatorUrl('/api/launch-after-signin', {
    template: input.templateSlug,
    ...(input.flavor ? { flavor: input.flavor } : {}),
    ...(input.size ? { size: input.size } : {}),
    ...(input.packaging ? { packaging: input.packaging } : {}),
    ...(input.quantity ? { quantity: String(input.quantity) } : {}),
  })
  const signinUrl = creatorUrl('/api/dev/login', {
    email,
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
