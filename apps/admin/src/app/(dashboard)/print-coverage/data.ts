// Admin Print Coverage dashboard data (docs/PRINT_PROVIDER_SELECTION.md §10.4,
// PS-8d). The admin's window into the automatic RFQ machinery: which templates
// are uncovered, which requests are open, which claims are mid-flight, and how
// long coverage takes to come back. Detection/broadcast/unpark all run
// automatically (PS-8b/8c) — this surface is visibility + two nudges (re-broadcast,
// extend). Cheap by construction: everything derives from the request/claim rows
// plus a PAUSED-template count; we do NOT scan every template's coverage on load.

import { prisma } from '@ilaunchify/db'

export type CoverageRequestStatus = 'OPEN' | 'CLAIMED' | 'FULFILLED' | 'EXPIRED'

export interface CoverageRequestRow {
  requestId: string
  templateId: string
  templateName: string
  templateSlug: string | null
  packagingLabel: string
  status: CoverageRequestStatus
  claimCount: number
  notifiedCount: number
  region: string | null
  createdAt: string
  expiresAt: string | null
}

export interface CoverageKpis {
  uncoveredTemplates: number
  fragile: number
  openRfqs: number
  claimsAwaiting: number
  medianDaysToCoverage: number | null
}

export interface CoverageDashboard {
  kpis: CoverageKpis
  rows: CoverageRequestRow[]
}

const PAGE = 100

export async function loadCoverageDashboard(): Promise<CoverageDashboard> {
  // uncovered/fragile read the denormalized ProductTemplate.printCoverage cache
  // (exact + cheap; recomputeTemplateCoverage keeps it fresh).
  const [requests, uncoveredTemplates, fragile, openRfqs, claimsAwaiting, fulfilled] =
    await Promise.all([
      prisma.printCapabilityRequest.findMany({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: PAGE,
        select: {
          id: true,
          productTemplateId: true,
          packagingTypeId: true,
          status: true,
          manufacturerRegion: true,
          notifiedServiceIds: true,
          createdAt: true,
          expiresAt: true,
          _count: { select: { claims: true } },
        },
      }),
      prisma.productTemplate.count({ where: { printCoverage: 0 } }),
      prisma.productTemplate.count({ where: { printCoverage: 1 } }),
      prisma.printCapabilityRequest.count({ where: { status: 'OPEN' } }),
      prisma.printCapabilityClaim.count({
        where: { status: { in: ['SUBMITTED', 'OFFERING_DRAFTED'] } },
      }),
      prisma.printCapabilityRequest.findMany({
        where: { status: 'FULFILLED' },
        select: { createdAt: true, updatedAt: true },
        take: 500,
        orderBy: { updatedAt: 'desc' },
      }),
    ])

  // Labels for the visible request set.
  const typeIds = [...new Set(requests.map((r) => r.packagingTypeId))]
  const templateIds = [...new Set(requests.map((r) => r.productTemplateId))]
  const [types, templates] = await Promise.all([
    typeIds.length
      ? prisma.packagingType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
    templateIds.length
      ? prisma.productTemplate.findMany({
          where: { id: { in: templateIds } },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve([]),
  ])
  const typeName = new Map(types.map((t) => [t.id, t.displayName]))
  const tpl = new Map(templates.map((t) => [t.id, t]))

  const rows: CoverageRequestRow[] = requests.map((r) => ({
    requestId: r.id,
    templateId: r.productTemplateId,
    templateName: tpl.get(r.productTemplateId)?.name ?? '(unknown template)',
    templateSlug: tpl.get(r.productTemplateId)?.slug ?? null,
    packagingLabel: typeName.get(r.packagingTypeId) ?? 'Packaging format',
    status: r.status as CoverageRequestStatus,
    claimCount: r._count.claims,
    notifiedCount: r.notifiedServiceIds.length,
    region: r.manufacturerRegion,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  }))

  // Median time-to-coverage from FULFILLED requests (createdAt → updatedAt).
  const durationsDays = fulfilled
    .map((f) => (f.updatedAt.getTime() - f.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b)
  const medianDaysToCoverage =
    durationsDays.length === 0
      ? null
      : Math.round(
          (durationsDays.length % 2
            ? durationsDays[(durationsDays.length - 1) / 2]!
            : (durationsDays[durationsDays.length / 2 - 1]! +
                durationsDays[durationsDays.length / 2]!) /
              2) * 10,
        ) / 10

  return {
    kpis: {
      uncoveredTemplates,
      fragile,
      openRfqs,
      claimsAwaiting,
      medianDaysToCoverage,
    },
    rows,
  }
}
