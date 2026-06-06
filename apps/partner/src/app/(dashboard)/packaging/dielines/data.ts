// Slice C9 Phase 1 — server-side loaders for the partner packaging-dielines
// surface. Auth-scoped (requirePartnerActor + service ids) so the list / new /
// edit pages all resolve services + container types + compatibility identically
// to the offerings sibling. Also exposes the offering-eligible dieline list used
// by the offering form dropdown.

import { prisma } from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
import type { DecorationMethod, DielineStatus } from '@ilaunchify/db'
import { CONTAINER_CATEGORY_LABELS } from '../offerings/constants'
import type { PackagingTypeOption } from '../offerings/OfferingForm'
import { OFFERING_ELIGIBLE_DIELINE_STATUSES } from './constants'

const SERVICE_TYPE_LABELS: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
  WAREHOUSE: 'Warehouse / 3PL',
}

export interface ServiceOption {
  id: string
  label: string
}

export interface DielinesContext {
  partnerId: string
  serviceIds: string[]
  services: ServiceOption[]
  packagingTypes: PackagingTypeOption[]
}

/**
 * Resolve the signed-in partner, their service options, and the active
 * PackagingType catalog with each type's compatible decoration methods (same
 * join the offerings loader does). Returns null when the requester is not an
 * actionable partner.
 */
export async function loadDielinesContext(): Promise<DielinesContext | null> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return null

  const services = await prisma.partnerService.findMany({
    where: { partnerId: actor.partnerId },
    select: { id: true, type: true },
    orderBy: { createdAt: 'asc' },
  })

  const [types, compat] = await Promise.all([
    prisma.packagingType.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, displayName: true, containerCategory: true },
      orderBy: { displayName: 'asc' },
    }),
    prisma.packagingDecorationCompatibility.findMany({
      where: { isActive: true },
      select: { containerCategory: true, decorationMethod: true },
    }),
  ])

  const byCategory = new Map<string, DecorationMethod[]>()
  for (const row of compat) {
    const list = byCategory.get(row.containerCategory) ?? []
    list.push(row.decorationMethod)
    byCategory.set(row.containerCategory, list)
  }

  const packagingTypes: PackagingTypeOption[] = types.map((t) => {
    const methods = t.containerCategory ? (byCategory.get(t.containerCategory) ?? []) : []
    const compatibleMethods: DecorationMethod[] = [...methods]
    if (!compatibleMethods.includes('NONE')) compatibleMethods.push('NONE')
    return {
      id: t.id,
      displayName: t.displayName,
      containerCategoryLabel: t.containerCategory
        ? CONTAINER_CATEGORY_LABELS[t.containerCategory]
        : null,
      compatibleMethods,
    }
  })

  return {
    partnerId: actor.partnerId,
    serviceIds: services.map((s) => s.id),
    services: services.map((s) => ({
      id: s.id,
      label: SERVICE_TYPE_LABELS[s.type] ?? s.type,
    })),
    packagingTypes,
  }
}

// -----------------------------------------------------------------------------
// Offering dropdown feed — the partner's dielines eligible to bind to an
// offering: ACTIVE or PARTNER_CONFIRMED, scoped to their own service ids. Each
// option carries (packagingTypeId, decorationMethod) so the offering form can
// filter to the chosen container × decoration client-side.
// -----------------------------------------------------------------------------

export interface DielineOption {
  id: string
  packagingTypeId: string
  decorationMethod: DecorationMethod
  status: DielineStatus
  label: string
}

export async function loadEligibleDielines(serviceIds: string[]): Promise<DielineOption[]> {
  if (serviceIds.length === 0) return []
  const dielines = await prisma.packagingDieline.findMany({
    where: {
      partnerServiceId: { in: serviceIds },
      status: { in: OFFERING_ELIGIBLE_DIELINE_STATUSES },
    },
    select: {
      id: true,
      packagingTypeId: true,
      decorationMethod: true,
      status: true,
      widthMm: true,
      heightMm: true,
      packagingType: { select: { displayName: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return dielines.map((d) => {
    const dims =
      d.widthMm !== null && d.heightMm !== null
        ? ` · ${Number(d.widthMm)}×${Number(d.heightMm)}mm`
        : ''
    return {
      id: d.id,
      packagingTypeId: d.packagingTypeId,
      decorationMethod: d.decorationMethod,
      status: d.status,
      label: `${d.packagingType.displayName}${dims}`,
    }
  })
}
