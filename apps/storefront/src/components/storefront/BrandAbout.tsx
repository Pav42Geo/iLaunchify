import type { BrandWithCreator } from '@/lib/brand'

export function BrandAbout({ brand }: { brand: BrandWithCreator }) {
  if (!brand.aboutText) return null
  return (
    <section className="mb-12 mx-auto max-w-2xl text-center">
      <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wider text-brand-secondary">
        About
      </h2>
      <p className="text-brand-text">{brand.aboutText}</p>
    </section>
  )
}
