'use client'

import * as React from 'react'

/**
 * Reveal — scroll-triggered entrance animation.
 *
 * Native IntersectionObserver (no animation library), animating only GPU
 * properties (opacity + translate) so it stays on the compositor thread —
 * the 2026 best-practice for scroll reveals. Respects `prefers-reduced-motion`
 * (content shows immediately, no transition). One-shot: once revealed it stays.
 *
 * Usage:
 *   <Reveal>            …section…            </Reveal>
 *   <Reveal delay={120} direction="up">    …card…   </Reveal>
 *
 * For a staggered group, give siblings increasing `delay` (e.g. i * 90).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  direction = 'up',
  once = true,
}: {
  children: React.ReactNode
  className?: string
  /** Stagger delay in ms. */
  delay?: number
  /** Entrance direction of the slide. */
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
  /** Reveal only once (default) or re-trigger on every entry. */
  once?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [shown, setShown] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setShown(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            if (once) io.disconnect()
          } else if (!once) {
            setShown(false)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )

    io.observe(el)
    return () => io.disconnect()
  }, [once])

  const hidden =
    direction === 'up'
      ? 'translate-y-8'
      : direction === 'down'
        ? '-translate-y-8'
        : direction === 'left'
          ? 'translate-x-8'
          : direction === 'right'
            ? '-translate-x-8'
            : ''

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
      className={
        'transition-[opacity,transform] duration-700 ease-out-quart will-change-transform ' +
        'motion-reduce:transition-none ' +
        (shown ? 'opacity-100 translate-x-0 translate-y-0' : `opacity-0 ${hidden}`) +
        (className ? ' ' + className : '')
      }
    >
      {children}
    </div>
  )
}
