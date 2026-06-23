'use server'

// Admin Design Studio — template authoring (docs/DESIGN_TEMPLATE_LIBRARY.md §8/§8.1).
// The admin opens the SAME creator Design Studio in template-author mode (this route is
// admin-gated). Saving writes the design to the system templates brand as a Regular or
// Premium library template with domain + style + die-line metadata. All actions are
// capability-gated — a normal creator can never reach them.

import { requireCapability } from '@ilaunchify/auth'
import {
  getOrCreateSystemTemplatesBrand,
  createBrandTemplate,
  setTemplateStyleAssignments,
  listTemplateStyles,
  type TemplateStyleValues,
  type TemplateStyleDomain,
} from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'

/** Style options for a domain (for the save dialog's pickers). Admin-gated. */
export async function loadTemplateAuthorStyleOptions(domain: string): Promise<TemplateStyleValues[]> {
  await requireCapability('catalog:write')
  return listTemplateStyles(domain as TemplateStyleDomain, { activeOnly: false })
}

export type SaveStudioTemplateResult = { ok: true; id: string } | { ok: false; error: string }

export async function saveStudioLibraryTemplate(input: {
  name: string
  canvasJson: string
  thumbnailUrl?: string | null
  isPremium: boolean
  tier?: string | null
  domain: string
  matchMode?: 'SHAPE_FAMILY' | 'EXACT'
  targetContainerCategory?: string | null
  aspectBucket?: string | null
  targetSurface?: string | null
  primaryStyleId?: string | null
  tagStyleIds?: string[]
}): Promise<SaveStudioTemplateResult> {
  const admin = await requireCapability('catalog:write')
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Name is required.' }
  try {
    JSON.parse(input.canvasJson)
  } catch {
    return { ok: false, error: 'Canvas data is invalid.' }
  }
  const brandId = await getOrCreateSystemTemplatesBrand()
  if (!brandId) return { ok: false, error: 'Templates library unavailable — run the migration.' }

  const created = await createBrandTemplate({
    brandId,
    name,
    canvasJson: input.canvasJson,
    thumbnailUrl: input.thumbnailUrl ?? null,
    isPremium: input.isPremium,
    tier: input.isPremium ? input.tier ?? null : null,
    domain: input.domain,
    matchMode: input.matchMode ?? 'SHAPE_FAMILY',
    targetContainerCategory: input.targetContainerCategory ?? null,
    aspectBucket: input.aspectBucket ?? null,
    targetSurface: input.targetSurface ?? null,
  })
  if (!created) return { ok: false, error: 'Could not save the template.' }

  await setTemplateStyleAssignments(created.id, input.primaryStyleId ?? null, input.tagStyleIds ?? [])

  await logAuditAs(admin, {
    entityType: 'BrandTemplate',
    entityId: created.id,
    action: input.isPremium ? 'PREMIUM_TEMPLATE_CREATED' : 'LIBRARY_TEMPLATE_CREATED',
    payload: { name, domain: input.domain, viaStudio: true },
  })
  return { ok: true, id: created.id }
}
