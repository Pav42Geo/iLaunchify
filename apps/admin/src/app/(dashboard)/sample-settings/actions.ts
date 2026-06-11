'use server'

// Admin sample-policy settings (Pavel 2026-06-11). Reads/writes the SampleSettings
// singleton so the sample economics are admin-tunable without a deploy. Cast-guarded
// until the migration lands the model on the generated client.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

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

const SELECT = {
  creditBackEnabled: true, creditExpiryDays: true, creditMaxCapCents: true,
  sampleFlatShippingCents: true, samplePlatformFeeBps: true, abuseWindowDays: true, brandedRequiresDieline: true,
}

export async function getSampleSettings(): Promise<SampleSettingsValues> {
  try {
    const row = await (prisma as unknown as {
      sampleSettings: { findUnique: (a: unknown) => Promise<Partial<SampleSettingsValues> | null> }
    }).sampleSettings
      .findUnique({ where: { id: 'default' }, select: SELECT })
      .catch(() => null)
    return row ? { ...SAMPLE_SETTINGS_DEFAULTS, ...row } : SAMPLE_SETTINGS_DEFAULTS
  } catch {
    return SAMPLE_SETTINGS_DEFAULTS
  }
}

type Result = { ok: true } | { ok: false; error: string }

function clampInt(v: number, min: number, max: number, dflt: number): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

export async function saveSampleSettings(input: SampleSettingsValues): Promise<Result> {
  const admin = await requireRole('ADMIN')
  try {
    const data = {
      creditBackEnabled: !!input.creditBackEnabled,
      creditExpiryDays: clampInt(input.creditExpiryDays, 1, 3650, 90),
      creditMaxCapCents: input.creditMaxCapCents == null ? null : clampInt(input.creditMaxCapCents, 0, 10_000_00, 0),
      sampleFlatShippingCents: clampInt(input.sampleFlatShippingCents, 0, 10_000_00, 995),
      samplePlatformFeeBps: clampInt(input.samplePlatformFeeBps, 0, 10_000, 0),
      abuseWindowDays: clampInt(input.abuseWindowDays, 1, 3650, 30),
      brandedRequiresDieline: !!input.brandedRequiresDieline,
      updatedById: admin.id,
    }
    await (prisma as unknown as {
      sampleSettings: { upsert: (a: unknown) => Promise<unknown> }
    }).sampleSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    })
    await logAuditAs(admin, {
      entityType: 'SampleSettings',
      entityId: 'default',
      action: 'SAMPLE_SETTINGS_UPDATED',
      payload: data,
    })
    revalidatePath('/sample-settings')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save settings: ${(err as Error).message}` }
  }
}
