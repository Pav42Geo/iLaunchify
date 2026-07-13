'use server'

// Facilities manager actions — Company profile "Facilities & label disclosure"
// (Pavel 2026-07-12: partners can run MULTIPLE facilities; each is a real
// PartnerFacility routing unit). Create / update / set-primary / delete, all
// ownership-fenced + audited. On an APPROVED account any facility change flips
// the FACILITY verification section back to PENDING (operations re-review) —
// services keep routing while the change is verified (forward-only, D8 spirit).

import { prisma, getActiveMarketCountries } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type FacilityResult = { ok: true } | { ok: false; error: string }

export interface FacilityInput {
  id?: string | null
  name: string
  addressLine1: string
  addressLine2?: string
  city: string
  region: string // state / province code
  postalCode: string
  country?: string
  isDefault?: boolean
}

async function requirePartner() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true },
  })
  return { user, partner }
}

async function flagFacilityReview(partnerId: string, approved: boolean) {
  if (!approved) return
  await prisma.partnerVerificationSection.upsert({
    where: { partnerId_type: { partnerId, type: 'FACILITY' } },
    create: { partnerId, type: 'FACILITY', status: 'PENDING' },
    update: { status: 'PENDING', verifiedAt: null, verifiedById: null },
  })
}

export async function saveFacility(input: FacilityInput): Promise<FacilityResult> {
  const { user, partner } = await requirePartner()
  if (!partner) return { ok: false, error: 'No partner account.' }

  const name = input.name.trim().slice(0, 120)
  const addressLine1 = input.addressLine1.trim().slice(0, 160)
  const city = input.city.trim().slice(0, 80)
  const region = input.region.trim().slice(0, 40)
  const postalCode = input.postalCode.trim().slice(0, 20)
  if (!name || !addressLine1 || !city || !region || !postalCode)
    return { ok: false, error: 'Name, street, city, state and ZIP are all required.' }
  const addressLine2 = input.addressLine2?.trim().slice(0, 160) || null
  // Country must be one the PLATFORM MARKETS management offers (server-side
  // mirror of the market-driven select); anything else falls back to the
  // first active market.
  const offered = await getActiveMarketCountries()
  const requested = input.country?.trim().slice(0, 2).toUpperCase()
  const country =
    (requested && offered.some((c) => c.code === requested) ? requested : offered[0]?.code) ?? 'US'

  const approved = partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED'
  const data = { name, addressLine1, addressLine2, city, region, postalCode, country }

  let facilityId = input.id ?? null
  if (facilityId) {
    // Ownership fence: update only within this partner's rows.
    const { count } = await prisma.partnerFacility.updateMany({
      where: { id: facilityId, partnerId: partner.id },
      data,
    })
    if (count === 0) return { ok: false, error: 'Facility not found.' }
  } else {
    const existing = await prisma.partnerFacility.count({ where: { partnerId: partner.id } })
    const created = await prisma.partnerFacility.create({
      data: { ...data, partnerId: partner.id, isDefault: existing === 0 },
    })
    facilityId = created.id
  }

  if (input.isDefault) await makeDefault(partner.id, facilityId)
  await flagFacilityReview(partner.id, approved)
  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: input.id ? 'FACILITY_UPDATED' : 'FACILITY_ADDED',
    payload: { facilityId, name, city, region, reReview: approved },
  })
  revalidatePath('/settings/company')
  revalidatePath('/my-application')
  return { ok: true }
}

async function makeDefault(partnerId: string, facilityId: string) {
  await prisma.$transaction([
    prisma.partnerFacility.updateMany({ where: { partnerId }, data: { isDefault: false } }),
    prisma.partnerFacility.updateMany({
      where: { id: facilityId, partnerId },
      data: { isDefault: true },
    }),
  ])
}

export async function setPrimaryFacility(facilityId: string): Promise<FacilityResult> {
  const { user, partner } = await requirePartner()
  if (!partner) return { ok: false, error: 'No partner account.' }
  const fac = await prisma.partnerFacility.findFirst({
    where: { id: facilityId, partnerId: partner.id },
    select: { id: true, name: true },
  })
  if (!fac) return { ok: false, error: 'Facility not found.' }
  await makeDefault(partner.id, facilityId)
  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'FACILITY_SET_PRIMARY',
    payload: { facilityId, name: fac.name },
  })
  revalidatePath('/settings/company')
  return { ok: true }
}

export async function deleteFacility(facilityId: string): Promise<FacilityResult> {
  const { user, partner } = await requirePartner()
  if (!partner) return { ok: false, error: 'No partner account.' }
  const fac = await prisma.partnerFacility.findFirst({
    where: { id: facilityId, partnerId: partner.id },
    select: { id: true, name: true, isDefault: true },
  })
  if (!fac) return { ok: false, error: 'Facility not found.' }
  if (fac.isDefault)
    return { ok: false, error: 'Set another facility as primary before removing this one.' }

  try {
    await prisma.partnerFacility.delete({ where: { id: fac.id } })
  } catch {
    // FK'd by services / product variants / certificate instances.
    return {
      ok: false,
      error: 'This facility is referenced by services or products and can’t be removed.',
    }
  }
  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'FACILITY_REMOVED',
    payload: { facilityId, name: fac.name },
  })
  revalidatePath('/settings/company')
  return { ok: true }
}
