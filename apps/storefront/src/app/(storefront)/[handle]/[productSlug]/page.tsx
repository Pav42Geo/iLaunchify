import { prisma } from '@ilaunchify/db'
import { notFound } from 'next/navigation'
import { NutritionFactsRenderer } from '@ilaunchify/ui'
import { getBrandOrNotFound } from '@/lib/brand'
import { formatCents } from '@/lib/cart'
import { BuyButton } from '@/components/storefront/BuyButton'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { PanelData } from '@ilaunchify/types'

// Product detail pages revalidate slightly more often than brand pages
// because price/inventory changes happen here.
export const revalidate = 30

interface PageProps {
  params: Promise<{ handle: string; productSlug: string }>
}

async function loadProduct(handle: string, slug: string) {
  const brand = await getBrandOrNotFound(handle)
  const product = await prisma.product.findFirst({
    where: { brandId: brand.id, slug, status: 'PUBLISHED' },
    include: {
      recipe: {
        include: {
          complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  })
  if (!product) notFound()
  return { brand, product }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brand, product } = await loadProduct((await params).handle, (await params).productSlug)
  return {
    title: `${product.name} — ${brand.name}`,
    description: product.description ?? `${product.name} by ${brand.name}`,
    openGraph: {
      title: product.name,
      description: product.description ?? `${product.name} by ${brand.name}`,
      type: 'website',
      url: `/${brand.handle}/${product.slug}`,
    },
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { brand, product } = await loadProduct((await params).handle, (await params).productSlug)
  const lastCheck = product.recipe?.complianceChecks[0]
  const panelData = lastCheck?.panelData as PanelData | null | undefined

  const isOutOfStock = product.inventoryAvailable !== null && product.inventoryAvailable === 0

  // JSON-LD structured data for SEO (Product + Brand)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    sku: product.id,
    brand: { '@type': 'Brand', name: brand.name },
    offers: {
      '@type': 'Offer',
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: isOutOfStock
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-4 text-sm text-brand-secondary">
        <Link href={`/${brand.handle}`} className="hover:underline">
          ← Back to {brand.name}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,360px]">
        {/* Left — product info */}
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{product.name}</h1>
          <p className="mt-2 text-2xl font-semibold">{formatCents(product.priceCents)}</p>

          {product.description && (
            <p className="mt-6 text-brand-text">{product.description}</p>
          )}

          <div className="mt-8">
            <BuyButton
              brandId={brand.id}
              brandHandle={brand.handle}
              productId={product.id}
              isOutOfStock={isOutOfStock}
              maxQuantity={product.inventoryAvailable}
            />
          </div>

          {panelData && (
            <div className="mt-12">
              <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-brand-secondary">
                Nutrition
              </h2>
              <NutritionFactsRenderer data={panelData} widthPx={280} />
            </div>
          )}
        </div>

        {/* Right — sticky summary */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-brand border border-zinc-200 bg-brand-muted p-4 text-sm">
            <h3 className="mb-2 font-semibold">What you get</h3>
            <ul className="space-y-1 text-brand-secondary">
              <li>· FDA-compliant {product.category === 'SUPPLEMENT' ? 'supplement' : 'food'} formulation</li>
              <li>· Manufactured + shipped by vetted US partners</li>
              <li>· Ships within 7–14 business days</li>
              <li>· 30-day return window from delivery</li>
            </ul>
          </div>

          {lastCheck && (
            <div className="rounded-brand border border-green-200 bg-green-50 p-4 text-xs text-green-900">
              ✓ Compliance verified against rule pack <code>{lastCheck.rulePackVersionId.slice(-8)}</code>
              {' '}on {new Date(lastCheck.createdAt).toLocaleDateString()}
            </div>
          )}
        </aside>
      </div>
    </>
  )
}
