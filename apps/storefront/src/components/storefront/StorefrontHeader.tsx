import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import type { BrandWithCreator } from '@/lib/brand'

export function StorefrontHeader({ brand, itemCount }: { brand: BrandWithCreator; itemCount: number }) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-brand-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href={`/${brand.handle}`} className="font-display text-lg font-bold tracking-tight">
          {brand.name}
        </Link>
        <Link
          href={`/${brand.handle}/cart`}
          className="relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-brand-muted"
        >
          <ShoppingBag className="h-4 w-4" />
          <span className="hidden sm:inline">Cart</span>
          {itemCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-primary text-[10px] font-semibold text-white">
              {itemCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
