// Co-Creation module policy reader (Pavel 2026-07-10). The admin tunes the
// CoCreationSettings singleton at /product-builder?view=settings; consumers
// (pool loader, express-interest action, benchmark, fit scorer) read it here
// so the knobs are admin-switchable without a deploy. Same cast-guarded +
// defaulted pattern as order-settings.ts — always safe to call, pre-push safe.

import { prisma } from './index'

export interface CoCreationSettingsValues {
  // Pool & matching
  poolExclusivityDays: number
  exclusivityMinFit: number
  maxOpenInterestsPerPartner: number
  // Fit weights (D-CC6) — raw magnitudes, renormalized by the scorer.
  claimsWeightPct: number
  volumeWeightPct: number
  meritWeightPct: number
  locationWeightPct: number
  // Creator side
  benchmarkMinSample: number
  maxShortlistSize: number
  // Maker switching (D-CC3 — admin-choosable policy)
  makerSwitchPolicy: 'UNTIL_FUNDED' | 'UNTIL_RECIPE_APPROVED' | 'DISABLED'
  maxMakerSwitches: number
  // Promoted interests (labeled slots — never touch ranking)
  promotedInterestsEnabled: boolean
  promotedSlotsPerBrief: number
  promoTokenPriceCents: number
  requireVerifiedForPromotion: boolean
}

export const COCREATION_SETTINGS_DEFAULTS: CoCreationSettingsValues = {
  poolExclusivityDays: 15,
  exclusivityMinFit: 60,
  maxOpenInterestsPerPartner: 10,
  claimsWeightPct: 40,
  volumeWeightPct: 20,
  meritWeightPct: 25,
  locationWeightPct: 15,
  benchmarkMinSample: 3,
  maxShortlistSize: 5,
  makerSwitchPolicy: 'UNTIL_FUNDED',
  maxMakerSwitches: 1,
  promotedInterestsEnabled: false,
  promotedSlotsPerBrief: 2,
  promoTokenPriceCents: 2500,
  requireVerifiedForPromotion: true,
}

export async function getCoCreationSettings(): Promise<CoCreationSettingsValues> {
  try {
    const row = await (
      prisma as unknown as {
        coCreationSettings: {
          findUnique: (a: unknown) => Promise<Partial<CoCreationSettingsValues> | null>
        }
      }
    ).coCreationSettings
      .findUnique({
        where: { id: 'default' },
        select: {
          poolExclusivityDays: true,
          exclusivityMinFit: true,
          maxOpenInterestsPerPartner: true,
          claimsWeightPct: true,
          volumeWeightPct: true,
          meritWeightPct: true,
          locationWeightPct: true,
          benchmarkMinSample: true,
          maxShortlistSize: true,
          makerSwitchPolicy: true,
          maxMakerSwitches: true,
          promotedInterestsEnabled: true,
          promotedSlotsPerBrief: true,
          promoTokenPriceCents: true,
          requireVerifiedForPromotion: true,
        },
      })
      .catch(() => null)
    return row ? { ...COCREATION_SETTINGS_DEFAULTS, ...row } : COCREATION_SETTINGS_DEFAULTS
  } catch {
    return COCREATION_SETTINGS_DEFAULTS
  }
}
