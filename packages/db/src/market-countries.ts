// Address-country options driven by PLATFORM MARKETS management
// (Pavel 2026-07-12). The Market table (docs/MARKETS_AND_REGIONS.md) is the
// SSOT for which jurisdictions the platform operates in — address forms offer
// exactly the ACTIVE markets that are countries (V1: US only; flipping CA to
// ACTIVE in admin instantly adds Canada everywhere these options render).
// Non-country markets (EU) don't map to a single address country and are
// skipped until per-country expansion. Fail-soft to US-only.

import { prisma } from './index'

export interface AddressCountry {
  code: string
  name: string
}

const COUNTRY_NAME: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  UK: 'United Kingdom',
  AU: 'Australia',
}

export async function getActiveMarketCountries(): Promise<AddressCountry[]> {
  try {
    const rows = await prisma.market.findMany({
      where: { status: 'ACTIVE' },
      select: { code: true },
      orderBy: { code: 'asc' },
    })
    const list = rows
      .map((r) => r.code)
      .filter((c): c is keyof typeof COUNTRY_NAME & string => Boolean(COUNTRY_NAME[c]))
      .map((code) => ({ code, name: COUNTRY_NAME[code]! }))
    return list.length > 0 ? list : [{ code: 'US', name: 'United States' }]
  } catch {
    return [{ code: 'US', name: 'United States' }]
  }
}
