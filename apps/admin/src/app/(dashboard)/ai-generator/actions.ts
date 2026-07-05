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
  listAiVocabGroups,
  createAiVocabGroup,
  updateAiVocabGroup,
  deleteAiVocabGroup,
  getDomainVocabGroupAssignments,
  setDomainVocabGroups,
  type AiGeneratorSettingsValues,
} from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export { getAiGeneratorSettings, listAiOutputPresets, listAiVocabGroups, getDomainVocabGroupAssignments, type AiGeneratorSettingsValues }

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
// -----------------------------------------------------------------------------
// Vocabulary groups (Phase 2, table-backed AiVocabGroup + AiDomainVocabGroup).
// Each mutation is catalog:write-gated + audited under 'AiVocabGroup'.
// -----------------------------------------------------------------------------

export async function createVocabGroup(input: { label: string; sortOrder?: number }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = await requireCapability('catalog:write')
  const r = await createAiVocabGroup({ ...input, updatedById: admin.id })
  if (!r.ok || !r.id) return { ok: false, error: 'Could not create group — is the additive schema pushed?' }
  await logAuditAs(admin, { entityType: 'AiVocabGroup', entityId: r.id, action: 'ai-vocab-group.created' })
  revalidatePath('/ai-generator')
  return { ok: true, id: r.id }
}

export async function updateVocabGroup(id: string, patch: { label?: string; styles?: string[]; colors?: string[]; elements?: string[]; sortOrder?: number; active?: boolean }): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const r = await updateAiVocabGroup(id, { ...patch, updatedById: admin.id })
  if (!r.ok) return { ok: false, error: 'Could not save group.' }
  await logAuditAs(admin, { entityType: 'AiVocabGroup', entityId: id, action: 'ai-vocab-group.updated' })
  revalidatePath('/ai-generator')
  return { ok: true }
}

export async function removeVocabGroup(id: string): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const r = await deleteAiVocabGroup(id)
  if (!r.ok) return { ok: false, error: 'Could not delete group.' }
  await logAuditAs(admin, { entityType: 'AiVocabGroup', entityId: id, action: 'ai-vocab-group.deleted' })
  revalidatePath('/ai-generator')
  return { ok: true }
}

/** Persist a new left-to-right order by writing each row's sortOrder. */
export async function reorderVocabGroups(orderedIds: string[]): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]
    if (!id) continue
    const r = await updateAiVocabGroup(id, { sortOrder: i, updatedById: admin.id })
    if (!r.ok) return { ok: false, error: 'Could not reorder groups.' }
  }
  await logAuditAs(admin, { entityType: 'AiVocabGroup', entityId: 'reorder', action: 'ai-vocab-group.reordered' })
  revalidatePath('/ai-generator')
  return { ok: true }
}

export async function setDomainGroups(domain: string, groupIds: string[]): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const r = await setDomainVocabGroups(domain, groupIds)
  if (!r.ok) return { ok: false, error: 'Could not save assignment.' }
  await logAuditAs(admin, { entityType: 'AiVocabGroup', entityId: domain, action: 'ai-vocab-group.domain-assigned' })
  revalidatePath('/ai-generator')
  return { ok: true }
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
