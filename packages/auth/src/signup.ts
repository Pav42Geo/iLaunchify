// Signup logic — creates User + role-specific profile in one transaction.
//
// Why this exists: the User.role enum is required on the schema, and Auth.js
// PrismaAdapter auto-creates User rows on first magic-link sign-in with no
// way to inject custom fields. So we PRE-CREATE the User row server-side
// before triggering the magic link — that way the role and any role-specific
// profile (Partner row, CreatorProfile row) exist when the user lands.
//
// Per docs/PARTNER_ONBOARDING.md §1 + docs/CREATOR_ONBOARDING.md §1.
//
// Usage from an /api/auth/signup route handler:
//   const result = await createUserWithRole({ ... })
//   if (result.ok) { /* send magic link */ } else { /* show error */ }

import { prisma } from '@ilaunchify/db'
import type { UserRole } from '@prisma/client'

/** Result of a signup attempt. */
export type SignupResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; error: SignupError; message: string }

export type SignupError =
  | 'EMAIL_TAKEN'
  | 'INVALID_EMAIL'
  | 'INVALID_INPUT'
  | 'ADMIN_SIGNUP_FORBIDDEN'
  | 'DB_ERROR'

/** Input shape varies slightly per role — partner needs company info, creator brand info. */
export type SignupInput =
  | {
      role: 'CREATOR'
      name: string
      email: string
      brandName?: string // optional — creator can add later in onboarding step 4
    }
  | {
      role: 'PARTNER'
      name: string
      email: string
      companyName: string // required for partner; partner IS a company
      roleAtCompany?: string // optional; e.g., 'Operations Manager'
    }

/**
 * Creates a new User row + role-specific profile row in one transaction.
 *
 * For CREATOR: also creates a CreatorProfile row (handle derived from email).
 * For PARTNER: also creates a Partner row in LEAD status (per PartnerStatus FSM).
 *
 * Admin signup is REFUSED — admins must be invited via #103 invite-by-role flow.
 *
 * Idempotency: if the email is already taken, returns EMAIL_TAKEN error
 * without mutating anything.
 */
export async function createUserWithRole(input: SignupInput): Promise<SignupResult> {
  // --- Validation ---
  const email = input.email.toLowerCase().trim()

  if (!isValidEmail(email)) {
    return { ok: false, error: 'INVALID_EMAIL', message: 'Please enter a valid email address.' }
  }

  if (!input.name?.trim()) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Please provide your name.' }
  }

  if (input.role === 'PARTNER' && !input.companyName?.trim()) {
    return { ok: false, error: 'INVALID_INPUT', message: 'Company name is required for partners.' }
  }

  // --- Check for existing user ---
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    return {
      ok: false,
      error: 'EMAIL_TAKEN',
      message: 'An account with that email already exists. Try signing in instead.',
    }
  }

  // --- Create User + role-specific profile in one transaction ---
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: input.name.trim(),
          role: input.role as UserRole,
        },
      })

      if (input.role === 'CREATOR') {
        await tx.creatorProfile.create({
          data: {
            userId: user.id,
            handle: deriveHandleFromEmail(email),
            displayName: input.name.trim(),
            // Brand row is NOT created here — that happens in onboarding Step 1
            // when the creator picks markets + region + brand name. Per
            // docs/CREATOR_ONBOARDING.md §Step 1.
          },
        })
      } else if (input.role === 'PARTNER') {
        await tx.partner.create({
          data: {
            userId: user.id,
            companyName: input.companyName!.trim(),
            legalName: input.companyName!.trim(), // partner refines in onboarding L1
            status: 'LEAD',
            leadSource: 'signup_form',
            // Phase A onboarding wizard then walks them through L1 verification sections.
          },
        })
      }

      return user
    })

    return { ok: true, userId: result.id, email: result.email }
  } catch (err) {
    return {
      ok: false,
      error: 'DB_ERROR',
      message: 'Something went wrong creating your account. Please try again.',
    }
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function isValidEmail(email: string): boolean {
  // Simple validation; Auth.js + Resend do their own deliverability checks
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

function deriveHandleFromEmail(email: string): string {
  // Take the local part, strip non-alphanumerics, append timestamp suffix to
  // prevent collisions. CreatorProfile.handle has @unique constraint.
  const localPart = email.split('@')[0] ?? 'user'
  const base = localPart.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'user'
  const suffix = Date.now().toString(36).slice(-4)
  return `${base}-${suffix}`
}
