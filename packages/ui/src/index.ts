// @ilaunchify/ui — platform component library.
//
// Built around the OOUX object map (see docs/OOUX_OBJECT_MAP.md): every
// component renders a platform object at a specific size (list / card /
// detail). Visual tokens live in src/tokens/* and src/theme.css.
//
// Layout:
//   src/tokens/         — typed design tokens (colors, type, spacing, etc.)
//   src/theme.css       — CSS custom properties + data-surface theming
//   src/fonts.css       — self-hosted Inter + Bricolage + Fraunces
//   src/primitives/     — shadcn-style atoms (Button, Input, Badge, Chip, …)
//   src/components/     — object-view components (ProductCard, HeroBanner, …)
//   src/canvas/         — Fabric.js wrappers (Design Studio canvas)
//   src/nutrition/      — NutritionFactsRenderer (compliance service output)
//   src/brand-theme.ts  — per-creator-brand CSS variable contract
//                         (separate concern — drives label canvas, not chrome)
//
// Per-app imports:
//   import '@ilaunchify/ui/theme.css'    once in root layout
//   import '@ilaunchify/ui/fonts.css'    once in root layout
//   import { Button } from '@ilaunchify/ui'
//   import { pink, neon } from '@ilaunchify/ui/tokens'
//   import preset from '@ilaunchify/ui/tailwind.preset'  in tailwind.config.ts

export { cn } from './lib/utils'
export { brandThemeToCssVars } from './brand-theme'
export * from './fonts'

// Tokens — re-exported from the main entry for convenience.
// `import { pink, neon, productGradient } from '@ilaunchify/ui'` also works.
export * from './tokens'

// Primitives — shadcn/Radix-based atoms
export * from './primitives/button'
export * from './primitives/input'
export * from './primitives/label'
export * from './primitives/card'
export * from './primitives/select'
export * from './primitives/dialog'
export * from './primitives/badge'
export * from './primitives/chip'
export * from './primitives/tabs'

// Object-view components
export * from './components/StatusPill'
export * from './components/VerifyCheck'
export * from './components/HeartFavorite'
export * from './components/ProductCard'
export * from './components/HeroBanner'
export * from './components/CertChip'
export * from './components/CertStrip'
export * from './components/PricingTierModal'
export * from './components/pricing-tier-data'
export * from './components/PartnerTypeCard'
export * from './components/ProductSpecGrid'
export * from './components/FlavorSwatch'
export * from './components/PackagingPicker'
export * from './components/IngredientsList'
export * from './components/EarningsCalculator'
export * from './components/PropertyBar'
export * from './components/ShippingInfoCard'

// Nutrition rendering (compliance service consumer)
export * from './nutrition/NutritionFactsRenderer'

// Canvas — Fabric.js wrappers. 'use client' inside; host pages should
// dynamic-import them with `ssr: false` because Fabric requires `window`.
export * from './canvas/types'
export { Stage } from './canvas/Stage'
export { DieCutFrame, DieCutLegend } from './canvas/DieCutFrame'
export {
  addText,
  addTextCombo,
  addImageFromUrl,
  addLabelSection,
  getLabelSectionRole,
  setCanvasBackground,
  selectAllObjects,
  objectsFromSelection,
  CANVAS_PROPERTIES_TO_INCLUDE,
  LABEL_SECTION_LABELS,
  type CanvasCustomType,
  type LabelSectionRole,
} from './canvas/objects'
export {
  generateQrCodeDataUrl,
  generateBarcodeDataUrl,
  generateInternalSkuBarcodeDataUrl,
  addQrCode,
  addBarcode,
  addInternalSkuBarcode,
  regenerateCodeImage,
  BARCODE_FORMATS,
  type BarcodeFormat,
  type CodeCustomData,
} from './canvas/codes'
export {
  addNutritionFactsPanel,
  readNutritionPanelProps,
  updateNutritionPanel,
  SAMPLE_NUTRITION_DATA,
  type NutritionPanelStyle,
  type NutritionPanelData,
  type NutritionPanelProps,
  type NutritionRow,
  type NutritionPanelOpts,
} from './canvas/nutritionPanel'
export {
  validateGtin,
  prettyPrintGtin,
  GTIN_FORMAT_LABEL,
  type GtinFormat,
  type GtinValidation,
} from './canvas/gtin'
export {
  scanLabelCompliance,
  findObjectByRef,
  type LabelScanContext,
  type LabelScanResult,
  type ScanFinding,
  type ScanSeverity,
} from './canvas/compliance'
export {
  autoDetectLabelSections,
  findDetectedByRole,
  type AutoDetection,
  type AutoDetectContext,
} from './canvas/autoDetect'
export {
  formatNetQuantity,
  validateNetQuantityFormat,
  inferNetQuantityKind,
  extractCount,
  extractCountUnit,
  type NetQuantityKind,
  type FormatNetQuantityOpts,
  type NetQuantityProblem,
} from './canvas/netQuantity'
export {
  LABEL_SECTION_MIN_FONT_SIZE,
  LABEL_SECTION_CITATIONS,
  REQUIRED_LABEL_SECTIONS,
  NUTRITION_FACTS_MIN_TYPE_SIZE,
  NUTRITION_FACTS_BASE_TITLE_SIZE,
  NUTRITION_FACTS_MIN_SCALE,
  clampFontSize,
  clampNutritionFactsScale,
} from './canvas/labelRules'
export {
  duplicateObject,
  removeObject,
  bringForward,
  sendBackwards,
  bringToFront,
  sendToBack,
  toggleLock,
  isLocked,
} from './canvas/objectActions'
export {
  snapshotCanvasAsPng,
  snapshotCanvasTrimmed,
  type SnapshotOpts,
} from './canvas/snapshot'
export {
  generatePrintReadyPdf,
  suggestedPdfFilename,
  type GeneratePdfOpts,
} from './canvas/exportPdf'
export {
  generateBlankPdfSpec,
  generateBlankSvgSpec,
  mmToInchesStr,
} from './canvas/blankSpec'

