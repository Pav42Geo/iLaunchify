'use server'

// Admin sample-policy settings (Pavel 2026-06-11). Reads/writes the SampleSettings
// singleton so the sample economics are admin-tunable without a deploy. Cast-guarded
// until the migration lands the model on the generated client.

import { prisma, getSampleSettings, type SampleSettingsValues } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

// Read-side lives in @ilaunchify/db (the single source every consumer reads).
// Re-exported so the page keeps importing from './actions'.
export { getSampleSettings, type SampleSettingsValues }

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
