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
export { formatCents, formatCentsOrDash } from './lib/money'
export * from './lib/certExpiry'
export * from './lib/pack-composition'
export * from './lib/lead'
export * from './lib/pack-model'
export * from './lib/template-match'
export * from './lib/reanchor'
export * from './lib/packaging-surfaces'
export * from './lib/surface-face'
export * from './lib/gltf-surface-binding'
export { brandThemeToCssVars } from './brand-theme'
export * from './fonts'

// Tokens — re-exported from the main entry for convenience.
// `import { pink, neon, productGradient } from '@ilaunchify/ui'` also works.
export * from './tokens'

// Primitives — shadcn/Radix-based atoms
export * from './primitives/button'
export * from './primitives/input'
export * from './primitives/textarea'
export * from './primitives/checkbox'
export * from './primitives/radio'
export * from './primitives/switch'
export * from './primitives/label'
export * from './primitives/card'
export * from './primitives/select'
export * from './primitives/dialog'
export * from './primitives/badge'
export * from './primitives/chip'
export * from './primitives/tabs'
export * from './primitives/row-actions-menu'

// Object-view components
export * from './components/FormField'
export * from './components/InfoTip'
export * from './components/GoogleAnalytics'
export * from './components/TurnstileWidget'
export * from './components/SectionLabel'
export * from './components/ElementRail'
export * from './color'
export * from './components/StatusPill'
export * from './components/Tooltip'
export * from './components/VerifyCheck'
export * from './components/HeartFavorite'
export * from './components/FavoritesContext'
export * from './components/ProductCard'
export * from './components/ProductObjectCard'
export * from './components/FavoriteRow'
export * from './components/FavoritesListView'
export * from './components/HeroBanner'
export * from './components/AppHeader'
export * from './components/Brand'
export * from './components/PackagingStudioShell'
// Co-creation Collaboration Room (presentational, mode prop — creator + partner render it)
export * from './components/CoCreationRoomShell'
export * from './components/CoCreationStepper'
// Rooms & Messages hub (2026-07-13) — three-pane shell, light rail variant
export * from './components/MessagesShell'
export * from './lib/co-creation'
export * from './lib/room-compliance'
export * from './lib/sample-shipment'
export * from './components/TrendChart'
export * from './components/MetricCard'
export * from './components/ActionQueue'
export * from './components/StatusFunnel'
export * from './components/first-run'
export * from './components/AppHeaderUserMenu'
export * from './components/NotificationBell'
// Public partner profile body (Front Face) — marketing route + partner preview
export * from './components/PartnerFrontFace'
export * from './components/NotificationFeed'
export * from './components/NotificationRowActions'
export * from './components/notification-categories'
export * from './components/IngredientSlotCard'
export * from './components/CertChip'
export * from './components/CertStrip'
export * from './components/CertExpiryBadge'
export * from './components/ProductPassportView'
export * from './components/RolePacketView'
export * from './components/OrderTimelineView'
export * from './components/NotificationPreferenceMatrix'
export * from './components/EmailTemplatePreviewCard'
export * from './components/RatingStars'
export * from './components/PricingTierModal'
export * from './components/pricing-tier-data'
export * from './components/TierUpgradeModal'
export * from './components/tier-upgrade-data'
export * from './components/PartnerTypeCard'
export * from './components/ProductSpecGrid'
export * from './components/ProductionManifestView'
export * from './components/ViewToggle'
export * from './components/FlavorSwatch'
export * from './components/VersionHistory'
export * from './components/PackBuilder'
export * from './components/VarietyPackBuilder'
export * from './components/PackagingPicker'
export * from './components/IngredientsList'
export * from './components/EarningsCalculator'
export * from './components/PerFlavorEarnings'
export * from './components/PropertyBar'
export * from './components/ShippingInfoCard'
export * from './components/BillingDetailsForm'

// Dashboard widget primitives (shared admin / partner / creator)
export * from './components/dashboard/Widget'
export * from './components/dashboard/KpiWidget'
export * from './components/dashboard/ChartWidget'
export * from './components/dashboard/ListWidget'
export * from './components/dashboard/QueueWidget'
export * from './components/dashboard/StatusWidget'
export * from './components/dashboard/TimelineWidget'
export * from './components/charts/ChartSparkline'
export * from './components/charts/ChartArea'
export * from './components/charts/ChartBar'
export * from './components/charts/ChartDonut'
export * from './components/charts/ChartLine'
export { chartPalette, chartToneOrder, type ChartTone } from './components/charts/chartPalette'

// Nutrition rendering (compliance service consumer)
export * from './nutrition/NutritionFactsRenderer'
export * from './nutrition/SupplementFactsSvg'
export * from './nutrition/NutritionFactsSvg'
export * from './nutrition/VarietyFactsSvg'
export * from './nutrition/GuaranteedAnalysisSvg'
export * from './nutrition/InciDeclarationSvg'
export * from './nutrition/DrugFactsSvg'

// Canvas — Fabric.js wrappers. 'use client' inside; host pages should
// dynamic-import them with `ssr: false` because Fabric requires `window`.
export * from './canvas/types'
export { Stage } from './canvas/Stage'
export { DieCutFrame, DieCutLegend } from './canvas/DieCutFrame'
// Die-line frame model — scoped slots + content resolution (pure, DB-free).
export * from './canvas/frames'
// Frame compliance gate — submit-gate validation (pure, DB-free).
export * from './canvas/frame-compliance'
// Label responsible-party line composer (21 CFR 101.5)
export * from './canvas/responsibility'
// Packaging composition — 3D surface map + component resolution (pure, DB-free).
export * from './canvas/packaging'
// C9 — normalized dieline SVG generator (from a PackagingDieline structured spec)
export {
  dielineSvgFromSpec,
  type DielineSpecInput,
  type DielineBox,
  type DielineFold,
  type DielineSurface,
} from './canvas/dielineSvg'
// Co-creation §7 — label-proof SVG composer (self-design on the maker's dieline)
export {
  composeLabelProofSvg,
  extractSvgInner,
  type LabelProofLayers,
  type LabelProofDims,
} from './canvas/labelProofSvg'
export { parseDielineSvg, type DielineParseResult, type ParsedBox as DielineParsedBox, type ParsedFold as DielineParsedFold } from './canvas/dielineParse'
export { parsePdfDieline, type PdfDielineResult, type PdfDielineBox } from './canvas/dielinePdf'
export { SUBSTRATE_SWATCHES, substrateById, defaultSubstrateId, type SubstrateSwatch } from './canvas/substrates'
export { Dieline3DViewer, shapeKindForCategory, previewIntentForCategory, type Dieline3DViewerProps, type DielineShapeKind, type FaceTexture, type PbrSurfaceParams } from './canvas/Dieline3DViewer'
export {
  classifyFrames,
  pickSurfaceFrames,
  reservedZoneLabels,
  presentFrameKinds,
  buildPanelMaskSvg,
  compositeDesignSvg,
  type SurfaceDims,
  type CompositeInput,
} from './canvas/aiComposite'
export { planGeneration, planGenerationSet, type PlanGenerationInput, type GenerationPlan, type SetTarget, type SetBrief, type GenerationSetPlan } from './canvas/aiPlan'
// C9.g — shared interactive die-line frame editor (partner studio + admin curator)
export {
  DielineFrameEditor,
  type DielineFrameEditorProps,
  type DielineBackdrop,
  type DielineEditorMeta,
  type DielineSaveStatus,
  type PersistResult,
} from './canvas/DielineFrameEditor'
export { SCOPE_COLOR, KIND_LABEL, PALETTE } from './canvas/frame-presentation'
// C9 — prepress pre-flight engine (partner-spec-driven export validation)
export {
  runPreflight,
  type PreflightInput,
  type PreflightResult,
  type PreflightFinding,
  type PreflightDesignSummary,
  type PreflightDieline,
  type PreflightPartnerSpec,
  type PreflightSeverity,
  type PreflightBox,
} from './canvas/preflight'
export { extractPreflightSummary } from './canvas/preflightExtract'
export {
  addText,
  addTextCombo,
  addImageFromUrl,
  addLabelSection,
  getLabelSectionRole,
  setCanvasBackground,
  selectAllObjects,
  objectsFromSelection,
  applyAiConcept,
  findAiConcept,
  CANVAS_PROPERTIES_TO_INCLUDE,
  LABEL_SECTION_LABELS,
  type CanvasCustomType,
  type LabelSectionRole,
  type AiConceptMeta,
} from './canvas/objects'
export { addIconFromUrl } from './canvas/graphics'
export { renderFactsPreview, type FactsPreviewOpts } from './canvas/factsPreview'
export {
  PATTERN_TILES,
  patternTileDataUrl,
  setCanvasPatternBackground,
  clearCanvasPattern,
  type PatternTile,
} from './canvas/patterns'
export {
  reconcileCertBadges,
  addCertBadge,
  removeCertCoText,
  findCertBadgeObject,
  certBadgeIdsOnCanvas,
  type CertBadgePlacement,
  type CertBadgeDieCut,
} from './canvas/certBadges'
export {
  generateQrCodeDataUrl,
  generateStyledQrCodeDataUrl,
  generateBarcodeDataUrl,
  generateInternalSkuBarcodeDataUrl,
  addQrCode,
  addBarcode,
  addInternalSkuBarcode,
  regenerateCodeImage,
  BARCODE_FORMATS,
  QR_DOT_STYLES,
  QR_CORNER_STYLES,
  TRANSPARENT_FILL,
  isTransparentFill,
  type BarcodeFormat,
  type CodeCustomData,
  type QrDotStyle,
  type QrCornerStyle,
  type QrGradient,
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
  type PanelSections,
} from './canvas/nutritionPanel'
export {
  addAggregateNutritionPanel,
  updateAggregateNutritionPanel,
  SAMPLE_AGGREGATE_NUTRITION_DATA,
  type AggregateNutritionData,
  type AggregateNutritionProps,
  type AggregateNutritionOpts,
  type NutritionFlavor,
} from './canvas/aggregateNutritionPanel'
export {
  addSupplementFactsPanel,
  updateSupplementPanel,
  SAMPLE_SUPPLEMENT_DATA,
  type SupplementPanelData,
  type SupplementPanelProps,
  type SupplementRow,
  type SupplementPanelOpts,
} from './canvas/supplementPanel'
export {
  addAafcoPanel,
  updateAafcoPanel,
  SAMPLE_AAFCO_DATA,
  type AafcoPanelData,
  type AafcoPanelProps,
  type AafcoAnalysisRow,
  type AafcoPanelOpts,
} from './canvas/aafcoPanel'
export {
  addDrugFactsPanel,
  updateDrugFactsPanel,
  SAMPLE_DRUG_FACTS_DATA,
  type DrugFactsData,
  type DrugFactsPanelProps,
  type DrugActiveIngredient,
  type DrugWarningLine,
  type DrugFactsPanelOpts,
} from './canvas/drugFactsPanel'
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
  canGroupSelection,
  canUngroupSelection,
  groupActiveSelection,
  ungroupActiveGroup,
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

