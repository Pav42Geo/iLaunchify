// @ilaunchify/imagegen — provider seam + pure metering for the AI Packaging
// Generator (P3). docs/AI_PACKAGING_GENERATOR.md §5/§13. No network/DB in P0 of
// this package; the fal/Recraft adapters implement ImageGenProvider in P3.

export {
  type CreatorBillingTier,
  type TierGenerationLimits,
  type PanelMegapixels,
  type DraftQuote,
  type FinalizeQuote,
  type BudgetCheck,
  COST,
  DEFAULT_TIER_LIMITS,
  tierLimits,
  mmToPixels,
  panelMegapixels,
  quoteDraft,
  quoteFinalize,
  canStartDraft,
  canFinalize,
  canStore,
  estimateStoredTemplateBytes,
  formatBytes,
} from './metering'

export {
  type ImageRef,
  type PanelGenRequest,
  type VectorTypeRequest,
  type UpscaleRequest,
  type ImageGenProvider,
  type ProviderStatus,
  PROVIDER_ENV,
  providerStatus,
} from './provider'
