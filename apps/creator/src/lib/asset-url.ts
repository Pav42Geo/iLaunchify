// Resolve a displayable read URL for a platform Asset: the stored public URL if set,
// else a short-lived signed read URL from the storage key. Uploaded brand logos never
// get a publicUrl, so without this they render blank everywhere. Server-only.

import { getSignedReadUrl } from '@ilaunchify/storage'

const READ_URL_TTL_SECONDS = 8 * 60 * 60

export async function resolveAssetReadUrl(a: {
  publicUrl: string | null
  storageKey: string | null
}): Promise<string | null> {
  if (a.publicUrl) return a.publicUrl
  if (!a.storageKey) return null
  try {
    return await getSignedReadUrl(a.storageKey, { expiresInSeconds: READ_URL_TTL_SECONDS })
  } catch {
    return null
  }
}
