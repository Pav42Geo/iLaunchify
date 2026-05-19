import { prisma } from '@ilaunchify/db'
import { getBrandOrNotFound } from '@/lib/brand'
import { Hero } from '@/components/storefront/Hero'
import { BrandAbout } from '@/components/storefront/BrandAbout'
import { ProductGrid } from '@/components/storefront/ProductGrid'
import type { Metadata } from 'next'

// ISR: revalidate every 60 seconds at the edge. Creator publish/edit actions
// trigger revalidatePath() from the creator app so cache stays fresh.
export const revalidate = 60

export async function generateMetadata({
  params,
}: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const brand = await getBrandOrNotFound((await params).handle)
  return {
    title: brand.name,
    description: brand.tagline ?? brand.positioning ?? `Shop ${brand.name}`,
    openGraph: {
      title: brand.name,
      description: brand.tagline ?? brand.positioning ?? `Shop ${brand.name}`,
      type: 'website',
      url: `/${brand.handle}`,
    },
  }
}

export default async function BrandHomePage({ params }: { params: Promise<{ handle: string }> }) {
  const brand = await getBrandOrNotFound((await params).handle)

  const products = await prisma.product.findMany({
    where: { brandId: brand.id, status: 'PUBLISHED' },
    orderBy: [{ featured: 'desc' }, { displayOrder: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      priceCents: true,
      category: true,
      featured: true,
      inventoryAvailable: true,
    },
  })

  return (
    <>
      <Hero brand={brand} />
      <BrandAbout brand={brand} />
      <ProductGrid brandHandle={brand.handle} products={products} />
    </>
  )
}
