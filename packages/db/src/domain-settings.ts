// Product-domain enablement reader (2026-06-14). The admin turns each product
// domain on/off (DomainSetting rows); the partner builder reads enabled domains
// from here so domains are switchable without a deploy. Cast-guarded + defaulted,
// so it's always safe to call even before the migration runs.

import { prisma } from './index'

export type DomainKey = 'FOOD' | 'DIETARY_SUPPLEMENT' | 'PET_PRODUCT' | 'OTC' | 'COSMETIC'

/** Canonical order for admin UI + builder. */
export const DOMAIN_KEYS: DomainKey[] = ['FOOD', 'DIETARY_SUPPLEMENT', 'COSMETIC', 'PET_PRODUCT', 'OTC']

/** Fallback when a domain has no DomainSetting row yet. OTC ships OFF by default —
 *  the full flow is built (builder Drug Facts editor → formulationData.otc →
 *  computeProductLabel resolver → renderer), but opening the OTC category is a
 *  business/compliance decision the admin makes via Settings → Product domains. */
export const DOMAIN_ENABLED_DEFAULTS: Record<DomainKey, boolean> = {
  FOOD: true,
  DIETARY_SUPPLEMENT: true,
  COSMETIC: true,
  PET_PRODUCT: true,
  OTC: false,
}

/** Full enabled map, DB rows merged over the code defaults. */
export async function getDomainSettings(): Promise<Record<DomainKey, boolean>> {
  const out: Record<DomainKey, boolean> = { ...DOMAIN_ENABLED_DEFAULTS }
  try {
    const rows = await (prisma as unknown as {
      domainSetting: { findMany: (a?: unknown) => Promise<Array<{ domain: string; enabled: boolean }>> }
    }).domainSetting.findMany()
    for (const r of rows) {
      if ((DOMAIN_KEYS as string[]).includes(r.domain)) out[r.domain as DomainKey] = r.enabled
    }
  } catch {
    // Table not migrated yet — fall back to defaults.
  }
  return out
}

/** Just the enabled domain keys, in canonical order. */
export async function getEnabledDomains(): Promise<DomainKey[]> {
  const settings = await getDomainSettings()
  return DOMAIN_KEYS.filter((k) => settings[k])
}

/** Single-domain check (server-side enforcement). */
export async function isDomainEnabled(domain: string): Promise<boolean> {
  if (!(DOMAIN_KEYS as string[]).includes(domain)) return false
  const settings = await getDomainSettings()
  return settings[domain as DomainKey]
}
