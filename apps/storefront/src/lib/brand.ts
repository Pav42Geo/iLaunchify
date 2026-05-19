// Brand-resolution helper. Centralized so handle reservations and `isActive`
// checks happen in one place.
//
// `unstable_cache` wraps the DB query for ISR — each brand's data is cached
// at the edge for `revalidate` seconds. Creator changes trigger
// revalidatePath() from the creator app so the cache stays fresh.

import { prisma } from '@ilaunchify/db'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'

export type BrandWithCreator = NonNullable<Awaited<ReturnType<typeof loadBrandUncached>>>

async function loadBrandUncached(handle: string) {
  return prisma.brand.findUnique({
    where: { handle },
    include: { creatorProfile: { include: { user: { select: { email: true } } } } },
  })
}

export const getBrand = unstable_cache(
  async (handle: string) => loadBrandUncached(handle),
  ['brand-by-handle'],
  { revalidate: 60, tags: ['brand'] },
)

export async function getBrandOrNotFound(handle: string): Promise<BrandWithCreator> {
  const brand = await getBrand(handle)
  if (!brand || !brand.isActive) notFound()
  return brand
}

/**
 * Inline style object suitable for `<body style={...}>` or `<div style={...}>`.
 * Reads from the Brand row and falls back to platform defaults.
 */
export function brandToCssVars(brand: BrandWithCreator): React.CSSProperties {
  return {
    '--brand-color-primary': brand.colorPrimary ?? '#111827',
    '--brand-color-secondary': brand.colorSecondary ?? '#6b7280',
    '--brand-color-accent': brand.colorAccent ?? '#f59e0b',
    '--brand-color-text': brand.colorPrimary ?? '#111827',
    '--brand-color-background': '#ffffff',
    '--brand-color-muted': '#f4f4f5',
    '--brand-font-display': brand.fontDisplay
      ? `'${brand.fontDisplay}', system-ui, sans-serif`
      : "'Inter', system-ui, sans-serif",
    '--brand-font-body': brand.fontBody
      ? `'${brand.fontBody}', system-ui, sans-serif`
      : "'Inter', system-ui, sans-serif",
  } as React.CSSProperties
}
