'use client'

import * as React from 'react'
import { ProductCard, type ProductCardProps } from '@ilaunchify/ui'

/**
 * InfiniteProductGrid — progressive "load more on scroll" for marketplace
 * product lists. Renders the first `pageSize` cards, then reveals the next
 * batch as a bottom sentinel nears the viewport (IntersectionObserver with a
 * generous rootMargin so cards are ready before the user reaches the end).
 *
 * Why client-side slicing (not server pagination): the filtered template set is
 * already resolved server-side; we just avoid rendering the whole DOM up front
 * and stream it in on scroll. Resets to the first page whenever `items` change
 * (e.g. a filter is applied). Falls back to a "Load more" button if the user
 * prefers reduced motion / the observer never fires.
 */
export function InfiniteProductGrid({
  items,
  pageSize = 8,
  gridClassName = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5',
}: {
  items: ProductCardProps[]
  pageSize?: number
  gridClassName?: string
}) {
  const [count, setCount] = React.useState(() => Math.min(pageSize, items.length))
  const sentinelRef = React.useRef<HTMLDivElement | null>(null)

  // Reset to the first page when the result set changes (filter / sort / niche).
  React.useEffect(() => {
    setCount(Math.min(pageSize, items.length))
  }, [items, pageSize])

  const hasMore = count < items.length

  React.useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(c + pageSize, items.length))
        }
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, items.length, pageSize])

  return (
    <>
      <div className={gridClassName}>
        {items.slice(0, count).map((p) => (
          <ProductCard key={p.href} {...p} />
        ))}
      </div>

      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center py-9"
          aria-live="polite"
        >
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(c + pageSize, items.length))}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-500 hover:text-ink-700"
          >
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-pink-500"
              aria-hidden="true"
            />
            Loading more templates…
          </button>
        </div>
      )}
    </>
  )
}
