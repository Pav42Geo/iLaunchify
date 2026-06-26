'use client'

import * as React from 'react'

/**
 * Parallax — drifts its children vertically as the user scrolls past, on a
 * requestAnimationFrame-throttled passive scroll listener (GPU translate only).
 * Respects `prefers-reduced-motion` (no movement). Subtle by default.
 *
 * `speed` is the fraction of the element's distance-from-viewport-center applied
 * as counter-translate. ~0.1–0.2 reads as a gentle float; negative inverts.
 */
export function Parallax({
  children,
  speed = 0.12,
  className,
}: {
  children: React.ReactNode
  speed?: number
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    let raf = 0
    const update = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const elementCenter = rect.top + rect.height / 2
      const offset = (elementCenter - window.innerHeight / 2) * -speed
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [speed])

  return (
    <div ref={ref} className={className} style={{ willChange: 'transform' }}>
      {children}
    </div>
  )
}
