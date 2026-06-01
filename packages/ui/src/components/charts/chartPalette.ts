// @ilaunchify/ui — chart color palette.
//
// Maps the platform's semantic tones to a stable triplet (stroke / fill /
// hover) for all chart primitives (Area, Bar, Donut, Line, Sparkline).
// Locked design system (docs/DESIGN_SYSTEM.md):
//   - Pink #FF2E63 is the brand color; pink-700 #C71350 is the readable
//     accent on light surfaces.
//   - Neon #B5FF3D is dark-surface ONLY; on light it falls back to lime-700.
//   - Semantic tones map to Tailwind defaults (emerald / amber / sky / rose).
//
// Charts ALWAYS render inside a `<Widget>` body (white) — values here are
// the "on light" palette. If we ever ship dark-surface charts we'll add a
// matching dark palette behind a `surface` prop.
//
// Used by ChartArea, ChartBar, ChartDonut, ChartLine, ChartSparkline.

export type ChartTone =
  | 'pink'
  | 'ink'
  | 'success'
  | 'warning'
  | 'info'
  | 'danger'
  | 'neon'

interface ChartToneColors {
  /** Stroke color — line, donut segment border, bar outline. AA-readable on white. */
  stroke: string
  /** Solid fill — bars, donut segments. */
  fill: string
  /** Translucent area fill (AreaChart, sparkline area). RGBA with low alpha. */
  area: string
  /** Hover/active stroke — slightly darker / more saturated. */
  hover: string
}

export const chartPalette: Record<ChartTone, ChartToneColors> = {
  pink: {
    stroke: '#C71350',
    fill: '#FF2E63',
    area: 'rgba(255, 46, 99, 0.14)',
    hover: '#9E0E40',
  },
  ink: {
    stroke: '#18181A',
    fill: '#33343C',
    area: 'rgba(24, 24, 26, 0.10)',
    hover: '#000000',
  },
  success: {
    // Tailwind emerald-700 / 500 / 50.
    stroke: '#047857',
    fill: '#10B981',
    area: 'rgba(16, 185, 129, 0.16)',
    hover: '#065F46',
  },
  warning: {
    // Tailwind amber-700 / 500 / 50.
    stroke: '#B45309',
    fill: '#F59E0B',
    area: 'rgba(245, 158, 11, 0.16)',
    hover: '#92400E',
  },
  info: {
    // Tailwind sky-700 / 500 / 50.
    stroke: '#0369A1',
    fill: '#0EA5E9',
    area: 'rgba(14, 165, 233, 0.16)',
    hover: '#075985',
  },
  danger: {
    // Tailwind rose-700 / 500 / 50.
    stroke: '#BE123C',
    fill: '#F43F5E',
    area: 'rgba(244, 63, 94, 0.14)',
    hover: '#9F1239',
  },
  neon: {
    // Neon green fails contrast on white text — on light surfaces we degrade
    // to Tailwind lime-700 for stroke, but keep neon-500 as the visual fill
    // (still pops against a white widget body).
    stroke: '#4D7C0F',
    fill: '#B5FF3D',
    area: 'rgba(181, 255, 61, 0.22)',
    hover: '#3F6212',
  },
}

/** Default rotation order when a multi-series chart needs N distinct tones. */
export const chartToneOrder: ChartTone[] = [
  'pink',
  'ink',
  'success',
  'info',
  'warning',
  'danger',
  'neon',
]
