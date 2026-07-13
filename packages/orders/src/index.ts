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
// Entity lifecycle FSM homes (2026-07-06). Shared allowed-transition tables +
// assert guards for ProductTemplate and Partner status changes — call the assert
// before any inline prisma.update({ status }), then write the AuditLog.
export {
  PRODUCT_TEMPLATE_TRANSITIONS,
  isProductTemplateTransitionAllowed,
  assertProductTemplateTransition,
} from './product-template-fsm'
export {
  PARTNER_ALLOWED_TRANSITIONS,
  isPartnerTransitionAllowed,
  assertPartnerTransition,
} from './partner-fsm'
export {
  NOMINATION_ALLOWED_TRANSITIONS,
  isNominationTransitionAllowed,
  assertNominationTransition,
} from './nomination-fsm'
export {
  SERVICE_ALLOWED_TRANSITIONS,
  isServiceTransitionAllowed,
  assertServiceTransition,
} from './service-fsm'
// Co-creation marketplace FSMs (docs/CO_CREATION_MARKETPLACE_SPEC.md §5)
export {
  BRIEF_ALLOWED_TRANSITIONS,
  isBriefTransitionAllowed,
  assertBriefTransition,
  INTEREST_ALLOWED_TRANSITIONS,
  isInterestTransitionAllowed,
  assertInterestTransition,
} from './brief-fsm'
export {
  BUILD_OBJECT_ALLOWED_TRANSITIONS,
  isBuildObjectTransitionAllowed,
  assertBuildObjectTransition,
  ROOM_ALLOWED_TRANSITIONS,
  isRoomTransitionAllowed,
  assertRoomTransition,
  MILESTONE_ALLOWED_TRANSITIONS,
  isMilestoneTransitionAllowed,
  assertMilestoneTransition,
} from './room-object-fsm'
// Room mutation core — callers own the membership guards (see module header).
export {
  submitObjectVersion,
  reviewObject,
  reopenObject,
  addObjectComment,
  addRoomMessage,
  proposeMilestoneTerms,
  agreeMilestoneTerms,
  declineMilestoneTerms,
} from './room-service'
export type { RoomActor, RoomCtx, RoomRole, RoomResult } from './room-service'
// CLOSED_WON materialization (§6 "reuse, don't duplicate" — recipe → Product/Recipe)
export {
  materializeRoomWon,
  parseAmountToGrams,
  normalizeRecipeRows,
  slugifyTitle,
} from './recipe-materialize'
export type { MaterializeResult, RecipeRowInput } from './recipe-materialize'
// Live domain-aware label bundle for the room recipe (facts + mandatory statements)
// D-CC3 maker-switch cutoff engine (pure — action + page share the verdict)
export { evaluateMakerSwitch, MAKER_SWITCH_POLICIES } from './maker-switch'
export type { MakerSwitchPolicy, MakerSwitchFacts, MakerSwitchVerdict } from './maker-switch'
export { resolveRoomRecipeLabel, autoMatchRecipePayload } from './room-label'
export type { RoomRecipeLabel, RoomRecipeRowResolution, RoomRecipeServing } from './room-label'
// Co-creation §7 — creator self-designed LABEL proof payload (the shared seam)
export { labelProofPayloadSchema, isLabelProofPayload, LABEL_PROOF_KIND } from './room-label-proof'
export type { LabelProofPayload } from './room-label-proof'
export {
  assertDispatchTransition,
  DEFAULT_ACCEPT_WINDOW_HOURS,
  MAX_REROUTES,
  resolveMaxReroutes,
  rerouteBudgetRemaining,
  canReroute,
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
// Creator Product Configuration — the immutable "order of the creator" snapshot (source of truth
// for partner manifest + channel listing). docs/CREATOR_PRODUCT_CONFIGURATION.md.
export {
  buildCreatorConfiguration,
  configurationChannelVariants,
  configurationManifestRecipe,
  isCurrentConfiguration,
  mapRecipeIngredients,
  composeFlavorUnitPrices,
  resolveFlavorRecipe,
  CREATOR_CONFIG_VERSION,
} from './creator-configuration'
export type {
  CreatorConfiguration,
  ConfigIngredient,
  ConfigFlavor,
  BuildConfigurationInput,
  RawRecipeIngredientRow,
  FlavorPriceInput,
  FlavorExtra,
} from './creator-configuration'
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
// Partner order packets — shared Product Passport + per-role need-to-know scoping
// (docs/PARTNER_ORDER_PACKETS.md). Pure redaction gate over the full manifest.
export {
  roleForDispatchType,
  buildProductPassport,
  stripFinishCost,
  scopeShipTo,
  scopeManifestForRole,
  scopeManifestForDispatchType,
} from './partner-packet'
export type {
  PartnerRole,
  ProductPassport,
  FinishNoCost,
  ScopedShipTo,
  RolePacket,
  ScopeOptions,
} from './partner-packet'
// Creator order timeline — pure builder over FSM timestamps + progress updates
// (docs/EMAIL_NOTIFICATION_CENTER.md Part 3, checklist F).
export {
  buildDispatchTimeline,
  buildOrderTimeline,
  effectiveEta,
  humanizeMilestone,
} from './dispatch-timeline'
export type {
  ProgressUpdateKind,
  DispatchProgressUpdateData,
  DispatchTimelineSource,
  TimelineEntryKind,
  OrderTimelineEntry,
} from './dispatch-timeline'
// Print-provider selection engines (docs/PRINT_PROVIDER_SELECTION.md §2/§7/§8).
export {
  effectivePrintSourcing,
  showsPrintProviderCards,
  allowsSelfLabelFallback,
} from './print-sourcing'
export type { LabelingModeValue, PrintSourcingProduct, PrintSourcingService } from './print-sourcing'
export { eligiblePrintProviders, INELIGIBILITY_COPY } from './print-eligibility'
export type {
  PrintJobRequirements,
  PrintProviderCandidate,
  DecorationCompatibilityRow,
  PrintIneligibilityReason,
  PrintEligibilityResult,
} from './print-eligibility'
export {
  resolveApplicationPoint,
  validateGraphCompleteness,
  resolveOrderApplication,
  APPLIED_DECORATIONS,
} from './application-point'
export type {
  ApplicationGraphInput,
  ApplicationPointResult,
  GraphCompletenessInput,
  GraphCompletenessResult,
  GraphIncompleteness,
} from './application-point'
// PS-7 per-hop leg planning (§8.3 + freight-bearer decision 2026-07-11) —
// Code's dispatch-planner consumes this to set OrderDispatch.shipToNodeId and
// emit PLANNED ShipmentLeg rows; checkout uses it for the per-hop breakdown.
export { planShipmentHops } from './hop-planner'
export type {
  HopPlan,
  HopPlanInput,
  PlannedHop,
  HopKind,
  HopBillTo,
  HopNode,
  HopNodeKind,
  HopDestinationKind,
} from './hop-planner'
// Print Coverage & Capability RFQ (docs/PRINT_PROVIDER_SELECTION.md §10, PS-8a).
export {
  computeTemplatePrintCoverage,
  recomputeTemplateCoverage,
  buildCapabilityTuples,
  loadCapabilityShortlist,
} from './print-coverage'
export type { TemplatePrintCoverage } from './print-coverage'
// PS-7 publish-time honey-problem gate (§8.2.4). validateTemplateGraph reads the
// `graph:*` LogisticsSetting knobs; the publish action gates on graph:enforce_publish_gate.
export { validateTemplateGraph, templatePublishGraphInputs } from './template-graph'
export type { TemplateGraphResult } from './template-graph'
export { rankCapabilityShortlist } from './capability-shortlist'
export {
  broadcastCapabilityRequestsForTemplate,
  resolveCapabilityClaimOnOfferingActivated,
  recoverTemplateCoverage,
  RFQ_SHORTLIST_SIZE,
  RFQ_EXPIRY_DAYS,
} from './capability-rfq'
export type {
  CapabilityBroadcastResult,
  RfqBroadcastReason,
  ClaimResolutionResult,
  CoverageRecoveryResult,
} from './capability-rfq'
export type {
  CapabilityRequirementTuple,
  ShortlistCandidate,
  ShortlistSignals,
  ShortlistRanked,
} from './capability-shortlist'
// Smart Rotation Engine — pure selection core (docs/SMART_ROTATION_ENGINE.md §2, SR-1).
export {
  selectRotatingProvider,
  validateRotationPolicy,
  buildRotationAwardPayload,
} from './rotation'
export type {
  RotationPolicyInput,
  RotationCandidate,
  RotationContext,
  RotationDecision,
} from './rotation'
export { loadRotationPolicy, policyInputOf, loadFcRotationPolicy } from './routing'
// SR-2.2 — sample print-leg resolver + verdict loop support.
export { resolveSamplePrintLeg } from './sample-print'
export type { SamplePrintLeg } from './sample-print'
// Partner rating engine — dimensions + aggregation math (docs/FEEDBACK_MODULE.md §5).
export {
  RATING_DIMENSIONS,
  ratedRoleForDispatchType,
  validateDimensionScores,
  overallFromDimensions,
  aggregateRatings,
  BAYESIAN_C,
  MIN_RATINGS_FOR_DISPLAY,
  RATING_EDIT_WINDOW_DAYS,
  RATE_PARTNERS_ASK_AFTER_DAYS,
  RATE_PARTNERS_REMIND_AFTER_DAYS,
} from './partner-rating'
export type {
  RatedRole,
  RatingDimensionDef,
  DimensionScores,
  RatingAggregate,
  RatingLike,
} from './partner-rating'
// Review aspect-attribution (docs/REVIEW_ATTRIBUTION_MODEL.md)
export {
  REVIEW_ASPECTS,
  aspectDef,
  visibilityForRole,
  resolveAspectPartners,
  availableAspects,
  resolveOneAspect,
  REANCHOR_TRIGGER_MAX_STARS,
  shouldOfferAttributionFork,
  validateReanchorRating,
  applyAttributionOutcome,
  applyOfferedAspects,
  DEFAULT_ATTRIBUTION_CONTROLS,
} from './review-aspects'
export type {
  ReviewAspect,
  AspectVisibility,
  AspectDef,
  OrderLeg,
  ResolvedAspect,
  AttributionOutcome,
  AttributionResult,
  ReviewAttributionControls,
} from './review-aspects'
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
export { resolveDestinationOptions, recommendDestination } from './destination-options'
export type {
  DestinationType,
  DestinationOption,
  DestinationContext,
  DestinationProductInput,
  ManufacturerStorageInput,
  DestinationRecommendation,
  FulfillmentOrderType,
} from './destination-options'
export {
  rankFulfillmentCenters,
  selectNearestEligibleFc,
  buildAwardLogPayload,
  haversineMiles,
} from './fc-selector'
export type { FcCandidate, FcSelectionInput, FcRanked } from './fc-selector'
export { scoreAndSelectFc, buildScoredAwardPayload, applyFulfillmentPreference, resolveFulfillmentPreference } from './fc-scorer'
export type { FcScoringWeights, FcScoringContext, FcScoreResult, FcScored, FcAwardHistoryEntry, FcRotationPolicy, FulfillmentPreference, AwardAfeContribution } from './fc-scorer'
export { isPublicFcPoolEligible, PUBLIC_FC_PARTNER_FILTER } from './fc-pool'
export {
  classifyFcOverride,
  learnedFulfillmentAdjustment,
  applyLearnedFulfillmentSignal,
} from './fulfillment-learning'
export { normalizeDemandRegion, summarizeDemand } from './demand-signal'
export type { DemandRow, DemandSummary } from './demand-signal'
export type {
  FulfillmentLean,
  LearnedFulfillmentSignal,
  FulfillmentLearningPolicy,
  LearnedAdjustment,
} from './fulfillment-learning'

// Manufacturer Merit Engine — pure scoring core (docs/MANUFACTURER_MERIT_ENGINE.md, MM-1/MM-2).
export {
  computeMeritScore,
  scoreFromPillars,
  validateMeritPolicy,
  recommendBadgeChange,
  DEFAULT_MERIT_POLICY,
} from './merit'
export type {
  MeritBadge,
  MeritSignals,
  MeritCohort,
  MeritPolicy,
  MeritResult,
  PillarScores,
  BadgeEvidence,
  BadgeAction,
  BadgeRecommendation,
  BadgeSnapshotRef,
} from './merit'
export { loadManufacturerMeritSignals, deriveCohortFromSignals } from './merit-signals'
// Rating Appeal — fairness layer (docs/MANUFACTURER_MERIT_ENGINE.md Part 5, MM-4).
export {
  canTransitionAppeal,
  assertAppealTransition,
  isOpenAppeal,
  outcomeChangesAggregate,
  standingFrozen,
  appealDeadlines,
  appealSlaState,
  OPEN_APPEAL_STATUSES,
  AGGREGATE_CHANGING_OUTCOMES,
  DEFAULT_APPEAL_SLA,
} from './rating-appeal'
export type { RatingAppealStatus, AppealSlaPolicy, AppealSlaState } from './rating-appeal'
export { recomputePartnerRatingAggregate } from './partner-rating-recompute'
// P1 two-sided room reviews — creator⇄maker ratings after CLOSED_WON
export {
  rateRoomMaker,
  rateRoomCreator,
  recomputeCreatorRatingAggregate,
  CO_CREATION_RATING_DIMENSIONS,
  CREATOR_RATING_DIMENSIONS,
} from './room-rating'
// Rooms & Messages hub (2026-07-13) — rooms rail + role-badged room chat +
// 1:1 DMs with read cursors. Design contract: design/room-messages-prototype.html.
export {
  memberRoleLabel,
  messagePreview,
  countUnread,
  listMessagingRooms,
  listConversations,
  listRoomChatMessages,
  listDirectMessages,
  getRoomMembers,
  sendRoomChatMessage,
  markRoomRead,
  getOrCreateDmConversation,
  sendDirectMessage,
  markConversationRead,
  countUnreadThreads,
  isConversationParticipant,
  // Presence (DB heartbeat + short poll) + chat attachments
  recordHeartbeat,
  getThreadPresence,
  getOnlineMap,
  chatAttachmentFromPayload,
  isOnline,
  isTypingIn,
  PRESENCE_ONLINE_MS,
  TYPING_ACTIVE_MS,
} from './messaging'
export type {
  MessagingSide,
  ChatMessageView,
  ChatHistoryOpts,
  DirectMessageView,
  RoomThreadSummary,
  ConversationSummary,
  ThreadMemberView,
  SendRoomMessageInput,
  MessagingResult,
  DmParty,
  ThreadPresenceView,
  ChatAttachment,
  PresenceRow,
} from './messaging'
// Shared Design Workspace W0 (D-W1…D-W6 LOCKED 2026-07-13) — pure access engine
export {
  evaluateCollaboratorAccess,
  canGrantDesignerSeat,
  resolveEditLock,
  EDIT_LOCK_STALE_MS,
  EDIT_TAKEOVER_GRACE_MS,
} from './design-collaboration'
export type {
  CollaboratorRole,
  CollaboratorStatus,
  CollaboratorRow,
  CollaboratorAccess,
  EditLockState,
  EditLockVerdict,
} from './design-collaboration'
// W1 invite/accept/revoke service (C2/C3/C4 + D-W5 auto-revoke)
export {
  inviteDesigner,
  revokeDesignerSeat,
  autoRevokeRoomDesigners,
  acceptDesignerInvite,
  markSeatNdaAccepted,
  listRoomDesignerSeats,
  getCollaboratorAccessForUser,
  DESIGNER_INVITE_TTL_DAYS,
  // C7 — internal designer⇄creator review loop
  getOpenDesignReview,
  requestDesignReview,
  decideDesignReview,
  setDesignReviewAutoApprove,
  resolveDesignerSeatCap,
  resolveActiveBriefCap,
  enforceDesignerSeatCapForCreator,
} from './design-collaboration-service'
export type {
  DesignerSeatView,
  SeatResult,
  DesignReviewView,
} from './design-collaboration-service'
// Anti-circumvention contact-leak detector (pure) — chat policy enforcement
export {
  detectContactLeaks,
  evaluateContactLeak,
  CONTACT_LEAK_POLICIES,
  CONTACT_LEAK_WARNING,
} from './contact-leak'
export type { ContactLeakKind, ContactLeakMatch, ContactLeakPolicy } from './contact-leak'
// MM-5 — badge → production-fee resolution (shadow-safe, reversible).
// MM-7 — fee-grace / promo layer (global grace + manual grants).
export { resolveManufacturerFeeBps, feeBpsToPct, resolveActivePromo, addMonths, addDays, addDuration } from './merit-fee'
export type { FeeSource, ResolvedManufacturerFee, PromoSource, GraceUnit, GracePolicy, FeeGrantLike, ActivePromo } from './merit-fee'
// MM-8 — the go-live seam: badge/promo-aware production fee for checkout.
export { resolveOrderProductionFeeBps } from './production-fee-resolver'
export type { ResolvedOrderFee } from './production-fee-resolver'
// Manufacturer merit-fee WITHHOLD (FEE_MODEL_RECONCILIATION_SPEC_2026-07-09) — the
// merit fee eats the manufacturer's payout, not the creator's charge. Shadow-safe.
export { resolveManufacturerMeritFeeBps, meritWithholdCents } from './manufacturer-merit-fee'

// Risk Center M1 — capacity ledger + checkout hook (docs/RISK_CENTER_IMPLEMENTATION_PLAN.md)
export {
  monthKey,
  dispatchUnits,
  isCommittedStatus,
  dispatchLedgerMonth,
  bookDispatchCommitted,
  releaseDispatchCommitted,
  completeDispatchUnits,
  loadCapacityMonths,
} from './capacity-ledger'
export {
  recordCapacityRiskAtCheckout,
  recordOrderVelocityAtCheckout,
  evaluateCapacityGateForCheckout,
  type CheckoutCapacityInput,
  type CheckoutVelocityInput,
  type CapacityGateInfo,
} from './capacity-risk-checkout'
