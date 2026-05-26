// shadcn/ui components copied here, themed by Brand CSS variables.
//
// Structure:
//   src/primitives/     — shadcn-style atoms (Button, Input, Dialog, ...)
//   src/canvas/         — Fabric.js wrappers + ComplianceRegion + DieCutFrame (ported in weeks 2-3)
//   src/nutrition/      — Nutrition Facts / Supplement Facts renderers (ported in weeks 4-5)
//   src/brand-theme.ts  — CSS variable contract + Tailwind plugin
//
// V1 ships skeleton exports below; components added as the build progresses.

export { cn } from './lib/utils'
export { brandThemeToCssVars } from './brand-theme'

// Primitives
export * from './primitives/button'
export * from './primitives/input'
export * from './primitives/label'
export * from './primitives/card'
export * from './primitives/select'
export * from './primitives/dialog'

// Nutrition rendering
export * from './nutrition/NutritionFactsRenderer'

// Canvas — Fabric.js wrappers + die-cut overlay (Phase C of DESIGN_STUDIO_REBUILD).
// Stage + DieCutFrame are 'use client' — host pages should dynamic-import them
// with `ssr: false` because Fabric.js requires `window`.
export * from './canvas/types'
export { Stage } from './canvas/Stage'
export { DieCutFrame, DieCutLegend } from './canvas/DieCutFrame'
