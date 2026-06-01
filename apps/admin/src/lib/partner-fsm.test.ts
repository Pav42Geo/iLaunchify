// Unit tests for the partner-status FSM transition helpers.
//
// Vitest isn't wired into the admin app's tsconfig yet — following the same
// convention as packages/marketplace/src/suggestNiches.test.ts, these are
// written as exported, throw-on-failure scenarios so they (a) type-check under
// `tsc --noEmit` today and (b) plug straight into vitest later.
//
// Run path (when vitest is added): `pnpm --filter @ilaunchify/admin test`.
// For now the type-check step compiles them against the shipping helpers.
//
// Why this exists: the helpers used to branch on the destination state only,
// which silently conflated FORWARD vs BACKWARD moves to the same state (e.g. a
// forward "verify identity" and a backward "kick ops review back to identity"
// both land on IDENTITY_VERIFIED). The sweep + regression guards below pin the
// direction-aware semantics so that can't regress.

import type { PartnerStatus } from '@ilaunchify/db'
import {
  ALLOWED_TRANSITIONS,
  transitionVerb,
  transitionVariant,
  auditActionForTransition,
  notificationEventForTransition,
  isBackwardTransition,
} from './partner-fsm'

const VARIANTS = new Set(['primary', 'secondary', 'destructive'])
const NOTIF_EVENTS = new Set([
  'PARTNER_ACTIVATED',
  'SECTION_NEEDS_CHANGES',
  'SECTION_VERIFIED',
])

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

/** Every admin-drivable (from → to) edge declared in the FSM table. */
function allEdges(): Array<{ from: PartnerStatus; to: PartnerStatus }> {
  const edges: Array<{ from: PartnerStatus; to: PartnerStatus }> = []
  for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) {
    for (const to of tos ?? []) {
      edges.push({ from: from as PartnerStatus, to })
    }
  }
  return edges
}

// ---- 1. Invariant sweep over every allowed edge ------------------------------
// For each edge, the four helpers must agree with the documented semantics in
// docs/PARTNER_FSM_TRANSITION_HELPERS_DECISION.md.
export const scenarioEdgeInvariants = () => {
  for (const { from, to } of allEdges()) {
    const verb = transitionVerb(from, to)
    const variant = transitionVariant(to)
    const audit = auditActionForTransition(from, to)
    const notif = notificationEventForTransition(from, to)
    const tag = `${from}→${to}`

    // Baseline shape — no edge may produce empty/invalid output.
    assert(verb.length > 0, `${tag}: empty verb`)
    assert(VARIANTS.has(variant), `${tag}: bad variant ${variant}`)
    assert(audit.length > 0, `${tag}: empty audit action`)
    assert(notif === null || NOTIF_EVENTS.has(notif), `${tag}: bad notif ${notif}`)

    // Terminal / hold edges are direction-independent.
    if (to === 'TERMINATED') {
      assert(verb === 'Terminate', `${tag}: verb`)
      assert(audit === 'PARTNER_TERMINATE', `${tag}: audit`)
      assert(notif === null, `${tag}: notif`)
      continue
    }
    if (to === 'SUSPENDED') {
      assert(verb === 'Suspend' && variant === 'destructive', `${tag}: suspend`)
      assert(audit === 'PARTNER_SUSPEND' && notif === null, `${tag}: suspend audit/notif`)
      continue
    }
    if (to === 'PAUSED') {
      assert(verb === 'Pause' && audit === 'PARTNER_PAUSE' && notif === null, `${tag}: pause`)
      continue
    }
    if (to === 'ACTIVE') {
      assert(notif === 'PARTNER_ACTIVATED', `${tag}: activate notif`)
      const reinstate = from === 'PAUSED' || from === 'SUSPENDED'
      assert(
        audit === (reinstate ? 'PARTNER_REINSTATE' : 'PARTNER_ACTIVATE'),
        `${tag}: activate/reinstate audit`,
      )
      assert(verb === (reinstate ? 'Reinstate' : 'Activate partner'), `${tag}: activate verb`)
      continue
    }

    // Backward down the ladder = request changes, in all three helpers.
    if (isBackwardTransition(from, to)) {
      assert(verb === 'Request changes', `${tag}: backward verb`)
      assert(audit === 'PARTNER_REQUEST_CHANGES', `${tag}: backward audit`)
      assert(notif === 'SECTION_NEEDS_CHANGES', `${tag}: backward notif`)
      continue
    }

    // Forward approvals of a review layer.
    if (to === 'IDENTITY_VERIFIED') {
      assert(verb === 'Verify identity', `${tag}: fwd IDV verb`)
      assert(audit === 'PARTNER_VERIFY_IDENTITY', `${tag}: fwd IDV audit`)
      assert(notif === 'SECTION_VERIFIED', `${tag}: fwd IDV notif`)
    } else if (to === 'OPERATIONALLY_CONFIGURED') {
      assert(verb === 'Verify operations', `${tag}: fwd OC verb`)
      assert(audit === 'PARTNER_VERIFY_OPS', `${tag}: fwd OC audit`)
      assert(notif === 'SECTION_VERIFIED', `${tag}: fwd OC notif`)
    } else if (to === 'OPS_PENDING_REVIEW') {
      assert(verb === 'Send to ops review', `${tag}: fwd OPR verb`)
      assert(audit === 'PARTNER_SEND_TO_OPS_REVIEW', `${tag}: fwd OPR audit`)
      // No existing notification event fits "advanced to ops review".
      assert(notif === null, `${tag}: fwd OPR notif should be null`)
    }
  }
  return true
}

// ---- 2. Regression guards on the direction-sensitive states ------------------
// These are the exact cases that were wrong before the fix.

// Forward verify identity must tell the partner they're VERIFIED (not "needs
// changes" — the original bug).
export const scenarioForwardIdentityVerify = () => {
  const from: PartnerStatus = 'IDENTITY_PENDING_REVIEW'
  const to: PartnerStatus = 'IDENTITY_VERIFIED'
  assert(!isBackwardTransition(from, to), 'forward IDV: should not be backward')
  assert(
    notificationEventForTransition(from, to) === 'SECTION_VERIFIED',
    'forward IDV: expected SECTION_VERIFIED',
  )
  assert(
    auditActionForTransition(from, to) === 'PARTNER_VERIFY_IDENTITY',
    'forward IDV: expected PARTNER_VERIFY_IDENTITY',
  )
  return true
}

// The same destination reached backward (kicked back from ops review) must be a
// "request changes" with the NEEDS_CHANGES email.
export const scenarioBackwardToIdentityVerified = () => {
  const from: PartnerStatus = 'OPS_PENDING_REVIEW'
  const to: PartnerStatus = 'IDENTITY_VERIFIED'
  assert(isBackwardTransition(from, to), 'backward IDV: should be backward')
  assert(transitionVerb(from, to) === 'Request changes', 'backward IDV: verb')
  assert(
    auditActionForTransition(from, to) === 'PARTNER_REQUEST_CHANGES',
    'backward IDV: audit',
  )
  assert(
    notificationEventForTransition(from, to) === 'SECTION_NEEDS_CHANGES',
    'backward IDV: notif',
  )
  return true
}

// Ops review reached backward from OPERATIONALLY_CONFIGURED is also a downgrade,
// not a forward "send to ops review".
export const scenarioBackwardToOpsReview = () => {
  const from: PartnerStatus = 'OPERATIONALLY_CONFIGURED'
  const to: PartnerStatus = 'OPS_PENDING_REVIEW'
  assert(isBackwardTransition(from, to), 'backward OPR: should be backward')
  assert(transitionVerb(from, to) === 'Request changes', 'backward OPR: verb')
  assert(
    notificationEventForTransition(from, to) === 'SECTION_NEEDS_CHANGES',
    'backward OPR: notif',
  )
  return true
}

// Reinstating from a hold keeps the activation email + a distinct audit verb.
export const scenarioReinstate = () => {
  for (const from of ['PAUSED', 'SUSPENDED'] as PartnerStatus[]) {
    assert(transitionVerb(from, 'ACTIVE') === 'Reinstate', `${from}→ACTIVE: verb`)
    assert(
      auditActionForTransition(from, 'ACTIVE') === 'PARTNER_REINSTATE',
      `${from}→ACTIVE: audit`,
    )
    assert(
      notificationEventForTransition(from, 'ACTIVE') === 'PARTNER_ACTIVATED',
      `${from}→ACTIVE: notif`,
    )
  }
  return true
}

// Direction helper sanity: forward false, backward true, off-ladder/legacy false.
export const scenarioIsBackwardSanity = () => {
  assert(isBackwardTransition('IDENTITY_PENDING_REVIEW', 'IDENTITY_VERIFIED') === false, 'fwd')
  assert(isBackwardTransition('OPS_PENDING_REVIEW', 'IDENTITY_VERIFIED') === true, 'bwd')
  assert(isBackwardTransition('ACTIVE', 'PAUSED') === false, 'off-ladder to')
  assert(isBackwardTransition('DRAFT', 'IDENTITY_PENDING_REVIEW') === false, 'legacy from')
  return true
}

// All scenarios — run via a manual runner to confirm locally:
//   import { runAll } from '@/lib/partner-fsm.test'
export function runAll(): void {
  scenarioEdgeInvariants()
  scenarioForwardIdentityVerify()
  scenarioBackwardToIdentityVerified()
  scenarioBackwardToOpsReview()
  scenarioReinstate()
  scenarioIsBackwardSanity()
}
