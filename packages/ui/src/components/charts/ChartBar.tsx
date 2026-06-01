'use client'

// @ilaunchify/ui — ChartBar (recharts wrapper).
//
// BarChart with platform tokens. Supports single + multi-series, optional
// stacking, and a horizontal layout for partner-style "top X" rankings.
//
// Like ChartArea, this expects to live inside a <ChartWidget> (no chrome).

import * as React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartPalette, chartToneOrder, type ChartTone } from './chartPalette'

export interface ChartBarPoint {
  x: string | number
  y: number
}

export interface ChartBarSeries {
  name: string
  data: ChartBarPoint[]
  tone?: ChartTone
}

export interface ChartBarProps {
  series: ChartBarSeries[]
  /** Height in pixels. Default 240. */
  height?: number
  /** Stack multiple series into one bar per x. Default false. */
  stacked?: boolean
  /** Horizontal layout (Y-axis is the category). Default false. */
  horizontal?: boolean
  hideGrid?: boolean
  hideXAxis?: boolean
  hideYAxis?: boolean
}

interface MergedRow {
  x: string | number
  [seriesKey: string]: string | number
}

export function ChartBar({
  series,
  height = 240,
  stacked = false,
  horizontal = false,
  hideGrid = false,
  hideXAxis = false,
  hideYAxis = false,
}: ChartBarProps) {
  const merged = mergeSeries(series)

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={merged}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          {!hideGrid && (
            <CartesianGrid
              stroke="#EEEFF1"
              strokeDasharray="3 3"
              vertical={horizontal}
              horizontal={!horizontal}
            />
          )}
          {horizontal ? (
            <>
              {!hideXAxis && (
                <XAxis
                  type="number"
                  tick={{ fill: '#9A9CA6', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E0E1E5' }}
                />
              )}
              {!hideYAxis && (
                <YAxis
                  type="category"
                  dataKey="x"
                  tick={{ fill: '#6B6D78', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={88}
                />
              )}
            </>
          ) : (
            <>
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
            </>
          )}
          <Tooltip
            cursor={{ fill: 'rgba(24,24,26,0.04)' }}
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
              <Bar
                key={s.name}
                dataKey={s.name}
                fill={colors.fill}
                stackId={stacked ? 'stack-0' : undefined}
                radius={[4, 4, 0, 0]}
              />
            )
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function mergeSeries(series: ChartBarSeries[]): MergedRow[] {
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
