// =============================================================================
// Die-line Operations — admin workspace (docs/DIELINE_MANAGEMENT_UX.md, P1).
//
// Not a flat list: a triage Inbox + lenses (By packaging type · By partner) over
// every partner-submitted die-line, each row carrying its context (partner ·
// packaging type · decoration · status · parse confidence · how many offerings
// use it) and opening the Die-line Curator. Server loads + shapes; the client
// workspace owns the lens/search/sort interactions.
// =============================================================================

import { prisma, listDielineCanonicalLinks, getCanonicalShapeOptions } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { aspectBucketFor } from '@ilaunchify/ui'
import { DielineOpsWorkspace, type OpsRow } from './DielineOpsWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Die-lines — Admin' }

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export default async function AdminDielinesPage() {
  const rows = await prisma.packagingDieline.findMany({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: [{ partnerConfirmedAt: 'desc' }, { uploadedAt: 'desc' }],
    take: 300,
    select: {
      id: true,
      status: true,
      decorationMethod: true,
      originalFileFormat: true,
      widthMm: true,
      heightMm: true,
      parseAccuracyScore: true,
      partnerConfirmedAt: true,
      adminVerifiedAt: true,
      uploadedAt: true,
      normalizedSvgKey: true,
      thumbnailKey: true,
      packagingTypeId: true,
      packagingType: { select: { displayName: true } },
      partnerService: { select: { partner: { select: { companyName: true } } } },
      _count: { select: { offerings: true } },
    },
  })

  // Sign thumbnails (short-lived) for rows that have one — best-effort, in parallel.
  const thumbs = await Promise.all(
    rows.map((r) => (r.thumbnailKey ? getSignedReadUrl(r.thumbnailKey).catch(() => null) : Promise.resolve(null))),
  )

  // Canonical-shape mapping (P2). Degrades to all-unmapped until the additive
  // columns are pushed (helper returns [] on a missing column).
  const links = await listDielineCanonicalLinks(rows.map((r) => r.id))
  const shapeByDieline = new Map(links.map((l) => [l.id, l.canonicalShapeName]))

  // Canonical shape options (for the By-shape lens batch-map picker).
  const shapeOptions = await getCanonicalShapeOptions().catch(() => [])

  const opsRows: OpsRow[] = rows.map((r, i) => ({
    id: r.id,
    status: r.status,
    decorationMethod: r.decorationMethod,
    originalFileFormat: r.originalFileFormat,
    widthMm: num(r.widthMm),
    heightMm: num(r.heightMm),
    parseScore: num(r.parseAccuracyScore),
    partnerConfirmedAt: r.partnerConfirmedAt ? r.partnerConfirmedAt.toISOString() : null,
    adminVerifiedAt: r.adminVerifiedAt ? r.adminVerifiedAt.toISOString() : null,
    uploadedAt: r.uploadedAt.toISOString(),
    isNormalized: r.normalizedSvgKey != null,
    thumbnailUrl: thumbs[i] ?? null,
    packagingTypeId: r.packagingTypeId,
    packagingTypeName: r.packagingType.displayName,
    partnerName: r.partnerService.partner.companyName,
    offeringCount: r._count.offerings,
    canonicalShapeName: shapeByDieline.get(r.id) ?? null,
    clusterKey:
      num(r.widthMm) && num(r.heightMm) ? aspectBucketFor(num(r.widthMm) as number, num(r.heightMm) as number) : null,
  }))

  return <DielineOpsWorkspace rows={opsRows} shapeOptions={shapeOptions} />
}
