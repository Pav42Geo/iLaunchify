// @ilaunchify/academy — shared route/link builders (ACADEMY_SPEC §6).
//
// Both academy trees (Creator at /academy, Partner at /business/academy) build
// every internal link from `academyBasePath(audience)` so the two trees never
// drift. Pure functions — safe to import from RSC or client. Cross-app deep
// links (into creator/partner apps) use creatorUrl()/partnerUrl() at the call
// site, NOT these helpers.

export type AcademyAudience = 'CREATOR' | 'PARTNER'

/** Reserved static segments — a course/topic slug may never collide with these. */
export const RESERVED_ACADEMY_SLUGS = ['topics', 'updates', 'search'] as const

/** `/academy` for creators, `/business/academy` for partners. */
export function academyBasePath(audience: AcademyAudience): string {
  return audience === 'PARTNER' ? '/business/academy' : '/academy'
}

export function academyHomeHref(audience: AcademyAudience): string {
  return academyBasePath(audience)
}

export function topicHref(audience: AcademyAudience, topicSlug: string): string {
  return `${academyBasePath(audience)}/topics/${topicSlug}`
}

export function courseHref(audience: AcademyAudience, courseSlug: string): string {
  return `${academyBasePath(audience)}/${courseSlug}`
}

export function lessonHref(
  audience: AcademyAudience,
  courseSlug: string,
  lessonSlug: string,
): string {
  return `${academyBasePath(audience)}/${courseSlug}/${lessonSlug}`
}

export function updatesHref(audience: AcademyAudience): string {
  return `${academyBasePath(audience)}/updates`
}

export function searchHref(audience: AcademyAudience, q?: string): string {
  const base = `${academyBasePath(audience)}/search`
  return q ? `${base}?q=${encodeURIComponent(q)}` : base
}

/** True when a slug would collide with a reserved static segment. */
export function isReservedAcademySlug(slug: string): boolean {
  return (RESERVED_ACADEMY_SLUGS as readonly string[]).includes(slug)
}
