import Link from 'next/link'
import { formatCents } from '@/lib/cart'

interface ProductCardProps {
  brandHandle: string
  product: {
    slug: string
    name: string
    description: string | null
    priceCents: number
    category: string
    featured: boolean
    inventoryAvailable: number | null
  }
}

export function ProductCard({ brandHandle, product }: ProductCardProps) {
  const isOutOfStock = product.inventoryAvailable !== null && product.inventoryAvailable === 0
  return (
    <Link
      href={`/${brandHandle}/${product.slug}`}
      className="group block rounded-brand border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md"
    >
      {product.featured && (
        <span className="mb-2 inline-block rounded-full bg-brand-accent/20 px-2 py-0.5 text-xs font-medium text-brand-text">
          Featured
        </span>
      )}
      <h3 className="font-display text-base font-semibold group-hover:underline">
        {product.name}
      </h3>
      {product.description && (
        <p className="mt-1 line-clamp-2 text-sm text-brand-secondary">{product.description}</p>
      )}
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-lg font-semibold">{formatCents(product.priceCents)}</span>
        {isOutOfStock ? (
          <span className="text-xs text-red-600">Sold out</span>
        ) : (
          <span className="text-xs text-brand-secondary">{product.category.replace('_', ' ').toLowerCase()}</span>
        )}
      </div>
    </Link>
  )
}
