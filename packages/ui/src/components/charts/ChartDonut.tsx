'use client'

// @ilaunchify/ui — ChartDonut (recharts wrapper).
//
// PieChart with an inner radius — the canonical "by category" surface
// (Panze admin ticket donut, orders-by-status donut, dispatches-by-status).
// Renders a centered label slot for the total when `centerLabel` is set.

import * as React from 'react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { chartPalette, chartToneOrder, type ChartTone } from './chartPalette'

export interface ChartDonutSegment {
  name: string
  value: number
  tone?: ChartTone
}

export interface ChartDonutProps {
  segments: ChartDonutSegment[]
  /** Height in pixels (donut takes full square). Default 220. */
  height?: number
  /** Inner radius ratio (0-1). Default 0.62 (thin ring). */
  innerRatio?: number
  /** Centered label rendered inside the donut hole. */
  centerLabel?: React.ReactNode
}

export function ChartDonut({
  segments,
  height = 220,
  innerRatio = 0.62,
  centerLabel,
}: ChartDonutProps) {
  return (
    <div className="relative" style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            contentStyle={{
              background: 'white',
              border: '1px solid #E0E1E5',
              borderRadius: 8,
              fontSize: 12,
              padding: '6px 8px',
            }}
          />
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            innerRadius={`${Math.round(innerRatio * 100)}%`}
            outerRadius="92%"
            strokeWidth={2}
            stroke="white"
            isAnimationActive={false}
          >
            {segments.map((seg, i) => {
              const tone = seg.tone ?? chartToneOrder[i % chartToneOrder.length]!
              return (
                <Cell key={seg.name} fill={chartPalette[tone].fill} />
              )
            })}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {centerLabel && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
          {centerLabel}
        </div>
      )}
    </div>
  )
}
