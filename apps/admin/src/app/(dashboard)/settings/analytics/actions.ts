'use server'

// Admin analytics config editor (Settings → Analytics). Upserts the
// AnalyticsSetting singleton the Insights surface reads (behavioral-capture
// switch + fulfillment/alert thresholds). Admin-gated + audited. Cast-guarded
// until the migration lands AnalyticsSetting on the generated client.

import { prisma, getAnalyticsSettings, type AnalyticsSettingsValues } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export { getAnalyticsSettings }

function clampPct(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v < 0) return 0
  return Math.min(v, 100)
}

export async function saveAnalyticsSettings(
  input: AnalyticsSettingsValues,
): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const data = {
    behavioralCaptureEnabled: !!input.behavioralCaptureEnabled,
    otifTargetPct: clampPct(input.otifTargetPct),
    refundRateAlertPct: clampPct(input.refundRateAlertPct),
    rerouteRateAlertPct: clampPct(input.rerouteRateAlertPct),
    qcFailAlertPct: clampPct(input.qcFailAlertPct),
  }

  try {
    await (
      prisma as unknown as {
        analyticsSetting: { upsert: (a: unknown) => Promise<unknown> }
      }
    ).analyticsSetting.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    })
    await logAuditAs(admin, {
      entityType: 'AnalyticsSetting',
      entityId: 'default',
      action: 'ANALYTICS_SETTINGS_UPDATED',
      payload: data,
    })
    revalidatePath('/settings/analytics')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}
