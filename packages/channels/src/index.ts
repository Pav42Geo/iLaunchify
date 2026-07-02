// @ilaunchify/channels — sales-channel adapter seam + pure channel-order logic
// (docs/CHANNEL_MANAGEMENT_SPEC.md). Native adapters land per phase:
// C1 shopify · C3 tiktok · C4 amazon · C5 walmart + long-tail six.

export {
  CHANNEL_CODES,
  type ChannelCode,
  type TokenSet,
  type ConnectionCtx,
  type ListingInput,
  type ListingVariantInput,
  type ExternalListing,
  type ExternalOrder,
  type ExternalOrderLine,
  type TrackingInput,
  type ChannelAdapter,
} from './adapter'

export { createStubAdapter } from './adapters/stub'
export { resolveChannelAdapter } from './resolve'

export {
  ORDER_CHANGE_STAGES,
  CHANGE_KINDS,
  CHANGE_REQUEST_STATUSES,
  changeGate,
  availableChanges,
  routeChange,
  canTransitionChangeRequest,
  type OrderChangeStage,
  type ChangeKind,
  type ChangeGate,
  type ChangeRequestStatus,
  type ChangeRouting,
} from './change-matrix'

export {
  blendedVelocity,
  reorderPoint,
  daysOfCover,
  projectedStockoutDate,
  reorderByDate,
  suggestedReorderQty,
  stockAlertState,
  shouldNotify,
  type StockAlertState,
  type VelocityInput,
  type ReorderPointInput,
  type SuggestedQtyInput,
  type AlertInput,
} from './replenishment'

export {
  applyLedgerEntry,
  availableToSell,
  canReserve,
  replayLedger,
  type LedgerKind,
  type PoolState,
  type ApplyResult,
} from './inventory'

export {
  CHANNEL_ORDER_STATUSES,
  type ChannelOrderStatus,
  canTransition,
  isTerminal,
  evaluateReadiness,
  manualConfirmActive,
  variantKey,
  parseVariantKey,
  type OrderLineReadiness,
  type ReadinessInput,
  type ReadinessVerdict,
} from './order-fsm'
