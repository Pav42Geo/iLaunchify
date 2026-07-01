'use server'

// Brand template actions (docs/BRAND_KIT_PROPOSAL.md). Delete only here — creation
// ("Save as template") happens in the Design Studio. Ownership-guarded: the brand
// must belong to the signed-in creator, and the template must belong to that brand.

import {
  prisma,
  deleteBrandTemplate,
  renameBrandTemplate,
  duplicateBrandTemplate,
  countBrandTemplates,
} from '@ilaunchify/db'
import { requireUser, getCreatorTier, brandLimits } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

/** Confirm the brand belongs to the signed-in creator; returns the user or null. */
async function ownBrand(brandId: string) {
  const user = await requireUser()
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: { id: true },
  })
  return brand ? user : null
}

export async function deleteBrandTemplateAction(
  brandId: string,
  templateId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()

  // Brand must belong to this creator.
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: { id: true },
  })
  if (!brand) return { ok: false, error: 'That brand kit is not on your account.' }

  const removed = await deleteBrandTemplate(brandId, templateId)
  if (!removed) return { ok: false, error: 'Template not found.' }

  await logAuditAs(user, {
    entityType: 'BrandTemplate',
    entityId: templateId,
    action: 'BRAND_TEMPLATE_DELETED',
  })
  revalidatePath(`/brands/${brandId}/assets`)
  return { ok: true }
}

export async function renameBrandTemplateAction(
  brandId: string,
  templateId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await ownBrand(brandId)
  if (!user) return { ok: false, error: 'That brand kit is not on your account.' }

  const clean = name.trim()
  if (!clean) return { ok: false, error: 'Enter a template name.' }

  const ok = await renameBrandTemplate(brandId, templateId, clean)
  if (!ok) return { ok: false, error: 'Template not found.' }

  await logAuditAs(user, {
    entityType: 'BrandTemplate',
    entityId: templateId,
    action: 'BRAND_TEMPLATE_RENAMED',
    payload: { name: clean.slice(0, 80) },
  })
  revalidatePath(`/brands/${brandId}/assets`)
  return { ok: true }
}

export async function duplicateBrandTemplateAction(
  brandId: string,
  templateId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await ownBrand(brandId)
  if (!user) return { ok: false, error: 'That brand kit is not on your account.' }

  // Enforce the per-tier template cap before creating the copy.
  const [tier, used] = await Promise.all([getCreatorTier(user.id), countBrandTemplates(brandId)])
  const cap = brandLimits(tier).templatesPerKit
  if (Number.isFinite(cap) && used >= cap) {
    return { ok: false, error: `You've reached your template limit (${cap}) for this kit.` }
  }

  const created = await duplicateBrandTemplate(brandId, templateId)
  if (!created) return { ok: false, error: 'Could not duplicate this template.' }

  await logAuditAs(user, {
    entityType: 'BrandTemplate',
    entityId: created.id,
    action: 'BRAND_TEMPLATE_CREATED',
    payload: { duplicatedFrom: templateId },
  })
  revalidatePath(`/brands/${brandId}/assets`)
  return { ok: true, id: created.id }
}
