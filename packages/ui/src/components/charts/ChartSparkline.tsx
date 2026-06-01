'use client'

// @ilaunchify/ui — ChartSparkline.
//
// Lightweight pure-SVG sparkline (no recharts) — used inline in KpiWidget
// because keeping it primitive avoids hydrating recharts inside every KPI
// tile. Defaults to 64×24 (matches Pavel's KPI tile rhythm).
//
// No axes / ticks / tooltip — sparklines are a glance affordance, never an
// analytical surface.

import * as React from 'react'
import { chartPalette, type ChartTone } from './chartPalette'

export interface ChartSparklineProps {
  /** Series — numeric y-values, evenly spaced on x. Min 2 points; <2 = no-op. */
  points: number[]
  /** Tone — drives stroke + area fill. */
  tone?: ChartTone
  /** Width in pixels (svg viewBox width). Default 64. */
  width?: number
  /** Height in pixels. Default 24. */
  height?: number
  /** Show the translucent area fill. Default true. */
  fill?: boolean
  /** Accessible label. */
  ariaLabel?: string
  className?: string
}

export function ChartSparkline({
  points,
  tone = 'ink',
  width = 64,
  height = 24,
  fill = true,
  ariaLabel,
  className,
}: ChartSparklineProps) {
  if (points.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className={className}
      />
    )
  }

  const colors = chartPalette[tone]
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const pad = 1.5 // 1.5px stroke padding so we don't clip
  const w = width - pad * 2
  const h = height - pad * 2
  const step = w / (points.length - 1)

  const yFor = (v: number) => pad + h - ((v - min) / range) * h
  const xFor = (i: number) => pad + i * step

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(p).toFixed(2)}`)
    .join(' ')

  const lastIndex = points.length - 1
  const lastIndexSafe = lastIndex >= 0 ? lastIndex : 0
  const areaPath =
    linePath +
    ` L ${xFor(lastIndexSafe).toFixed(2)} ${(height - pad).toFixed(2)}` +
    ` L ${xFor(0).toFixed(2)} ${(height - pad).toFixed(2)} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={className}
      preserveAspectRatio="none"
    >
      {fill && <path d={areaPath} fill={colors.area} />}
      <path
        d={linePath}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
