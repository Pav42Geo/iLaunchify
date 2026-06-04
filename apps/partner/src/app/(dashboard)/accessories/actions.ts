'use server'

// Track C / C7.j — partner accessory CRUD server actions.
//
// A partner curates AccessoryOffering rows (engraved spoons, ribbons, recipe
// cards, cap covers, …) that creators can bundle onto products at checkout
// (C7.l). The listing partner IS the fulfillment partner (per the
// accessories-are-partner-bundled-only lock), so each offering binds to one of
// the partner's PartnerService rows. New offerings start PENDING_REVIEW and
// surface in the admin verification queue (C7.k) before going ACTIVE.

import { prisma } from '@ilaunchify/db'
import type { AccessoryCategory, OfferingStatus } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, partnerFileKey } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const UPLOAD_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const CATEGORIES: AccessoryCategory[] = [
  'SPOON',
  'RIBBON',
  'TAG',
  'INSERT',
  'CAP_COVER',
  'TISSUE',
  'WAX_SEAL',
  'STICKER_PACK',
  'OTHER',
]

async function requirePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { user, partner: null as null, error: 'NOT_A_PARTNER' as const }
  }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, services: { select: { id: true } } },
  })
  if (!partner) return { user, partner: null as null, error: 'PARTNER_NOT_FOUND' as const }
  // partnerServiceId is a soft FK (no relation, per the partner-bundled lock), so
  // we scope accessories to this partner via their own service ids.
  const serviceIds = partner.services.map((s) => s.id)
  return { user, partner, serviceIds, error: null as null }
}

export async function createAccessory(formData: FormData): Promise<Result<{ id: string }>> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const serviceId = partner.services[0]?.id
  if (!serviceId) {
    return { ok: false, error: 'Add a service before listing accessories — they ship with your fulfillment.' }
  }

  const name = String(formData.get('name') ?? '').trim()
  const category = String(formData.get('category') ?? '') as AccessoryCategory
  const description = String(formData.get('description') ?? '').trim()
  const moq = Math.max(1, Number(formData.get('moq') ?? 1) || 1)
  const leadTimeDays = Math.max(0, Number(formData.get('leadTimeDays') ?? 0) || 0)
  const pricePerUnit = Number(formData.get('pricePerUnit') ?? 0) || 0
  const isCustomizable = formData.get('isCustomizable') === 'on'
  const applicablePartnerOfferingIds = formData.getAll('applicableOfferingIds').map(String)
  const file = formData.get('imageFile')

  if (!name) return { ok: false, error: 'Name is required.' }
  if (!CATEGORIES.includes(category)) return { ok: false, error: 'Pick a category.' }
  if (!description) return { ok: false, error: 'Description is required.' }
  if (pricePerUnit <= 0) return { ok: false, error: 'Enter a price per unit.' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'An image is required.' }
  if (file.size > UPLOAD_MAX_BYTES) return { ok: false, error: 'Image too large (max 10 MB).' }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `Unsupported type "${file.type}". Use PNG, JPEG, or WebP.` }
  }

  let upload
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    upload = await uploadFile({
      key: partnerFileKey({ partnerId: partner.id, section: 'documents', filename: file.name }),
      body: buffer,
      contentType: file.type,
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  const offering = await prisma.accessoryOffering.create({
    data: {
      partnerServiceId: serviceId,
      name,
      category,
      description,
      imageFileKey: upload.key,
      applicablePartnerOfferingIds,
      pricingTiers: [{ quantity: moq, pricePerUnit }],
      moq,
      leadTimeDays,
      isCustomizable,
      customizationFields: [],
      status: 'PENDING_REVIEW',
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'AccessoryOffering',
    entityId: offering.id,
    action: 'create',
    toValue: 'PENDING_REVIEW',
    payload: { partnerId: partner.id, name, category },
  })
  revalidatePath('/accessories')
  return { ok: true, data: offering }
}

/** Archive (soft-retire) or reactivate one of the partner's own offerings. */
export async function setAccessoryStatus(
  id: string,
  status: OfferingStatus,
): Promise<Result<{ id: string }>> {
  const { user, serviceIds, error } = await requirePartner()
  if (error) return { ok: false, error }

  const offering = await prisma.accessoryOffering.findFirst({
    where: { id, partnerServiceId: { in: serviceIds } },
    select: { id: true, status: true },
  })
  if (!offering) return { ok: false, error: 'Accessory not found.' }

  await prisma.accessoryOffering.update({ where: { id }, data: { status } })
  await logAuditAs(user, {
    entityType: 'AccessoryOffering',
    entityId: id,
    action: 'update',
    fromValue: offering.status,
    toValue: status,
    payload: { field: 'status' },
  })
  revalidatePath('/accessories')
  return { ok: true, data: { id } }
}
