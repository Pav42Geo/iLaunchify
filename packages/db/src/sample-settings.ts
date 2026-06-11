// Platform-wide sample-policy settings reader (Pavel 2026-06-11). The admin tunes
// the SampleSettings singleton; every consumer (createSampleOrder, the production
// checkout credit consumption, the marketplace gating, the webhook mint) reads it
// from here so the constraints are admin-switchable without a deploy.
//
// Cast-guarded: the model lands on the generated client only after the migration,
// and a missing row falls back to the defaults — so this is always safe to call.

import { prisma } from './index'

export interface SampleSettingsValues {
  creditBackEnabled: boolean
  creditExpiryDays: number
  creditMaxCapCents: number | null
  sampleFlatShippingCents: number
  samplePlatformFeeBps: number
  abuseWindowDays: number
  brandedRequiresDieline: boolean
}

export const SAMPLE_SETTINGS_DEFAULTS: SampleSettingsValues = {
  creditBackEnabled: true,
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
    return row ? { ...SAMPLE_SETTINGS_DEFAULTS, ...row } : SAMPLE_SETTINGS_DEFAULTS
  } catch {
    return SAMPLE_SETTINGS_DEFAULTS
  }
}
