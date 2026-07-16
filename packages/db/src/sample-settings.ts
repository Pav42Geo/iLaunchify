// Platform-wide sample-policy settings reader (Pavel 2026-06-11). The admin tunes
// the SampleSettings singleton; every consumer (createSampleOrder, the production
// checkout credit consumption, the marketplace gating, the webhook mint) reads it
// from here so the constraints are admin-switchable without a deploy.
//
// Cast-guarded: the model lands on the generated client only after the migration,
// and a missing row falls back to the defaults: so this is always safe to call.

import { prisma } from './index'

export interface SampleSettingsValues {
  /**
   * RETIRED (Pavel 2026-07-16): "I meant to kill credit-back too."
   * A sample is paid in full at order time and mints nothing. getSampleSettings
   * FORCES this false, so the admin toggle and any DB row are both inert.
   * Column + SampleCredit model + mint/apply helpers all kept (no drops).
   */
  creditBackEnabled: boolean
  creditExpiryDays: number
  creditMaxCapCents: number | null
  sampleFlatShippingCents: number
  /**
   * DEPRECATED as the sample fee source (PP-0d, Pavel 2026-07-16): "add tier rate
   * for sample orders too, this is not different than any other order."
   *
   * A sample now resolves the creator's SUBSCRIPTION-TIER rate (15/12/8) via
   * `@ilaunchify/plans` resolveCreatorFeeBps, like every other charge path. This
   * field was a THIRD fee table (alongside FeeRule and the evicted
   * PlatformFeeConfig), it defaulted to 0, and it ignored the creator's tier
   * entirely, so an Agency creator paid the same sample fee as a Maker.
   *
   * Value kept (no drops) and still admin-editable, but NOTHING reads it for
   * pricing. Do not re-wire it: see docs/FEE_MODEL_RECONCILIATION_SPEC §6.
   */
  samplePlatformFeeBps: number
  abuseWindowDays: number
  brandedRequiresDieline: boolean
}

export const SAMPLE_SETTINGS_DEFAULTS: SampleSettingsValues = {
  creditBackEnabled: false, // RETIRED 2026-07-16 (and forced false in getSampleSettings)
  creditExpiryDays: 90,
  creditMaxCapCents: null,
  sampleFlatShippingCents: 995,
  samplePlatformFeeBps: 0,
  abuseWindowDays: 30,
  brandedRequiresDieline: false,
}

export async function getSampleSettings(): Promise<SampleSettingsValues> {
  try {
    const row = await (prisma as unknown as {
      sampleSettings: { findUnique: (a: unknown) => Promise<Partial<SampleSettingsValues> | null> }
    }).sampleSettings
      .findUnique({
        where: { id: 'default' },
        select: {
          creditBackEnabled: true, creditExpiryDays: true, creditMaxCapCents: true,
          sampleFlatShippingCents: true, samplePlatformFeeBps: true, abuseWindowDays: true, brandedRequiresDieline: true,
        },
      })
      .catch(() => null)
    const merged = row ? { ...SAMPLE_SETTINGS_DEFAULTS, ...row } : SAMPLE_SETTINGS_DEFAULTS
    // CREDIT-BACK IS RETIRED (Pavel 2026-07-16). Forced off HERE rather than by
    // flipping the default, because the DB row wins the spread above: a live
    // deployment already has a SampleSettings row with creditBackEnabled=true, so
    // a default flip would have silently changed nothing and credit would have
    // kept minting. This is the one place both gates read from
    // (payments/webhook-handlers.ts:271 mints, checkout/cart-actions.ts:805
    // applies), so forcing it here kills both.
    //
    // Nothing is dropped: the column, the SampleCredit model, mintSampleCredit and
    // applySampleCredit all stay, and existing credits keep their balances. Delete
    // this one line to bring it back.
    return { ...merged, creditBackEnabled: false }
  } catch {
    return { ...SAMPLE_SETTINGS_DEFAULTS, creditBackEnabled: false }
  }
}
