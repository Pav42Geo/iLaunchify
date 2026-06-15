// Order lifecycle + dispatch FSM + routing + transfer planning.

export {
  transitionOrder,
  assertOrderTransition,
} from './order-fsm'
export {
  transitionDispatch,
  assertDispatchTransition,
  DEFAULT_ACCEPT_WINDOW_HOURS,
  MAX_REROUTES,
} from './dispatch-fsm'
export { computeTransferPlan } from './transfer-planner'
export {
  findRouting,
  estimateDispatchCosts,
  createDispatches,
} from './routing'
export { deriveItemDispatch, isLive } from './dispatch-planner'
export type {
  DispatchRow,
  ComponentLeg,
  ItemRouting,
  ItemDispatchPlan,
  PlannerLiveService,
} from './dispatch-planner'
export type { RoutingResult, RoutingFailure } from './routing'
export { previewManufacturerMatches } from './routing'
export type { RoutingPreviewResult, RoutingPreviewCandidate } from './routing'
export {
  scorePartnerMatch,
  rankPartnerMatches,
  pickBestMatch,
  capabilityScore,
  proximityScore,
} from './scoring'
export type { MatchCandidate, MatchContext, MatchScore, MatchWeights } from './scoring'
export { runAutoCancel, runStaleOrderAutoCancel, isOrderStale } from './auto-cancel'
export type { AutoCancelResult, StaleOrderCancelResult } from './auto-cancel'
export {
  generateOrderManifest,
  parseInternalNotesLookups,
  MANIFEST_VERSION,
} from './manifest'
export type { ProductionManifest } from './manifest'
export { recomputeAggregateApprovalStatus } from './aggregate-approval'
export {
  isUsableCredit,
  usableCredits,
  availableSampleCreditCents,
  applySampleCredit,
  mintSampleCredit,
  SAMPLE_CREDIT_EXPIRY_DAYS,
} from './sample-credit'
export type {
  SampleCreditStatus,
  SampleCreditEntry,
  CreditConsumption,
  ApplyCreditResult,
  MintedCredit,
} from './sample-credit'
export {
  quoteSample,
  hasSamplerSet,
  formatCents,
} from './sample-quote'
export type {
  SampleKind,
  SampleOption,
  SampleMode,
  SampleSelection,
  SampleQuoteLine,
  SampleQuote,
} from './sample-quote'
export {
  exportBundleFilename,
  assembleSpecSheet,
  buildExportBundleManifest,
  EXPORT_BUNDLE_MANIFEST_VERSION,
} from './exportBundle'
export type {
  BundleFilenameParts,
  SpecSheetInput,
  SpecSheet,
  BundleFileEntry,
  BundleFileKind,
  BundleAcks,
  ExportBundleManifest,
  BuildManifestInput,
} from './exportBundle'
