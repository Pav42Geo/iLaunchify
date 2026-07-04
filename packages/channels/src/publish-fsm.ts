// =============================================================================
// ChannelProductLink publish FSM (CHANNEL_MANAGEMENT_SPEC + PACKAGING_3D_GENERATOR_PLAN §9.4.1)
//
// The creator publish lifecycle for one (product × channel) listing. EXTENDS the
// existing `ChannelProductLink.publishState` (`ChannelPublishState`) — it does NOT
// introduce a parallel model. Two states are additive over today's enum
// (DRAFT/PUSHED/LIVE/PAUSED/ERROR): HELD and SCHEDULED, so a creator can hold a
// push (e.g. a bulk order with lead time) and release it later — manually, at a
// scheduled time, or automatically when the linked production order is delivered.
//
// Term mapping (plan §9.4.1 ↔ schema enum):
//   DRAFT      = DRAFT       configured, nothing pushed
//   HELD       = HELD*       creator holding; won't push yet            (*additive)
//   SCHEDULED  = SCHEDULED*  armed for a datetime / order-delivered     (*additive)
//   PUSHED     = PUSHED      exists on channel, not sellable yet
//   PUBLISHED  = LIVE        sellable on the channel
//   UNPUBLISHED= PAUSED      pulled back / hidden (first-class, not delete)
//   (ERROR     = ERROR)      last push/update failed
//
// Persistence + audit live in server actions; this module is Prisma-free and pure.
// =============================================================================

export const PUBLISH_STATES = ['DRAFT', 'HELD', 'SCHEDULED', 'PUSHED', 'LIVE', 'PAUSED', 'ERROR'] as const
export type PublishState = (typeof PUBLISH_STATES)[number]

/** What arms a HELD/SCHEDULED link to advance to PUSHED. */
export const PUBLISH_TRIGGERS = ['MANUAL', 'SCHEDULED_AT', 'ON_ORDER_DELIVERED'] as const
export type PublishTrigger = (typeof PUBLISH_TRIGGERS)[number]

/** Allowed publish transitions. All states are recoverable (no terminal). */
const PUBLISH_TRANSITIONS: Record<PublishState, PublishState[]> = {
  DRAFT: ['HELD', 'SCHEDULED', 'PUSHED', 'ERROR'],
  HELD: ['SCHEDULED', 'PUSHED', 'DRAFT', 'ERROR'],
  SCHEDULED: ['PUSHED', 'HELD', 'DRAFT', 'ERROR'],
  PUSHED: ['LIVE', 'PAUSED', 'ERROR'],
  LIVE: ['PAUSED', 'PUSHED', 'ERROR'],
  PAUSED: ['LIVE', 'PUSHED', 'DRAFT', 'ERROR'],
  ERROR: ['DRAFT', 'HELD', 'SCHEDULED', 'PUSHED', 'PAUSED'],
}

export function canPublishTransition(from: PublishState, to: PublishState): boolean {
  return PUBLISH_TRANSITIONS[from]?.includes(to) ?? false
}

/** States where the listing is holding and waiting on a trigger to push. */
export function isAwaitingRelease(state: PublishState): boolean {
  return state === 'HELD' || state === 'SCHEDULED'
}

/** Is the listing sellable on the channel right now? */
export function isLive(state: PublishState): boolean {
  return state === 'LIVE'
}

// --- Release guard (the hold-until-delivered core) ----------------------------

export interface ReleaseInput {
  state: PublishState
  trigger: PublishTrigger
  /** For SCHEDULED_AT: the armed datetime. */
  publishAt?: Date | null
  /** For ON_ORDER_DELIVERED: has the linked production order reached delivered? */
  linkedOrderDelivered?: boolean
  /** Evaluation clock (injected for determinism/testing). */
  now: Date
}

export type ReleaseVerdict =
  | { release: true; to: 'PUSHED' }
  | { release: false; reason: string }

/**
 * Decide whether a holding link (HELD/SCHEDULED) should now advance to PUSHED.
 * MANUAL never auto-releases (the creator must act). SCHEDULED_AT releases once
 * `now >= publishAt`. ON_ORDER_DELIVERED releases when the linked order is
 * delivered — the mechanism for "publish when the bulk order arrives" (plan §9.4.1).
 * Pure + deterministic; the caller supplies `now` and the delivered flag.
 */
export function evaluatePublishRelease(input: ReleaseInput): ReleaseVerdict {
  if (!isAwaitingRelease(input.state)) {
    return { release: false, reason: `State ${input.state} is not awaiting release.` }
  }
  switch (input.trigger) {
    case 'MANUAL':
      return { release: false, reason: 'Manual trigger — creator must release the hold.' }
    case 'SCHEDULED_AT': {
      if (!input.publishAt) return { release: false, reason: 'No scheduled time set.' }
      return input.now.getTime() >= input.publishAt.getTime()
        ? { release: true, to: 'PUSHED' }
        : { release: false, reason: `Scheduled for ${input.publishAt.toISOString()}.` }
    }
    case 'ON_ORDER_DELIVERED':
      return input.linkedOrderDelivered === true
        ? { release: true, to: 'PUSHED' }
        : { release: false, reason: 'Linked order not yet delivered.' }
  }
}
