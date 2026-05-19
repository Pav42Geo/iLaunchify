// Per-brand sitemap — Google indexes each brand's storefront independently.
// Cached aggressively since published-product changes are the main trigger.

import { NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { getBrand } from '@/lib/brand'

export const revalidate = 3600   // 1 hour

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const brand = await getBrand((await params).handle)
  if (!brand || !brand.isActive) {
    return new NextResponse('Not found', { status: 404 })
  }

  const products = await prisma.product.findMany({
    where: { brandId: brand.id, status: 'PUBLISHED' },
    select: { slug: true, updatedAt: true },
  })

  const policies = ['privacy', 'terms', 'shipping', 'returns']

  const entries: Array<{ loc: string; lastmod?: string; priority: string }> = [
    { loc: `${BASE}/${brand.handle}`, lastmod: brand.updatedAt.toISOString(), priority: '1.0' },
    ...products.map((p) => ({
      loc: `${BASE}/${brand.handle}/${p.slug}`,
      lastmod: p.updatedAt.toISOString(),
      priority: '0.8',
    })),
    ...policies.map((slug) => ({
      loc: `${BASE}/${brand.handle}/policies/${slug}`,
      priority: '0.3',
    })),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${e.loc}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}
    <priority>${e.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=3600',
    },
  })
}
