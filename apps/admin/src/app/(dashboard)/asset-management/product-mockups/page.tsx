// Admin — Product Mockups (docs/MOCKUP_STRATEGY.md, Slice 1). Admin curates the
// white-label photo-mockups a creator designs on. Owned by PackagingType, so a
// mockup added here lights up for every product on that container.
//
// MockupTemplate ships with a pending migration → cast-guarded read.

import { requireRole } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { MockupManager, type PackagingTypeGroup, type MockupRow } from './MockupManager'

export const dynamic = 'force-dynamic'

interface MockupRecord {
  id: string
  packagingTypeId: string
  label: string
  surfaceKey: string | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  baseImageAssetId: string
  printAreaQuad: unknown
}

export default async function ProductMockupsPage() {
  await requireRole('ADMIN')

  const packagingTypes = await prisma.packagingType.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, displayName: true },
    orderBy: { displayName: 'asc' },
  })

  // Cast-guarded mockup read (pending migration).
  const mockups = await (prisma as unknown as {
    mockupTemplate: { findMany: (a: unknown) => Promise<MockupRecord[]> }
  }).mockupTemplate
    .findMany({
      where: { packagingTypeId: { in: packagingTypes.map((p) => p.id) } },
      select: {
        id: true, packagingTypeId: true, label: true, surfaceKey: true,
        status: true, baseImageAssetId: true, printAreaQuad: true,
      },
      orderBy: { displayOrder: 'asc' },
    })
    .catch(() => [] as MockupRecord[])

  // Resolve base image URLs.
  const assetIds = [...new Set(mockups.map((m) => m.baseImageAssetId))]
  const assets = assetIds.length
    ? await prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, publicUrl: true } })
    : []
  const urlById = new Map(assets.map((a) => [a.id, a.publicUrl]))

  const byType = new Map<string, MockupRow[]>()
  for (const m of mockups) {
    const list = byType.get(m.packagingTypeId) ?? []
    list.push({
      id: m.id,
      label: m.label,
      surfaceKey: m.surfaceKey,
      status: m.status,
      imageUrl: urlById.get(m.baseImageAssetId) ?? null,
      printAreaQuad: m.printAreaQuad,
    })
    byType.set(m.packagingTypeId, list)
  }

  const groups: PackagingTypeGroup[] = packagingTypes.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    mockups: byType.get(p.id) ?? [],
  }))

  const totalMockups = mockups.length
  const withMockups = groups.filter((g) => g.mockups.length > 0).length

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-cream px-7 py-6">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.02em] text-ink-900">Packaging mockups (2D &amp; 3D)</h1>
        <p className="mt-1 max-w-[64ch] text-[13.5px] text-ink-600">
          White-label photo-mockups a creator designs on. Upload a clean product photo for a
          packaging type and drag the print area; it lights up for every product on that container.
          (2D photo-mask, manufacturer-supplied — 3D via Pacdora is a later phase.)
        </p>
        <div className="mt-3 flex gap-6 text-[12px] text-ink-500">
          <span><strong className="text-ink-900">{packagingTypes.length}</strong> packaging types</span>
          <span><strong className="text-ink-900">{withMockups}</strong> with mockups</span>
          <span><strong className="text-ink-900">{totalMockups}</strong> total mockups</span>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-[14px] text-ink-500">No active packaging types yet. Add packaging types first, then curate their mockups here.</p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => <MockupManager key={g.id} group={g} />)}
        </div>
      )}
    </div>
  )
}
