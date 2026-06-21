// @ilaunchify/support — shared support-ticket store + FSM.
// Imported by apps/admin (inbox), apps/creator + apps/partner (/help).
// See docs/SUPPORT_TICKETING_PLAN.md (W2-SUP2).

export {
  // mutations
  createTicket,
  replyToTicket,
  transitionTicket,
  assignTicket,
  linkEntity,
  recordTicketEvent,
  // reads (scope-aware)
  listTickets,
  getTicket,
  // cron
  runSlaBreachScan,
  type SlaBreach,
  // scope + errors
  TicketNotFoundError,
  type ViewerScope,
  type CreateTicketInput,
  type ReplyInput,
  type ListTicketFilters,
} from './service'

export {
  TICKET_TRANSITIONS,
  canTransitionTicket,
  assertTicketTransition,
  TicketTransitionError,
  eventKindForTransition,
  isTerminalStatus,
  OPEN_STATUSES,
  SLA_DEFAULTS,
  effectiveSlaWindow,
  isResponseSlaBreached,
  type SlaWindow,
} from './ticket-fsm'

export {
  LINKABLE_ENTITY_TYPES,
  isLinkableEntityType,
  assertLinkableEntityType,
  EntityLinkError,
  type LinkableEntityType,
} from './entity-allowlist'

export { notifySupport, type SupportEvent } from './notify'

export {
  resolveCreatorIntake,
  maxPriority,
  type CreatorTier,
  type IntakeResolution,
} from './intake-policy'
