import 'server-only'
import { prisma } from '@ilaunchify/db'

/**
 * Per-packaging hero-image resolver for the marketplace PDP.
 *
 * Given a published ProductTemplate slug, resolves ONE image URL per linked
 * PackagingSystem so the PDP gallery can swap its hero to the selected package's
 * photo. NO schema change — every id read here already exists.
 *
 * Resolution priority per packaging system (first hit wins):
 *   1. PackagingSystem.overrideImageFileId   (admin override layer)
 *   2. its PackagingType's first ACTIVE MockupTemplate.baseImageAssetId
 *      (orderBy displayOrder) — the 2D photo-mockup base, docs/MOCKUP_STRATEGY.md
 *   3. PackagingSystem.partnerImageFileId     (partner-supplied fallback)
 *   4. none → the system is simply absent from the returned map
 *
 * Every fileId / assetId above is a soft FK to Asset.id; the URL comes from
 * Asset.publicUrl (resolved in ONE batched lookup).
 *
 * The whole thing is cast-guarded (mirrors getProductPassport) so it can never
 * throw: a fixture-only / demo template, a stale Prisma client, or a missing
 * relation all degrade to an empty Map — the gallery then behaves exactly as it
 * does today. The Map is keyed by PackagingSystem.id; the page attaches a URL to
 * a packaging option only when that option's id equals a PackagingSystem id, so
 * fixture-only packaging options (their ids never match) are an automatic no-op.
 */
export async function getPackagingImageMap(
  slug: string,
): Promise<Map<string, string>> {
  const empty = new Map<string, string>()
  try {
    // 1) The template's linked packaging systems + (override/partner) image ids
    //    + the system's PackagingType so we can fall back to its mockup base.
    const rows = await (
      prisma as unknown as {
        productTemplatePackaging: {
          findMany: (a: unknown) => Promise<
            Array<{
              packagingSystemId: string
              packagingSystem: {
                overrideImageFileId: string | null
                partnerImageFileId: string | null
                packagingTypeId: string | null
              }
            }>
          >
        }
      }
    ).productTemplatePackaging
      .findMany({
        where: { productTemplate: { slug } },
        select: {
          packagingSystemId: true,
          packagingSystem: {
            select: {
              overrideImageFileId: true,
              partnerImageFileId: true,
              packagingTypeId: true,
            },
          },
        },
      })
      .catch(() => [] as never[])

    if (!rows.length) return empty

    // 2) For systems with no override image, look up the FIRST ACTIVE mockup
    //    template per PackagingType (orderBy displayOrder) for its base asset.
    const typeIdsNeedingMockup = [
      ...new Set(
        rows
          .filter((r) => !r.packagingSystem.overrideImageFileId && r.packagingSystem.packagingTypeId)
          .map((r) => r.packagingSystem.packagingTypeId as string),
      ),
    ]
    const mockupAssetByType = new Map<string, string>()
    if (typeIdsNeedingMockup.length) {
      const mockups = await (
        prisma as unknown as {
          mockupTemplate?: {
            findMany: (a: unknown) => Promise<
              Array<{ packagingTypeId: string; baseImageAssetId: string; displayOrder: number }>
            >
          }
        }
      ).mockupTemplate
        ?.findMany({
          where: { packagingTypeId: { in: typeIdsNeedingMockup }, status: 'ACTIVE' },
          select: { packagingTypeId: true, baseImageAssetId: true, displayOrder: true },
          orderBy: { displayOrder: 'asc' },
        })
        .catch(() => [] as never[])
      for (const m of mockups ?? []) {
        // First (lowest displayOrder) wins — keep the earliest seen per type.
        if (!mockupAssetByType.has(m.packagingTypeId)) {
          mockupAssetByType.set(m.packagingTypeId, m.baseImageAssetId)
        }
      }
    }

    // 3) Decide the winning asset id per packaging system (priority chain).
    const assetIdBySystem = new Map<string, string>()
    for (const r of rows) {
      const sys = r.packagingSystem
      const assetId =
        sys.overrideImageFileId ??
        (sys.packagingTypeId ? mockupAssetByType.get(sys.packagingTypeId) ?? null : null) ??
        sys.partnerImageFileId ??
        null
      if (assetId) assetIdBySystem.set(r.packagingSystemId, assetId)
    }
    if (assetIdBySystem.size === 0) return empty

    // 4) Batch-resolve every winning asset id → publicUrl in one query.
    const assetIds = [...new Set(assetIdBySystem.values())]
    const assets = await prisma.asset
      .findMany({
        where: { id: { in: assetIds }, publicUrl: { not: null } },
        select: { id: true, publicUrl: true },
      })
      .catch(() => [] as Array<{ id: string; publicUrl: string | null }>)
    const urlByAssetId = new Map<string, string>()
    for (const a of assets) {
      if (a.publicUrl) urlByAssetId.set(a.id, a.publicUrl)
    }

    // 5) PackagingSystem.id → resolved URL.
    const out = new Map<string, string>()
    for (const [systemId, assetId] of assetIdBySystem) {
      const url = urlByAssetId.get(assetId)
      if (url) out.set(systemId, url)
    }
    return out
  } catch {
    return empty
  }
}
