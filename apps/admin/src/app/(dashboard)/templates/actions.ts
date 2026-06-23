'use server'

// Premium template library — admin curation (Brand Kit V2 Phase 3c).
// Premium templates are owned by the lazily-created system "iLaunchify Templates"
// brand and are browsable + recolorable by Agency creators in the Studio.

import { requireCapability } from '@ilaunchify/auth'
import {
  getOrCreateSystemTemplatesBrand,
  createBrandTemplate,
  deletePremiumTemplate,
  updatePremiumTemplate,
} from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type AdminTemplateResult = { ok: true; id?: string } | { ok: false; error: string }

export async function adminCreatePremiumTemplate(input: {
  name: string
  canvasJson: string
  thumbnailUrl?: string | null
  tier?: string | null
}): Promise<AdminTemplateResult> {
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
  const brandId = await getOrCreateSystemTemplatesBrand()
  if (!brandId) return { ok: false, error: 'Could not initialize the templates library.' }
  const created = await createBrandTemplate({
    brandId,
    name,
    canvasJson: json,
    thumbnailUrl: input.thumbnailUrl?.trim() || null,
    isPremium: true,
    tier: input.tier?.trim() || null,
  })
  if (!created) return { ok: false, error: 'Templates aren’t available yet — run the migration.' }
  await logAuditAs(admin, {
    entityType: 'BrandTemplate',
    entityId: created.id,
    action: 'PREMIUM_TEMPLATE_CREATED',
    payload: { name },
  })
  revalidatePath('/templates')
  return { ok: true, id: created.id }
}

export async function adminUpdatePremiumTemplate(
  id: string,
  patch: { name?: string; tier?: string | null },
): Promise<AdminTemplateResult> {
  const admin = await requireCapability('catalog:write')
  const ok = await updatePremiumTemplate(id, {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.tier !== undefined ? { tier: patch.tier?.trim() || null } : {}),
  })
  if (!ok) return { ok: false, error: 'Template not found.' }
  await logAuditAs(admin, {
    entityType: 'BrandTemplate',
    entityId: id,
    action: 'PREMIUM_TEMPLATE_UPDATED',
    payload: patch as Record<string, unknown>,
  })
  revalidatePath('/templates')
  return { ok: true }
}

export async function adminDeletePremiumTemplate(id: string): Promise<AdminTemplateResult> {
  const admin = await requireCapability('catalog:write')
  const ok = await deletePremiumTemplate(id)
  if (!ok) return { ok: false, error: 'Template not found.' }
  await logAuditAs(admin, {
    entityType: 'BrandTemplate',
    entityId: id,
    action: 'PREMIUM_TEMPLATE_DELETED',
    payload: {},
  })
  revalidatePath('/templates')
  return { ok: true }
}
