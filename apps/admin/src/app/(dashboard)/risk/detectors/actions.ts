'use server'

// RiskSetting writes (Risk Center M2). Promotion up the ladder is an ADMIN
// decision justified by measured false-positive rate — the page shows the FP
// counters next to the mode control; the audit row records both.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { ALL_DETECTOR_KEYS } from '@ilaunchify/risk'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const MODES = ['MONITOR', 'WARN', 'GATE', 'ACT'] as const
type Mode = (typeof MODES)[number]

export async function updateDetectorSetting({
  detectorKey,
  mode,
  thresholds,
  notes,
  fpStats,
}: {
  detectorKey: string
  mode: Mode
  thresholds: Record<string, number>
  notes: string
  /** FP snapshot shown to the admin at save time — recorded for reproducibility. */
  fpStats?: { fired: number; falsePositives: number }
}): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  if (!(ALL_DETECTOR_KEYS as string[]).includes(detectorKey)) {
    return { ok: false, error: 'Unknown detector' }
  }
  if (!MODES.includes(mode)) return { ok: false, error: 'Invalid mode' }
  for (const [k, v] of Object.entries(thresholds)) {
    if (!Number.isFinite(v) || v < 0) return { ok: false, error: `Threshold "${k}" must be a non-negative number` }
  }

  const existing = await prisma.riskSetting.findUnique({ where: { detectorKey } })
  if (!existing) return { ok: false, error: 'Detector not seeded — run seed:risk first' }

  await prisma.riskSetting.update({
    where: { detectorKey },
    data: {
      mode,
      thresholdsJson: thresholds,
      notes: notes.trim() || null,
      updatedById: admin.id,
    },
  })

  await logAuditAs(admin, {
    entityType: 'RiskSetting',
    entityId: detectorKey,
    action: 'RISK_SETTING_UPDATED',
    fromValue: existing.mode,
    toValue: mode,
    payload: {
      thresholdsBefore: existing.thresholdsJson,
      thresholdsAfter: thresholds,
      fpStatsAtDecision: fpStats ?? null,
    },
  })

  revalidatePath('/risk/detectors')
  revalidatePath('/risk')
  return { ok: true }
}
