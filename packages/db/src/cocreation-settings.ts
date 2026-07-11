// Co-Creation module policy reader (Pavel 2026-07-10). The admin tunes the
// CoCreationSettings singleton at /product-builder?view=settings; consumers
// (pool loader, express-interest action, benchmark, fit scorer) read it here
// so the knobs are admin-switchable without a deploy. Same cast-guarded +
// defaulted pattern as order-settings.ts — always safe to call, pre-push safe.

import { prisma } from './index'

export interface CoCreationSettingsValues {
  /** Master kick-off switch (OFF until liquidity) — gates every entry surface. */
  moduleEnabled: boolean
  // Pool & matching
  poolExclusivityDays: number
  exclusivityMinFit: number
  maxOpenInterestsPerPartner: number
  interestWindowDays: number
  // Pool access (Pavel 2026-07-10): manufacturers always in; co-packers per policy.
  poolAccessPolicy: 'MFG_ONLY' | 'MFG_ALL_COPACK_RECIPE' | 'MFG_COPACK_EQUAL'
  // Fit weights (D-CC6) — raw magnitudes, renormalized by the scorer.
  claimsWeightPct: number
  volumeWeightPct: number
  meritWeightPct: number
  locationWeightPct: number
  // Creator side
  benchmarkMinSample: number
  maxShortlistSize: number
  // Maker switching (D-CC3 — admin-choosable policy ladder, strict → loose;
  // money-funded is a hard stop under every policy)
  makerSwitchPolicy:
    | 'DISABLED'
    | 'WITHIN_GRACE_DAYS'
    | 'UNTIL_NDA_SIGNED'
    | 'UNTIL_FIRST_SUBMISSION'
    | 'UNTIL_TERMS_AGREED'
    | 'UNTIL_RECIPE_APPROVED'
    | 'UNTIL_FUNDED'
  makerSwitchGraceDays: number
  maxMakerSwitches: number
  // Promoted interests (labeled slots — never touch ranking)
  promotedInterestsEnabled: boolean
  promotedSlotsPerBrief: number
  promoTokenPriceCents: number
  requireVerifiedForPromotion: boolean
}

export const COCREATION_SETTINGS_DEFAULTS: CoCreationSettingsValues = {
  moduleEnabled: false,
  poolExclusivityDays: 15,
  exclusivityMinFit: 60,
  maxOpenInterestsPerPartner: 10,
  interestWindowDays: 14,
  poolAccessPolicy: 'MFG_ALL_COPACK_RECIPE',
  claimsWeightPct: 40,
  volumeWeightPct: 20,
  meritWeightPct: 25,
  locationWeightPct: 15,
  benchmarkMinSample: 3,
  maxShortlistSize: 5,
  // DEFAULT = first submission (Pavel 2026-07-10): unpaid maker labor starts
  // at the first submitted version; switching closes the moment work lands.
  makerSwitchPolicy: 'UNTIL_FIRST_SUBMISSION',
  makerSwitchGraceDays: 14,
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
          moduleEnabled: true,
          poolExclusivityDays: true,
          exclusivityMinFit: true,
          maxOpenInterestsPerPartner: true,
          interestWindowDays: true,
          poolAccessPolicy: true,
          claimsWeightPct: true,
          volumeWeightPct: true,
          meritWeightPct: true,
          locationWeightPct: true,
          benchmarkMinSample: true,
          maxShortlistSize: true,
          makerSwitchPolicy: true,
          makerSwitchGraceDays: true,
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
