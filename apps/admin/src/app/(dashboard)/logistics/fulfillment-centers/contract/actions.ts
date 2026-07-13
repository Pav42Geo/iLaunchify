'use server'

// Contract a new Fulfillment Center (Pavel 2026-07-13) — the deliberate admin
// counterpart to WAREHOUSE being removed from partner self-serve. Joining the
// FC network is a CONTRACTED program: the admin picks an existing approved
// partner, records the contract reference, and the WAREHOUSE service is
// created as DRAFT — it goes live only through the partner's Activation Setup
// track (D8), like every other service. Audited with the contract metadata.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export interface ContractFcState {
  error: string | null
}

export async function contractFulfillmentCenter(
  _prev: ContractFcState,
  formData: FormData,
): Promise<ContractFcState> {
  const admin = await requireCapability('platform:admin')

  const partnerId = String(formData.get('partnerId') ?? '').trim()
  const contractRef = String(formData.get('contractRef') ?? '').trim().slice(0, 120)
  const note = String(formData.get('note') ?? '').trim().slice(0, 500)
  if (!partnerId) return { error: 'Pick the partner being contracted.' }
  if (!contractRef) return { error: 'Record the contract reference — this is a contracted program.' }

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      companyName: true,
      status: true,
      services: { select: { type: true } },
      facilities: { where: { isDefault: true }, select: { id: true }, take: 1 },
    },
  })
  if (!partner) return { error: 'Partner not found.' }
  if (partner.status !== 'ACTIVE' && partner.status !== 'INTEGRATION_ENHANCED')
    return { error: `${partner.companyName} isn’t approved yet — approve the partner first.` }
  if (partner.services.some((s) => (s.type as string) === 'WAREHOUSE'))
    return { error: `${partner.companyName} already has a WAREHOUSE service.` }

  const service = await prisma.partnerService.create({
    data: {
      partnerId: partner.id,
      type: 'WAREHOUSE',
      status: 'DRAFT', // goes live via the partner's Activation track (D8)
      facilityId: partner.facilities[0]?.id ?? null,
      capabilities: { type: 'WAREHOUSE' },
    },
  })

  await logAuditAs(admin, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'FC_CONTRACTED',
    toValue: 'WAREHOUSE',
    payload: {
      partnerId: partner.id,
      companyName: partner.companyName,
      contractRef,
      note: note || null,
      via: 'admin-fc-contracting',
    },
  })

  revalidatePath('/logistics/fulfillment-centers')
  redirect('/logistics/fulfillment-centers?status=DRAFT')
}
