// Centralized ownership guards — docs/SECURITY_ARCHITECTURE.md Tier 1.1
// (LOCKED 2026-06-05). Tenant isolation is threat #1: partner recipes, costs,
// and margins are trade secrets hosted next to competitors.
//
// Design:
//   - PURE decision functions live in ownership-rules.ts (zero imports) and
//     are unit-tested table-driven in ownership.test.ts. The guards here are
//     thin fetch wrappers around them.
//   - Partner-side guards return discriminated unions (never throw) so server
//     actions can map errors to their Result shapes.
//   - Creator-side ownership stays in the WHERE clause (the existing idiom —
//     no fetch-then-compare TOCTOU). The creatorOwned*Where builders below
//     are the canonical fragments; compose them into queries.
//
// Rule (CLAUDE.md): NEW server actions use these guards — never ad-hoc checks.

import { prisma } from '@ilaunchify/db'
import { requireUser } from './guards'
import type { User } from './types'
import {
  decidePartnerActor,
  decideTemplateAccess,
  type PartnerActorReason,
  type TemplateAccessReason,
} from './ownership-rules'

export {
  decidePartnerActor,
  decideTemplateAccess,
  type PartnerActorReason,
  type TemplateAccessReason,
}

// =============================================================================
// DB-bound guards — thin fetch + decide.
// =============================================================================

export type PartnerActorResult =
  | { ok: true; user: User; partnerId: string }
  | { ok: false; error: PartnerActorReason }

/** The requester is a signed-in PARTNER with a Partner row. */
export async function requirePartnerActor(): Promise<PartnerActorResult> {
  const user = await requireUser()
  const partner =
    user.role === 'PARTNER'
      ? await prisma.partner.findUnique({
          where: { userId: user.id },
          select: { id: true },
        })
      : null
  const decision = decidePartnerActor({ role: user.role, hasPartnerRow: !!partner })
  if (!decision.allowed) return { ok: false, error: decision.reason }
  return { ok: true, user, partnerId: partner!.id }
}

export type TemplateAccessResult =
  | {
      ok: true
      user: User
      partnerId: string
      template: { id: string; manufacturerServiceId: string | null; status: string }
    }
  | { ok: false; error: TemplateAccessReason }

/**
 * The requester is a PARTNER who owns (or may edit) this ProductTemplate.
 * Refuses REJECTED templates (terminal — partner must clone).
 */
export async function requirePartnerOwnedTemplate(
  productTemplateId: string,
): Promise<TemplateAccessResult> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return actor

  const template = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: {
      id: true,
      status: true,
      manufacturerServiceId: true,
      manufacturerService: { select: { partnerId: true } },
    },
  })

  const decision = decideTemplateAccess({
    role: actor.user.role,
    requesterPartnerId: actor.partnerId,
    template: {
      exists: !!template,
      status: template?.status ?? null,
      ownerPartnerId: template?.manufacturerService?.partnerId ?? null,
      hasManufacturerService: !!template?.manufacturerServiceId,
    },
  })
  if (!decision.allowed) return { ok: false, error: decision.reason }

  return {
    ok: true,
    user: actor.user,
    partnerId: actor.partnerId,
    template: {
      id: template!.id,
      manufacturerServiceId: template!.manufacturerServiceId,
      status: template!.status,
    },
  }
}

// =============================================================================
// Creator-side WHERE fragments — compose into queries so ownership is
// enforced atomically by the database, not by fetch-then-compare.
// =============================================================================

/** Product owned by the signed-in creator (via brand → creatorProfile). */
export function creatorOwnedProductWhere(userId: string, productId: string) {
  return { id: productId, brand: { creatorProfile: { userId } } } as const
}

/** Brand owned by the signed-in creator. */
export function creatorOwnedBrandWhere(userId: string, brandId: string) {
  return { id: brandId, creatorProfile: { userId } } as const
}

/** Nested fragment for deeper scoping (e.g. designs, orders via product). */
export function creatorOwnedProductScope(userId: string) {
  return { brand: { creatorProfile: { userId } } } as const
}
