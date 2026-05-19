import { getBrandOrNotFound, brandToCssVars } from '@/lib/brand'
import { getCurrentCart } from '@/lib/cart'
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader'
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter'
import { Toaster } from 'sonner'

export default async function BrandStorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ handle: string }>
}) {
  const brand = await getBrandOrNotFound((await params).handle)
  const cart = await getCurrentCart(brand.id)
  const itemCount = cart?.items.reduce((sum, it) => sum + it.quantity, 0) ?? 0

  return (
    <div style={brandToCssVars(brand)} className="min-h-screen bg-brand-background text-brand-text">
      <StorefrontHeader brand={brand} itemCount={itemCount} />
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-6">{children}</main>
      <StorefrontFooter brand={brand} />
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
