import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * TrendChart — a clean, dependency-free SVG area/line for 30/90-day trends.
 * Monochrome pink line + faint pink fill, normalized to the data range. Static
 * (server-component-safe). For dense KPI sparklines pass a small height.
 */
export function TrendChart({
  data,
  height = 64,
  className,
  ariaLabel = 'Trend',
}: {
  data: number[]
  height?: number
  className?: string
  ariaLabel?: string
}) {
  if (!data || data.length < 2) return null
  const w = 320
  const h = height
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const step = w / (data.length - 1)
  const y = (v: number) => (h - 3 - ((v - min) / range) * (h - 6)).toFixed(1)
  const line = data.map((v, i) => `${(i * step).toFixed(1)},${y(v)}`).join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      className={cn('w-full', className)}
      style={{ height }}
    >
      <polygon points={area} className="fill-pink-50" />
      <polyline points={line} fill="none" className="stroke-pink-500" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
