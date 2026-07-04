// AI Packaging Generator config reader (AI_PACKAGING_GENERATOR §7/§13/§16). The admin
// tunes the AiGeneratorSettings singleton + AiOutputPreset rows; consumers read the
// OVERRIDES here and merge them over the pure-engine defaults (tierLimits /
// domainPreset / resolveOutputPolicy) at the call site. Cast-guarded + defaulted so
// it's always safe to call, even before the additive schema is pushed.

import { prisma } from './index'

/** Raw admin overrides — each is a partial the engines merge over their defaults. */
export interface AiGeneratorSettingsValues {
  /** tier → partial TierGenerationLimits. */
  tierLimits: Record<string, Record<string, unknown>>
  /** domain → partial DomainPreset (styles/colors/elements/promptTone/substrateHint). */
  domainVocab: Record<string, Record<string, unknown>>
  /** tier → partial OutputPolicy. */
  outputPolicies: Record<string, Record<string, unknown>>
  /** provider tuning (model ids, cost overrides). */
  provider: Record<string, unknown>
  gates: { generatorEnabled: boolean; blockExportUntilCompliant: boolean; blockSaveOverStorage: boolean; makerGenerationDisabled: boolean }
  /** groupId → reusable vocab group { label, styles[], colors[], elements[] }. */
  vocabGroups: Record<string, Record<string, unknown>>
  /** domain → assigned vocab-group ids. */
  domainGroups: Record<string, string[]>
}

export const AI_GENERATOR_SETTINGS_DEFAULTS: AiGeneratorSettingsValues = {
  tierLimits: {},
  domainVocab: {},
  outputPolicies: {},
  provider: {},
  gates: { generatorEnabled: true, blockExportUntilCompliant: true, blockSaveOverStorage: true, makerGenerationDisabled: true },
  vocabGroups: {},
  domainGroups: {},
}

type JsonRow = {
  tierLimitsJson: unknown
  domainVocabJson: unknown
  outputPoliciesJson: unknown
  providerJson: unknown
  gatesJson: unknown
} | null

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export async function getAiGeneratorSettings(): Promise<AiGeneratorSettingsValues> {
  try {
    const row = (await (prisma as unknown as {
      aiGeneratorSettings: { findUnique: (a: unknown) => Promise<JsonRow> }
    }).aiGeneratorSettings
      .findUnique({
        where: { id: 'default' },
        select: { tierLimitsJson: true, domainVocabJson: true, outputPoliciesJson: true, providerJson: true, gatesJson: true },
      })
      .catch(() => null)) as JsonRow
    // Vocab groups live in additive columns (vocabGroupsJson / domainGroupsJson).
    // Read them in a SEPARATE cast-guarded query so a not-yet-pushed column can
    // never break the reads above — pre-push it simply degrades to empty groups.
    const groupsRow = (await (prisma as unknown as {
      aiGeneratorSettings: { findUnique: (a: unknown) => Promise<{ vocabGroupsJson: unknown; domainGroupsJson: unknown } | null> }
    }).aiGeneratorSettings
      .findUnique({ where: { id: 'default' }, select: { vocabGroupsJson: true, domainGroupsJson: true } })
      .catch(() => null)) as { vocabGroupsJson: unknown; domainGroupsJson: unknown } | null
    const vocabGroups = obj(groupsRow?.vocabGroupsJson) as Record<string, Record<string, unknown>>
    const domainGroups = obj(groupsRow?.domainGroupsJson) as Record<string, string[]>
    if (!row) return { ...AI_GENERATOR_SETTINGS_DEFAULTS, vocabGroups, domainGroups }
    return {
      tierLimits: obj(row.tierLimitsJson) as Record<string, Record<string, unknown>>,
      domainVocab: obj(row.domainVocabJson) as Record<string, Record<string, unknown>>,
      outputPolicies: obj(row.outputPoliciesJson) as Record<string, Record<string, unknown>>,
      provider: obj(row.providerJson),
      gates: { ...AI_GENERATOR_SETTINGS_DEFAULTS.gates, ...(obj(row.gatesJson) as Partial<AiGeneratorSettingsValues['gates']>) },
      vocabGroups,
      domainGroups,
    }
  } catch {
    return AI_GENERATOR_SETTINGS_DEFAULTS
  }
}

export interface AiGeneratorSettingsPatch {
  tierLimits?: Record<string, Record<string, unknown>>
  domainVocab?: Record<string, Record<string, unknown>>
  outputPolicies?: Record<string, Record<string, unknown>>
  provider?: Record<string, unknown>
  gates?: Partial<AiGeneratorSettingsValues['gates']>
  vocabGroups?: Record<string, Record<string, unknown>>
  domainGroups?: Record<string, string[]>
  updatedById?: string | null
}

export async function upsertAiGeneratorSettings(patch: AiGeneratorSettingsPatch): Promise<{ ok: boolean }> {
  const data: Record<string, unknown> = {}
  if (patch.tierLimits !== undefined) data.tierLimitsJson = patch.tierLimits
  if (patch.domainVocab !== undefined) data.domainVocabJson = patch.domainVocab
  if (patch.outputPolicies !== undefined) data.outputPoliciesJson = patch.outputPolicies
  if (patch.provider !== undefined) data.providerJson = patch.provider
  if (patch.gates !== undefined) data.gatesJson = patch.gates
  if (patch.vocabGroups !== undefined) data.vocabGroupsJson = patch.vocabGroups
  if (patch.domainGroups !== undefined) data.domainGroupsJson = patch.domainGroups
  if (patch.updatedById !== undefined) data.updatedById = patch.updatedById
  try {
    await (prisma as unknown as {
      aiGeneratorSettings: { upsert: (a: unknown) => Promise<unknown> }
    }).aiGeneratorSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

// -----------------------------------------------------------------------------
// Output presets (AiOutputPreset) — admin-authored named output bundles (§16).
// -----------------------------------------------------------------------------

export interface AiOutputPresetRow {
  id: string
  label: string
  minTier: string
  settings: Record<string, unknown>
  sortOrder: number
  active: boolean
}

export async function listAiOutputPresets(opts?: { activeOnly?: boolean }): Promise<AiOutputPresetRow[]> {
  try {
    const rows = (await (prisma as unknown as {
      aiOutputPreset: { findMany: (a: unknown) => Promise<Array<{ id: string; label: string; minTier: string; settingsJson: unknown; sortOrder: number; active: boolean }>> }
    }).aiOutputPreset
      .findMany({
        where: opts?.activeOnly ? { active: true } : {},
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      })
      .catch(() => [])) as Array<{ id: string; label: string; minTier: string; settingsJson: unknown; sortOrder: number; active: boolean }>
    return rows.map((r) => ({ id: r.id, label: r.label, minTier: r.minTier, settings: obj(r.settingsJson), sortOrder: r.sortOrder, active: r.active }))
  } catch {
    return []
  }
}

export async function upsertAiOutputPreset(input: { id?: string; label: string; minTier: string; settings: Record<string, unknown>; sortOrder?: number; active?: boolean }): Promise<{ ok: boolean; id?: string }> {
  try {
    const data = { label: input.label, minTier: input.minTier, settingsJson: input.settings, sortOrder: input.sortOrder ?? 0, active: input.active ?? true }
    const client = (prisma as unknown as {
      aiOutputPreset: { create: (a: unknown) => Promise<{ id: string }>; update: (a: unknown) => Promise<{ id: string }> }
    }).aiOutputPreset
    const row = input.id
      ? await client.update({ where: { id: input.id }, data })
      : await client.create({ data })
    return { ok: true, id: row.id }
  } catch {
    return { ok: false }
  }
}

export async function deleteAiOutputPreset(id: string): Promise<{ ok: boolean }> {
  try {
    await (prisma as unknown as { aiOutputPreset: { delete: (a: unknown) => Promise<unknown> } }).aiOutputPreset.delete({ where: { id } })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
