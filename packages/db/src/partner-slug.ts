// Public-profile slug history — rename redirects (URL format #1, Pavel 2026-07-14).
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md. The CURRENT slug lives on
// Partner.slug; PartnerSlugHistory holds prior slugs so old shared links 301 to
// the current one. Cast-guarded + fail-soft (model lands after db:push/generate).

import { prisma } from './index'

/**
 * If `oldSlug` is a historical slug, return the partner's CURRENT slug (so the
 * route can 301-redirect). Returns null when the slug is unknown or already
 * current — i.e. only returns a value worth redirecting to.
 */
export async function resolveHistoricalSlug(oldSlug: string): Promise<string | null> {
  const row = await (
    prisma as unknown as {
      partnerSlugHistory: {
        findUnique: (a: unknown) => Promise<{ partner: { slug: string | null } | null } | null>
      }
    }
  ).partnerSlugHistory
    .findUnique({
      where: { slug: oldSlug },
      select: { partner: { select: { slug: true } } },
    })
    .catch(() => null)
  const current = row?.partner?.slug ?? null
  return current && current !== oldSlug ? current : null
}

/**
 * Record a slug the partner is moving AWAY from, so its old links keep working.
 * Call this from the rename/publish flow BEFORE writing the new Partner.slug.
 * Idempotent (upsert on the unique slug). Fail-soft.
 *
 * NOTE (2026-07-14): intentionally uncalled today. Partner.slug is generated ONCE
 * on first publish (settings/company/actions.ts) and there is no rename UI yet, so
 * PartnerSlugHistory stays empty and resolveHistoricalSlug is a no-op by design.
 * The redirect activates the day a slug-rename flow ships: that flow MUST call this
 * with the previous slug before writing the new one. Do not remove this as "dead."
 */
export async function recordSlugChange(partnerId: string, previousSlug: string): Promise<void> {
  if (!previousSlug) return
  await (
    prisma as unknown as {
      partnerSlugHistory: { upsert: (a: unknown) => Promise<unknown> }
    }
  ).partnerSlugHistory
    .upsert({
      where: { slug: previousSlug },
      update: { partnerId },
      create: { partnerId, slug: previousSlug },
    })
    .catch(() => {})
}
