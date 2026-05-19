import { ProductCard } from './ProductCard'

interface ProductGridProps {
  brandHandle: string
  products: Array<{
    id: string
    slug: string
    name: string
    description: string | null
    priceCents: number
    category: string
    featured: boolean
    inventoryAvailable: number | null
  }>
}

export function ProductGrid({ brandHandle, products }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <section className="rounded-brand border-2 border-dashed border-zinc-300 p-12 text-center text-sm text-brand-secondary">
        No products yet. Check back soon.
      </section>
    )
  }
  return (
    <section>
      <h2 className="mb-4 font-display text-xs font-semibold uppercase tracking-wider text-brand-secondary">
        Products
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <ProductCard key={p.id} brandHandle={brandHandle} product={p} />
        ))}
      </div>
    </section>
  )
}
