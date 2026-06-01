import 'server-only'
import { prisma } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'

/**
 * Resolve admin-curated badge Asset ids → displayable URLs.
 *
 * Public URL is preferred (stable, cacheable); a short-lived signed URL is the
 * fallback for assets without one. Used to render the PNG web badge anywhere
 * certs surface in the admin (cert-type editor, partner cert review).
 *
 * Pass any mix of nullable ids — null/undefined/duplicates are handled. Returns
 * a Map keyed by Asset id (only entries that resolved are present).
 */
export async function resolveCertBadgeUrls(
  assetIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [...new Set(assetIds.filter((v): v is string => Boolean(v)))]
  if (ids.length === 0) return new Map()

  const assets = await prisma.asset.findMany({
    where: { id: { in: ids } },
    select: { id: true, storageKey: true, publicUrl: true },
  })

  const out = new Map<string, string>()
  for (const a of assets) {
    const url = a.publicUrl ?? (a.storageKey ? await getSignedReadUrl(a.storageKey) : null)
    if (url) out.set(a.id, url)
  }
  return out
}
