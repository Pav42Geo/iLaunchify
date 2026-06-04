'use server'

// Track D / D4 — Iconify icon search for the Studio Graphics drawer.
//
// Proxies the free, key-less Iconify public API (https://api.iconify.design)
// server-side (avoids client CORS + keeps the surface uniform). Returns icon
// ids the drawer renders as previews + drops onto the canvas as vector SVGs.

import { requireUser } from '@ilaunchify/auth'

export interface IconHit {
  /** Full Iconify id, e.g. "mdi:leaf". */
  id: string
  prefix: string
  name: string
}

export async function searchIcons(query: string, limit = 36): Promise<IconHit[]> {
  await requireUser()
  const q = query.trim()
  if (!q) return []
  try {
    const res = await fetch(
      `https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${Math.min(limit, 60)}`,
      { next: { revalidate: 3600 } },
    )
    if (!res.ok) return []
    const data = (await res.json()) as { icons?: string[] }
    return (data.icons ?? [])
      .map((id) => {
        const [prefix, name] = id.split(':')
        return { id, prefix: prefix ?? '', name: name ?? '' }
      })
      .filter((h) => h.prefix && h.name)
  } catch {
    return []
  }
}
