'use server'

// Brand template actions (docs/BRAND_KIT_PROPOSAL.md). Delete only here — creation
// ("Save as template") happens in the Design Studio. Ownership-guarded: the brand
// must belong to the signed-in creator, and the template must belong to that brand.

import { prisma, deleteBrandTemplate } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

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
