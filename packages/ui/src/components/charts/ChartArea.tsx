'use client'

// @ilaunchify/ui — ChartArea (recharts wrapper).
//
// Wraps recharts' AreaChart with platform tokens baked in. Designed to live
// inside a <ChartWidget> so the wrapper provides no chrome — the parent
// widget owns the cream header band, hairline border, and footer link.
//
// Multi-series friendly; pass an array of series and each gets a tone from
// the chartPalette rotation.

import * as React from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartPalette, chartToneOrder, type ChartTone } from './chartPalette'

export interface ChartAreaPoint {
  x: string | number
  y: number
}

export interface ChartAreaSeries {
  name: string
  data: ChartAreaPoint[]
  tone?: ChartTone
}

export interface ChartAreaProps {
  series: ChartAreaSeries[]
  /** Height in pixels. Default 240. */
  height?: number
  /** Hide the grid lines. Default false. */
  hideGrid?: boolean
  /** Hide the x-axis. Default false. */
  hideXAxis?: boolean
  /** Hide the y-axis. Default false. */
  hideYAxis?: boolean
}

interface MergedRow {
  x: string | number
  [seriesKey: string]: string | number
}

export function ChartArea({
  series,
  height = 240,
  hideGrid = false,
  hideXAxis = false,
  hideYAxis = false,
}: ChartAreaProps) {
  // Merge multi-series into a single rows array keyed by x — recharts wants
  // one row per x with one numeric column per series.
  const merged = mergeSeries(series)

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={merged} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          {!hideGrid && (
            <CartesianGrid stroke="#EEEFF1" strokeDasharray="3 3" vertical={false} />
          )}
          {!hideXAxis && (
            <XAxis
              dataKey="x"
              tick={{ fill: '#9A9CA6', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#E0E1E5' }}
            />
          )}
          {!hideYAxis && (
            <YAxis
              tick={{ fill: '#9A9CA6', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
          )}
          <Tooltip
            cursor={{ stroke: '#CBCCD3', strokeWidth: 1 }}
            contentStyle={{
              background: 'white',
              border: '1px solid #E0E1E5',
              borderRadius: 8,
              fontSize: 12,
              padding: '6px 8px',
            }}
          />
          {series.map((s, i) => {
            const tone = s.tone ?? chartToneOrder[i % chartToneOrder.length]!
            const colors = chartPalette[tone]
            return (
              <Area
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={colors.stroke}
                fill={colors.area}
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 4, stroke: colors.stroke, strokeWidth: 1.5, fill: 'white' }}
              />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function mergeSeries(series: ChartAreaSeries[]): MergedRow[] {
  const byX = new Map<string | number, MergedRow>()
  for (const s of series) {
    for (const point of s.data) {
      const existing = byX.get(point.x)
      if (existing) {
        existing[s.name] = point.y
      } else {
        byX.set(point.x, { x: point.x, [s.name]: point.y })
      }
    }
  }
  return Array.from(byX.values())
}
