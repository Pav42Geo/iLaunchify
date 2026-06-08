'use server'

// Flavor-preset mutations for the Partner Product Builder (recipe-builder Phase 2).
// Each is partner-scoped (requirePartnerActor + decideTemplateAccess — the same
// centralized guard the ingredient/variant card-actions use), audited, and
// revalidates the editor. Drives FlavorPresetsPanel's injected callbacks.

import { prisma } from '@ilaunchify/db'
import { requirePartnerActor, decideTemplateAccess } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import type { FlavorPresetStatus } from '@ilaunchify/db'

type Ok = { ok: true }
type Err = { ok: false; error: string }

/** Authorize a partner against a template (ownership + editable status). */
async function authorizeTemplate(productTemplateId: string) {
  const actor = await requirePartnerActor()
  if (!actor.ok) return { ok: false as const, error: actor.error }

  const template = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: {
      id: true,
      status: true,
      manufacturerServiceId: true,
      manufacturerService: { select: { partnerId: true } },
    },
  })
  const decision = decideTemplateAccess({
    role: actor.user.role,
    requesterPartnerId: actor.partnerId,
    template: {
      exists: !!template,
      status: template?.status ?? null,
      ownerPartnerId: template?.manufacturerService?.partnerId ?? null,
      hasManufacturerService: !!template?.manufacturerServiceId,
    },
  })
  if (!decision.allowed) return { ok: false as const, error: decision.reason }
  return { ok: true as const, user: actor.user, partnerId: actor.partnerId, templateId: template!.id }
}

/** Resolve the owning template for a flavor preset (for update/remove auth). */
async function authorizeFlavor(flavorPresetId: string) {
  const preset = await prisma.flavorPreset.findUnique({
    where: { id: flavorPresetId },
    select: { id: true, productTemplateId: true },
  })
  if (!preset) return { ok: false as const, error: 'Flavor not found.' }
  const auth = await authorizeTemplate(preset.productTemplateId)
  if (!auth.ok) return auth
  return { ok: true as const, user: auth.user, templateId: preset.productTemplateId, presetId: preset.id }
}

export async function createFlavorPreset(input: {
  productTemplateId: string
  name: string
}): Promise<{ ok: true; id: string } | Err> {
  const auth = await authorizeTemplate(input.productTemplateId)
  if (!auth.ok) return { ok: false, error: auth.error }
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Flavor name is required.' }

  const max = await prisma.flavorPreset.aggregate({ where: { productTemplateId: input.productTemplateId }, _max: { sortOrder: true } })
  const preset = await prisma.flavorPreset.create({
    data: {
      productTemplateId: input.productTemplateId,
      name,
      slotResolution: [], // empty until the manufacturer maps slots
      status: 'DRAFT',
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  })
  await logAuditAs(auth.user, {
    entityType: 'ProductTemplate',
    entityId: input.productTemplateId,
    action: 'FLAVOR_PRESET_CREATE',
    payload: { flavorPresetId: preset.id, name },
  })
  revalidatePath(`/products/${input.productTemplateId}/edit`)
  return { ok: true, id: preset.id }
}

export interface FlavorPresetPatch {
  name?: string
  statementOfIdentity?: string | null
  swatchHex?: string | null
  priceDeltaCents?: number
  status?: FlavorPresetStatus
}

export async function updateFlavorPreset(input: {
  flavorPresetId: string
  patch: FlavorPresetPatch
}): Promise<Ok | Err> {
  const auth = await authorizeFlavor(input.flavorPresetId)
  if (!auth.ok) return { ok: false, error: auth.error }

  const data: FlavorPresetPatch = {}
  if (input.patch.name !== undefined) {
    const n = input.patch.name.trim()
    if (!n) return { ok: false, error: 'Flavor name cannot be empty.' }
    data.name = n
  }
  if (input.patch.statementOfIdentity !== undefined) data.statementOfIdentity = input.patch.statementOfIdentity?.trim() || null
  if (input.patch.swatchHex !== undefined) data.swatchHex = input.patch.swatchHex?.trim() || null
  if (input.patch.priceDeltaCents !== undefined) data.priceDeltaCents = input.patch.priceDeltaCents
  if (input.patch.status !== undefined) data.status = input.patch.status

  await prisma.flavorPreset.update({ where: { id: input.flavorPresetId }, data })
  await logAuditAs(auth.user, {
    entityType: 'ProductTemplate',
    entityId: auth.templateId,
    action: 'FLAVOR_PRESET_UPDATE',
    payload: { flavorPresetId: input.flavorPresetId, fields: Object.keys(data) },
  })
  revalidatePath(`/products/${auth.templateId}/edit`)
  return { ok: true }
}

export async function removeFlavorPreset(flavorPresetId: string): Promise<Ok | Err> {
  const auth = await authorizeFlavor(flavorPresetId)
  if (!auth.ok) return { ok: false, error: auth.error }
  await prisma.flavorPreset.delete({ where: { id: flavorPresetId } })
  await logAuditAs(auth.user, {
    entityType: 'ProductTemplate',
    entityId: auth.templateId,
    action: 'FLAVOR_PRESET_REMOVE',
    payload: { flavorPresetId },
  })
  revalidatePath(`/products/${auth.templateId}/edit`)
  return { ok: true }
}
