import 'server-only'
import { prisma } from '@ilaunchify/db'

/**
 * Marketplace product-detail cert badges.
 *
 * For a ProductTemplate slug, return the certifications the product has
 * actually earned — VERIFIED PartnerCertificateInstances of ACTIVE cert
 * types — rendered with each type's admin-curated PNG web badge.
 *
 * This is the "added by the vendor → approved by admin → live in the
 * marketplace" set, surfaced publicly as a trust signal. The PNG (not the
 * Design Studio's print SVG) is the web asset; we use its stored public URL
 * so the statically-rendered detail page can <img> it directly.
 *
 * Throws are swallowed → empty array so the page never breaks. Empty result
 * hides the strip.
 */

export interface ProductCertBadge {
  /** Cert type slug — stable de-dupe key + React key. */
  slug: string
  /** Display name, e.g. "USDA Organic". */
  name: string
  /** PNG badge public URL, or null when no PNG was uploaded for the type. */
  iconUrl: string | null
}

export async function getProductCertBadges(
  templateSlug: string,
): Promise<ProductCertBadge[]> {
  try {
    const row = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: {
        certificates: {
          where: { instance: { status: 'VERIFIED' } },
          select: {
            instance: {
              select: {
                certificateType: {
                  select: {
                    name: true,
                    slug: true,
                    status: true,
                    thumbnailFileId: true,
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!row) return []

    // Collect the unique cert-type ids that still need a badge URL. Multiple
    // partners may hold the same VERIFIED cert → de-dupe by type slug.
    const seen = new Set<string>()
    const types: Array<{ slug: string; name: string; thumbnailFileId: string | null }> = []
    for (const c of row.certificates) {
      const ct = c.instance.certificateType
      if (ct.status !== 'ACTIVE') continue
      if (seen.has(ct.slug)) continue
      seen.add(ct.slug)
      types.push({ slug: ct.slug, name: ct.name, thumbnailFileId: ct.thumbnailFileId })
    }
    if (types.length === 0) return []

    // Batch-resolve the PNG assets' public URLs.
    const assetIds = types
      .map((t) => t.thumbnailFileId)
      .filter((v): v is string => v !== null)
    const assets = assetIds.length
      ? await prisma.asset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, publicUrl: true },
        })
      : []
    const urlByAssetId = new Map(assets.map((a) => [a.id, a.publicUrl]))

    return types.map((t) => ({
      slug: t.slug,
      name: t.name,
      iconUrl: t.thumbnailFileId ? (urlByAssetId.get(t.thumbnailFileId) ?? null) : null,
    }))
  } catch (err) {
    console.warn(
      '[product-cert-badges] getProductCertBadges failed:',
      (err as Error).message,
    )
    return []
  }
}
