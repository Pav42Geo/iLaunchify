'use server'

// Design Template Library — admin curation (docs/DESIGN_TEMPLATE_LIBRARY.md §8).
// Admin authors library templates and tags each with domain + style category +
// die-line targeting, saved as REGULAR (all tiers) or PREMIUM (Agency-gated). All
// library templates are owned by the system "iLaunchify Templates" brand.

import { requireCapability } from '@ilaunchify/auth'
import {
  getOrCreateSystemTemplatesBrand,
  createBrandTemplate,
  duplicateBrandTemplate,
  setTemplateStyleAssignments,
  updateLibraryTemplate,
  deleteLibraryTemplate,
  listTemplateStyles,
  type TemplateStyleValues,
  type TemplateStyleDomain,
} from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type AdminTemplateResult = { ok: true; id?: string } | { ok: false; error: string }

export interface LibraryTemplateInput {
  name: string
  canvasJson: string
  thumbnailUrl?: string | null
  isPremium: boolean
  tier?: string | null
  // targeting
  domain: string
  matchMode?: 'SHAPE_FAMILY' | 'EXACT'
  targetContainerCategory?: string | null
  aspectBucket?: string | null
  targetSurface?: string | null
  // styles
  primaryStyleId?: string | null
  tagStyleIds?: string[]
}

/** Style options for a domain (for the authoring form's pickers). */
export async function adminListTemplateStyleOptions(
  domain: string,
): Promise<TemplateStyleValues[]> {
  await requireCapability('catalog:write')
  return listTemplateStyles(domain as TemplateStyleDomain, { activeOnly: false })
}

export async function adminCreateLibraryTemplate(
  input: LibraryTemplateInput,
): Promise<AdminTemplateResult> {
  const admin = await requireCapability('catalog:write')
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Name is required.' }
  const json = input.canvasJson.trim()
  if (!json) return { ok: false, error: 'Paste the design’s canvas JSON.' }
  try {
    JSON.parse(json)
  } catch {
    return { ok: false, error: 'Canvas JSON is not valid JSON.' }
  }
  if (!input.domain) return { ok: false, error: 'Pick a product domain.' }

  const brandId = await getOrCreateSystemTemplatesBrand()
  if (!brandId) return { ok: false, error: 'Could not initialize the templates library.' }

  const created = await createBrandTemplate({
    brandId,
    name,
    canvasJson: json,
    thumbnailUrl: input.thumbnailUrl?.trim() || null,
    isPremium: input.isPremium,
    tier: input.isPremium ? input.tier?.trim() || null : null,
    domain: input.domain,
    matchMode: input.matchMode ?? 'SHAPE_FAMILY',
    targetContainerCategory: input.targetContainerCategory?.trim() || null,
    aspectBucket: input.aspectBucket?.trim() || null,
    targetSurface: input.targetSurface?.trim() || null,
  })
  if (!created) return { ok: false, error: 'Templates aren’t available yet — run the migration.' }

  await setTemplateStyleAssignments(created.id, input.primaryStyleId ?? null, input.tagStyleIds ?? [])

  await logAuditAs(admin, {
    entityType: 'BrandTemplate',
    entityId: created.id,
    action: input.isPremium ? 'PREMIUM_TEMPLATE_CREATED' : 'LIBRARY_TEMPLATE_CREATED',
    payload: { name, domain: input.domain, isPremium: input.isPremium },
  })
  revalidatePath('/templates')
  return { ok: true, id: created.id }
}

export async function adminUpdateLibraryTemplate(
  id: string,
  patch: {
    name?: string
    tier?: string | null
    isPremium?: boolean
    domain?: string
    matchMode?: 'SHAPE_FAMILY' | 'EXACT'
    targetContainerCategory?: string | null
    aspectBucket?: string | null
    targetSurface?: string | null
    primaryStyleId?: string | null
    tagStyleIds?: string[]
  },
): Promise<AdminTemplateResult> {
  const admin = await requireCapability('catalog:write')
  const ok = await updateLibraryTemplate(id, {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.tier !== undefined ? { tier: patch.tier?.trim() || null } : {}),
    ...(patch.isPremium !== undefined ? { isPremium: patch.isPremium } : {}),
    ...(patch.domain !== undefined ? { domain: patch.domain } : {}),
    ...(patch.matchMode !== undefined ? { matchMode: patch.matchMode } : {}),
    ...(patch.targetContainerCategory !== undefined
      ? { targetContainerCategory: patch.targetContainerCategory?.trim() || null }
      : {}),
    ...(patch.aspectBucket !== undefined ? { aspectBucket: patch.aspectBucket?.trim() || null } : {}),
    ...(patch.targetSurface !== undefined ? { targetSurface: patch.targetSurface?.trim() || null } : {}),
  })
  if (!ok) return { ok: false, error: 'Template not found.' }
  if (patch.primaryStyleId !== undefined || patch.tagStyleIds !== undefined) {
    await setTemplateStyleAssignments(id, patch.primaryStyleId ?? null, patch.tagStyleIds ?? [])
  }
  await logAuditAs(admin, {
    entityType: 'BrandTemplate',
    entityId: id,
    action: 'LIBRARY_TEMPLATE_UPDATED',
    payload: patch as Record<string, unknown>,
  })
  revalidatePath('/templates')
  return { ok: true }
}

/**
 * Duplicate a library template as a CANDIDATE (versioning v2 Phase 4, option (b)
 * — Pavel 2026-07-05: template "alternates" are plain sibling LibraryTemplate
 * rows, no Design machinery). The copy keeps layout + targeting, is never
 * premium (helper convention), and lands next to the original for side-by-side
 * compare in the library. Style assignments intentionally NOT copied — the
 * admin re-tags the winner when publishing.
 */
export async function adminDuplicateLibraryTemplate(id: string): Promise<AdminTemplateResult> {
  const admin = await requireCapability('catalog:write')
  const brandId = await getOrCreateSystemTemplatesBrand()
  if (!brandId) return { ok: false, error: 'Could not initialize the templates library.' }
  const created = await duplicateBrandTemplate(brandId, id)
  if (!created) return { ok: false, error: 'Template not found.' }
  await logAuditAs(admin, {
    entityType: 'BrandTemplate',
    entityId: created.id,
    action: 'LIBRARY_TEMPLATE_CREATED',
    payload: { duplicatedFrom: id, candidate: true },
  })
  revalidatePath('/templates')
  return { ok: true, id: created.id }
}

export async function adminDeleteLibraryTemplate(id: string): Promise<AdminTemplateResult> {
  const admin = await requireCapability('catalog:write')
  const ok = await deleteLibraryTemplate(id)
  if (!ok) return { ok: false, error: 'Template not found.' }
  await logAuditAs(admin, {
    entityType: 'BrandTemplate',
    entityId: id,
    action: 'LIBRARY_TEMPLATE_DELETED',
    payload: {},
  })
  revalidatePath('/templates')
  return { ok: true }
}
