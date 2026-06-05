// Slice C8 — shared server-side loaders for the partner packaging-offerings
// surface. Centralizes the auth-scoped fetch so the list / new / edit pages all
// resolve services + container types + compatibility identically.

import { prisma } from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
import type { DecorationMethod } from '@ilaunchify/db'
import {
  CONTAINER_CATEGORY_LABELS,
} from './constants'
import type { ServiceOption, PackagingTypeOption } from './OfferingForm'

const SERVICE_TYPE_LABELS: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
  WAREHOUSE: 'Warehouse / 3PL',
}

export interface OfferingsContext {
  partnerId: string
  serviceIds: string[]
  services: ServiceOption[]
  packagingTypes: PackagingTypeOption[]
}

/**
 * Resolve the signed-in partner, their service options, and the active
 * PackagingType catalog with each type's compatible decoration methods.
 * Returns null when the requester is not an actionable partner (page renders
 * nothing — the dashboard shell guards access).
 */
export async function loadOfferingsContext(): Promise<OfferingsContext | null> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return null

  const services = await prisma.partnerService.findMany({
    where: { partnerId: actor.partnerId },
    select: { id: true, type: true },
    orderBy: { createdAt: 'asc' },
  })

  // Active platform catalog + the active compatibility matrix, fetched once and
  // joined in memory (matrix is small + admin-curated).
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
    // NONE (stock / blank) is always offerable regardless of the matrix.
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
