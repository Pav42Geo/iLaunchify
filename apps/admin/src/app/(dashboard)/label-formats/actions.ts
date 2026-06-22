'use server'

// Admin curation for label-format presets. The regulatory facts (CFR citation,
// dimensional thresholds, capabilities) stay read-only — they're fixed by the
// rule. What admins CAN tune is the preferenceScore (which preset the Studio
// recommends first for a labeling type + surface) and the operator notes.

import { prisma } from '@ilaunchify/db'
import type { LabelFormat, LabelingType } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function updateLabelFormatPreference(input: {
  format: string
  labelingType: string
  preferenceScore: number
  notes: string
}): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const score = Math.round(Number(input.preferenceScore))
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return { ok: false, error: 'Preference score must be a whole number 0–100.' }
  }

  const where = {
    format_labelingType: {
      format: input.format as LabelFormat,
      labelingType: input.labelingType as LabelingType,
    },
  }
  const existing = await prisma.labelFormatRule.findUnique({
    where,
    select: { preferenceScore: true, notes: true },
  })
  if (!existing) return { ok: false, error: 'Preset not found.' }

  const notes = input.notes.trim() || null
  if (existing.preferenceScore === score && (existing.notes ?? null) === notes) {
    return { ok: true } // no-op
  }

  await prisma.labelFormatRule.update({ where, data: { preferenceScore: score, notes } })

  await logAuditAs(admin, {
    entityType: 'LabelFormatRule',
    entityId: `${input.format}~${input.labelingType}`,
    action: 'update',
    fromValue: String(existing.preferenceScore),
    toValue: String(score),
    payload: {
      format: input.format,
      labelingType: input.labelingType,
      notesChanged: (existing.notes ?? null) !== notes,
    },
  })

  revalidatePath('/label-formats')
  revalidatePath(`/label-formats/${encodeURIComponent(`${input.format}~${input.labelingType}`)}`)
  return { ok: true }
}
