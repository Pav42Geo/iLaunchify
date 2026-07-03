// Order lifecycle + dispatch FSM + routing + transfer planning.

// Human-friendly order numbers — `ILF-YYMMDD-XXXXX`.
export {
  generateOrderNumber,
  isValidOrderNumber,
  ORDER_CODE_ALPHABET,
  ORDER_CODE_LENGTH,
  ORDER_NUMBER_PREFIX,
  ORDER_NUMBER_REGEX,
} from './order-number'
export type { RandomBytes } from './order-number'
export { createOrderWithNumber, ORDER_NUMBER_MAX_ATTEMPTS } from './create-order'

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
export { createReprintDispatch } from './reprint-dispatch'
export type {
  CreateReprintDispatchParams,
  CreateReprintDispatchResult,
} from './reprint-dispatch'
// Per-flavor recipe lead (LOCKED 2026-06-30 — global floor + changeover). Feeds the order manifest.
export { effectiveFlavorLeadDays, resolveOrderLeadDays } from './multi-flavor-lead'
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
export { runAcceptReminders, ACCEPT_REMINDER_LEAD_HOURS } from './accept-reminders'
export type { AcceptReminder, AcceptReminderResult } from './accept-reminders'
export { computeCancellationOutcome } from './cancellation-refund'
export type { CancellationFeePolicy, CancellationOutcome } from './cancellation-refund'
export { canCreatorSelfCancel } from './cancellation-policy'
export type { CreatorCancelEligibility, CreatorCancelBlockReason } from './cancellation-policy'
export {
  generateOrderManifest,
  parseInternalNotesLookups,
  MANIFEST_VERSION,
  aggregateFlavorQuantities,
  packOrderTotalCents,
  buildManifestPackStructure,
} from './manifest'
export type { ProductionManifest, PackSlotInput } from './manifest'
export { recomputeAggregateApprovalStatus, computeAggregateStatus } from './aggregate-approval'
export type { AggregateStatus } from './aggregate-approval'
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
// Phase L1 — logistics destinations + V1 FC selection (docs/LOGISTICS_AND_FULFILLMENT.md)
export { resolveDestinationOptions } from './destination-options'
export type {
  DestinationType,
  DestinationOption,
  DestinationContext,
  DestinationProductInput,
  ManufacturerStorageInput,
} from './destination-options'
export {
  rankFulfillmentCenters,
  selectNearestEligibleFc,
  buildAwardLogPayload,
  haversineMiles,
} from './fc-selector'
export type { FcCandidate, FcSelectionInput, FcRanked } from './fc-selector'
export { scoreAndSelectFc, buildScoredAwardPayload } from './fc-scorer'
export type { FcScoringWeights, FcScoringContext, FcScoreResult, FcScored, FcAwardHistoryEntry } from './fc-scorer'
