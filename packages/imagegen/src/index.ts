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
  type OutputFormat,
  type ColorProfile,
  type OutputSettings,
  type OutputPolicy,
  type OutputPreset,
  type ClampResult,
  DEFAULT_OUTPUT_POLICIES,
  resolveOutputPolicy,
  presetsForTier,
  clampOutput,
  applyPreset,
} from './output'

export {
  type ImageRef,
  type PanelGenRequest,
  type VectorTypeRequest,
  type UpscaleRequest,
  type OutpaintRequest,
  type ImageGenProvider,
  type ProviderStatus,
  PROVIDER_ENV,
  providerStatus,
} from './provider'

// P3 adapters + resolution + orchestration.
export { createStubProvider } from './adapters/stub'
export { createFalProvider, type FalConfig } from './adapters/fal'
export { createRecraftProvider, type RecraftConfig } from './adapters/recraft'
export { resolveImageGenProvider, type ResolveOptions, type ResolvedProvider } from './resolve'
export {
  runDraftGeneration,
  runOutpaintGeneration,
  runFinalizeGeneration,
  type DraftGenerationInput,
  type DraftGenerationResult,
  type OutpaintGenerationInput,
  type FinalizeGenerationInput,
  type FinalizeGenerationResult,
} from './orchestrator'
