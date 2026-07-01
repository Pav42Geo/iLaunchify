'use server'

// Admin AI Packaging Generator settings (AI_PACKAGING_GENERATOR §7/§13/§16). Reads/
// writes the AiGeneratorSettings singleton (JSON overrides merged over the pure-engine
// defaults) + the AiOutputPreset rows. Each section saves its own subset. Cast-guarded
// in the db layer until the additive schema is pushed. catalog:write-gated + audited.

import {
  getAiGeneratorSettings,
  upsertAiGeneratorSettings,
  listAiOutputPresets,
  upsertAiOutputPreset,
  deleteAiOutputPreset,
  type AiGeneratorSettingsValues,
} from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export { getAiGeneratorSettings, listAiOutputPresets, type AiGeneratorSettingsValues }

type Result = { ok: true } | { ok: false; error: string }

async function saveSection(patch: Parameters<typeof upsertAiGeneratorSettings>[0], section: string): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const r = await upsertAiGeneratorSettings({ ...patch, updatedById: admin.id })
  if (!r.ok) return { ok: false, error: 'Could not save — is the additive schema pushed?' }
  await logAuditAs(admin, { entityType: 'AiGeneratorSettings', entityId: 'default', action: `ai-generator.${section}.saved` })
  revalidatePath('/ai-generator')
  return { ok: true }
}

export async function saveTierLimits(tierLimits: AiGeneratorSettingsValues['tierLimits']): Promise<Result> {
  return saveSection({ tierLimits }, 'tier-limits')
}
export async function saveDomainVocab(domainVocab: AiGeneratorSettingsValues['domainVocab']): Promise<Result> {
  return saveSection({ domainVocab }, 'domain-vocab')
}
export async function saveOutputPolicies(outputPolicies: AiGeneratorSettingsValues['outputPolicies']): Promise<Result> {
  return saveSection({ outputPolicies }, 'output-policies')
}
export async function saveGates(gates: Partial<AiGeneratorSettingsValues['gates']>): Promise<Result> {
  return saveSection({ gates }, 'gates')
}

export async function savePreset(input: { id?: string; label: string; minTier: string; settings: Record<string, unknown>; sortOrder?: number; active?: boolean }): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const r = await upsertAiOutputPreset(input)
  if (!r.ok) return { ok: false, error: 'Could not save preset.' }
  await logAuditAs(admin, { entityType: 'AiOutputPreset', entityId: r.id ?? 'new', action: input.id ? 'ai-preset.updated' : 'ai-preset.created' })
  revalidatePath('/ai-generator')
  return { ok: true }
}

export async function removePreset(id: string): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const r = await deleteAiOutputPreset(id)
  if (!r.ok) return { ok: false, error: 'Could not delete preset.' }
  await logAuditAs(admin, { entityType: 'AiOutputPreset', entityId: id, action: 'ai-preset.deleted' })
  revalidatePath('/ai-generator')
  return { ok: true }
}
