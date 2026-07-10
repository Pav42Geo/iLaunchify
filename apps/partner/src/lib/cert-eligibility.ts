// Certificate eligibility filter (Pavel 2026-07-09).
//
// Given the domains a partner operates in (derived from their declared product
// categories), narrow the admin CertificateType library to the certs that
// actually make sense for them — so the CertificatePicker never buries a food
// runner under cosmetic-only or pet-only certs.
//
// Deliberately PERMISSIVE: a declaration is not proof, and hiding a cert a
// partner legitimately holds is worse than showing one extra. So a cert is
// eligible when it is universal (no domain constraint) OR its domains intersect
// the partner's. If the partner has declared no domains yet, everything shows.
//
// Market-level narrowing is intentionally omitted here (domains are the primary
// axis; marketId→slug mapping + over-filtering risk aren't worth it for a
// declaration). Add it when routing actually consumes market-scoped certs.

// ProductCategory enum (partner capabilities.categories) → CertificateType
// applicableLabelingTypes vocabulary.
const CATEGORY_TO_LABELING_TYPE: Record<string, string> = {
  FOOD: 'FOOD',
  BEVERAGE_FUNCTIONAL: 'BEVERAGE',
  SUPPLEMENT: 'SUPPLEMENT',
  COSMETIC: 'COSMETIC',
  PET: 'PET_PRODUCT',
}

/** Map a partner's declared ProductCategory codes → labeling-type domains. */
export function domainsFromCategories(categories: readonly string[]): string[] {
  const out = new Set<string>()
  for (const c of categories) {
    const d = CATEGORY_TO_LABELING_TYPE[c]
    if (d) out.add(d)
  }
  return [...out]
}

type CertLike = { applicableLabelingTypes: string[] }

/** True when a cert type is universal or shares at least one of the partner's domains. */
export function isCertEligible(cert: CertLike, partnerDomains: readonly string[]): boolean {
  // No domains declared yet → show everything (permissive default).
  if (partnerDomains.length === 0) return true
  const types = cert.applicableLabelingTypes
  // Universal: no constraint, or an explicit wildcard.
  if (types.length === 0 || types.includes('*')) return true
  return types.some((t) => partnerDomains.includes(t))
}

/** Filter a cert-type library to those eligible for the given partner domains. */
export function filterEligibleCerts<T extends CertLike>(
  certs: readonly T[],
  partnerDomains: readonly string[],
): T[] {
  return certs.filter((c) => isCertEligible(c, partnerDomains))
}
