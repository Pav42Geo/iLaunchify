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

// Canvas — added Week 4-5 when Fabric.js integration begins
// export * from './canvas/Stage'
// export * from './canvas/ComplianceRegion'
