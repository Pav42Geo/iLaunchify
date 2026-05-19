import type { BrandWithCreator } from '@/lib/brand'

export function Hero({ brand }: { brand: BrandWithCreator }) {
  return (
    <section className="mb-12 text-center">
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        {brand.name}
      </h1>
      {brand.tagline && (
        <p className="mt-3 text-lg text-brand-secondary">{brand.tagline}</p>
      )}
    </section>
  )
}
