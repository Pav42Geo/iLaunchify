'use client'

// @ilaunchify/ui — ChartLine (recharts wrapper).
//
// LineChart with platform tokens. The Pokecut "24h trend" pattern — plain
// monotone lines, no area fill, subtle tooltip.

import * as React from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartPalette, chartToneOrder, type ChartTone } from './chartPalette'

export interface ChartLinePoint {
  x: string | number
  y: number
}

export interface ChartLineSeries {
  name: string
  data: ChartLinePoint[]
  tone?: ChartTone
}

export interface ChartLineProps {
  series: ChartLineSeries[]
  height?: number
  hideGrid?: boolean
  hideXAxis?: boolean
  hideYAxis?: boolean
}

interface MergedRow {
  x: string | number
  [seriesKey: string]: string | number
}

export function ChartLine({
  series,
  height = 240,
  hideGrid = false,
  hideXAxis = false,
  hideYAxis = false,
}: ChartLineProps) {
  const merged = mergeSeries(series)

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={colors.stroke}
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 4, stroke: colors.stroke, strokeWidth: 1.5, fill: 'white' }}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function mergeSeries(series: ChartLineSeries[]): MergedRow[] {
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
