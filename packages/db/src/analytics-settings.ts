// Analytics admin config singleton (Settings → Analytics).
//
// Mirrors order-settings / support-settings: a single "default" row holding the
// behavioral-capture switch + fulfillment/alert thresholds the Insights surface
// reads. Cast-guarded findUnique with `.catch(() => null)` so the app still works
// (returns defaults) before the AnalyticsSetting migration lands on the client.
// See docs/ANALYTICS_STRATEGY.md §6.

import { prisma } from './index'

export interface AnalyticsSettingsValues {
  behavioralCaptureEnabled: boolean
  otifTargetPct: number
  refundRateAlertPct: number
  rerouteRateAlertPct: number
  qcFailAlertPct: number
}

export const ANALYTICS_SETTINGS_DEFAULTS: AnalyticsSettingsValues = {
  behavioralCaptureEnabled: true,
  otifTargetPct: 95,
  refundRateAlertPct: 5,
  rerouteRateAlertPct: 5,
  qcFailAlertPct: 3,
}

export async function getAnalyticsSettings(): Promise<AnalyticsSettingsValues> {
  const row = await (
    prisma as unknown as {
      analyticsSetting: {
        findUnique: (a: unknown) => Promise<Partial<AnalyticsSettingsValues> | null>
      }
    }
  ).analyticsSetting
    .findUnique({
      where: { id: 'default' },
      select: {
        behavioralCaptureEnabled: true,
        otifTargetPct: true,
        refundRateAlertPct: true,
        rerouteRateAlertPct: true,
        qcFailAlertPct: true,
      },
    })
    .catch(() => null)

  return { ...ANALYTICS_SETTINGS_DEFAULTS, ...(row ?? {}) }
}
