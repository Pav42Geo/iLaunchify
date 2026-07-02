'use client'

import * as React from 'react'
import { ProductCard, type ProductCardProps } from '@ilaunchify/ui'

/**
 * ProductCarousel — horizontal "browse more" rail for related products
 * ("You might also like"). Shows ~5 cards at desktop width with scroll-snap and
 * left/right arrow controls; arrows hide at the ends and disappear entirely when
 * everything already fits (≤5 items → a plain grid instead). Pure client-side
 * scrolling, no extra fetch.
 */
export function ProductCarousel({ items }: { items: ProductCardProps[] }) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  const [atStart, setAtStart] = React.useState(true)
  const [atEnd, setAtEnd] = React.useState(false)

  const update = React.useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }, [])

  React.useEffect(() => {
    update()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update, items])

  // 5 or fewer all fit on a desktop row — render a plain grid (no rail/arrows).
  if (items.length <= 5) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {items.map((p) => (
          <ProductCard key={p.href} {...p} compact />
        ))}
      </div>
    )
  }

  const page = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {!atStart && (
        <button
          type="button"
          aria-label="Previous products"
          onClick={() => page(-1)}
          className="absolute -left-3 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-md transition hover:border-ink-300 hover:text-ink-900 md:grid"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}

      <div
        ref={scrollerRef}
        className="flex gap-3.5 overflow-x-auto scroll-smooth snap-x pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((p) => (
          <div
            key={p.href}
            className="snap-start shrink-0 basis-[80%] sm:basis-[46%] md:basis-[31%] lg:basis-[calc((100%-56px)/5)]"
          >
            <ProductCard {...p} compact />
          </div>
        ))}
      </div>

      {!atEnd && (
        <button
          type="button"
          aria-label="More products"
          onClick={() => page(1)}
          className="absolute -right-3 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-md transition hover:border-ink-300 hover:text-ink-900 md:grid"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      )}
    </div>
  )
}
