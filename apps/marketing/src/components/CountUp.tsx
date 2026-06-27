'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Counts up from 0 → the numeric value the first time it scrolls into view.
 * Non-numeric values (e.g. "FDA") render statically. Honors reduced-motion.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const isNum = /^\d+$/.test(value.trim())
  const target = isNum ? parseInt(value, 10) : 0
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(isNum ? '0' : value)

  useEffect(() => {
    if (!isNum) return
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(String(target))
      return
    }
    let raf = 0
    let started = false
    const run = () => {
      const dur = 1100
      const t0 = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        setDisplay(String(Math.round(eased * target)))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started) {
            started = true
            run()
            io.disconnect()
          }
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [isNum, target])

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  )
}
