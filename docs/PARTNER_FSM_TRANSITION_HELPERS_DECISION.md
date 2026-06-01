# Partner FSM transition helpers — direction-fix decision (E1b)

**Status:** ✅ IMPLEMENTED 2026-06-01 (natural defaults) · **Date:** 2026-06-01

> **Implemented.** Added `PROGRESSION_LADDER` + `isBackwardTransition()` to `partner-fsm.ts`; rewired `transitionVerb`, `auditActionForTransition`, and `notificationEventForTransition` to branch on direction. Admin app typechecks clean.
>
> Natural choices taken:
> 1. **Forward `LEAD → IDENTITY_PENDING_REVIEW`** → generic fallback (`Move to …` verb, `PARTNER_STATUS_CHANGE` audit). Chose this over a new `PARTNER_SEND_TO_IDENTITY_REVIEW` string to avoid rippling into `packages/audit`'s action list + the ActivityFeed humanizer; the edge is partner-driven and near-never hit by admin.
> 2. **Forward `→ OPS_PENDING_REVIEW`** → `null` notification (no fitting event exists).
> 3. **Reinstate `→ ACTIVE`** → kept `PARTNER_ACTIVATED`.
>
> Still open (nice-to-have, not blocking): the table-driven test below.
**Scope:** `apps/admin/src/lib/partner-fsm.ts` + `apps/admin/src/app/(dashboard)/partners/[partnerId]/actions.ts`
**Does NOT touch:** the `PartnerStatus` enum or `ALLOWED_TRANSITIONS` (the locked FSM). Only the *helper* functions that map a transition to a button label, an audit-action string, and a notification event.

---

## The problem

Three helpers — `transitionVerb`, `auditActionForTransition`, `notificationEventForTransition` — decide what to show/log/email for a given `(from → to)` move. They currently branch on `to` **only**. But the same target state can be reached two ways:

- `IDENTITY_VERIFIED` is **forward** from `IDENTITY_PENDING_REVIEW`, **backward** from `OPS_PENDING_REVIEW`.
- `OPS_PENDING_REVIEW` is **forward** from `IDENTITY_VERIFIED`, **backward** from `OPERATIONALLY_CONFIGURED`.

Because direction is ignored, the helpers misfire on the backward edges. The most visible symptom: **a forward identity verification currently emits the `SECTION_NEEDS_CHANGES` partner email instead of `SECTION_VERIFIED`** (`notificationEventForTransition` even underscores its `from` arg — `_from` — so it *can't* disambiguate). The dead-branch removal that got the build green preserved this bug; this doc fixes it properly.

---

## Proposed model: a progression ladder + direction test

Rank the on-ladder states. Off-ladder states (holds + terminal) are handled before the ladder check.

| Status | Ordinal |
|---|---|
| LEAD | 0 |
| IDENTITY_PENDING_REVIEW | 1 |
| IDENTITY_VERIFIED | 2 |
| OPS_PENDING_REVIEW | 3 |
| OPERATIONALLY_CONFIGURED | 4 |
| ACTIVE | 5 |
| INTEGRATION_ENHANCED | 6 |

`PAUSED`, `SUSPENDED`, `TERMINATED` = off-ladder (no ordinal). Legacy `DRAFT/INVITED/IN_PROGRESS/UNDER_REVIEW` map to their nearest canonical ordinal for direction purposes (or just fall through to the default).

**Direction:** for two on-ladder states, `to` is *forward* if `ord(to) > ord(from)`, *backward* if `ord(to) < ord(from)`.

---

## Full transition matrix (admin-driven edges from `ALLOWED_TRANSITIONS`)

| from | to | direction | verb (button) | audit action | notification |
|---|---|---|---|---|---|
| LEAD | IDENTITY_PENDING_REVIEW | forward¹ | Send to identity review | PARTNER_SEND_TO_IDENTITY_REVIEW | null |
| LEAD | TERMINATED | terminal | Terminate | PARTNER_TERMINATE | null |
| IDENTITY_PENDING_REVIEW | IDENTITY_VERIFIED | **forward** | Verify identity | PARTNER_VERIFY_IDENTITY | **SECTION_VERIFIED** |
| IDENTITY_PENDING_REVIEW | LEAD | backward | Request changes | PARTNER_REQUEST_CHANGES | SECTION_NEEDS_CHANGES |
| IDENTITY_PENDING_REVIEW | TERMINATED | terminal | Terminate | PARTNER_TERMINATE | null |
| IDENTITY_VERIFIED | OPS_PENDING_REVIEW | **forward** | Send to ops review | PARTNER_SEND_TO_OPS_REVIEW | **null**² |
| IDENTITY_VERIFIED | IDENTITY_PENDING_REVIEW | backward | Request changes | PARTNER_REQUEST_CHANGES | SECTION_NEEDS_CHANGES |
| IDENTITY_VERIFIED | TERMINATED | terminal | Terminate | PARTNER_TERMINATE | null |
| OPS_PENDING_REVIEW | OPERATIONALLY_CONFIGURED | **forward** | Verify operations | PARTNER_VERIFY_OPS | **SECTION_VERIFIED** |
| OPS_PENDING_REVIEW | IDENTITY_VERIFIED | **backward** | Request changes | PARTNER_REQUEST_CHANGES | **SECTION_NEEDS_CHANGES** |
| OPS_PENDING_REVIEW | TERMINATED | terminal | Terminate | PARTNER_TERMINATE | null |
| OPERATIONALLY_CONFIGURED | ACTIVE | forward | Activate partner | PARTNER_ACTIVATE | PARTNER_ACTIVATED |
| OPERATIONALLY_CONFIGURED | OPS_PENDING_REVIEW | **backward** | Request changes | PARTNER_REQUEST_CHANGES | **SECTION_NEEDS_CHANGES** |
| OPERATIONALLY_CONFIGURED | TERMINATED | terminal | Terminate | PARTNER_TERMINATE | null |
| ACTIVE | PAUSED | hold | Pause | PARTNER_PAUSE | null |
| ACTIVE | SUSPENDED | hold (destructive) | Suspend | PARTNER_SUSPEND | null |
| ACTIVE | TERMINATED | terminal | Terminate | PARTNER_TERMINATE | null |
| INTEGRATION_ENHANCED | PAUSED / SUSPENDED / TERMINATED | hold/terminal | Pause / Suspend / Terminate | PARTNER_PAUSE / _SUSPEND / _TERMINATE | null |
| PAUSED | ACTIVE | reinstate | Reinstate | PARTNER_REINSTATE | PARTNER_ACTIVATED³ |
| PAUSED | SUSPENDED | hold (destructive) | Suspend | PARTNER_SUSPEND | null |
| PAUSED | TERMINATED | terminal | Terminate | PARTNER_TERMINATE | null |
| SUSPENDED | ACTIVE | reinstate | Reinstate | PARTNER_REINSTATE | PARTNER_ACTIVATED³ |
| SUSPENDED | TERMINATED | terminal | Terminate | PARTNER_TERMINATE | null |

**Bold rows** are where current code is wrong (direction-conflated targets). Everything else already behaves correctly.

### Decisions embedded above (flag if you disagree)

1. **Admin moving LEAD → IDENTITY_PENDING_REVIEW** is normally partner-driven (`submitForReview`). If admin does it, treat as forward "Send to identity review". Needs a new audit string `PARTNER_SEND_TO_IDENTITY_REVIEW` (or reuse `PARTNER_STATUS_CHANGE`). **← confirm.**
2. **Forward → OPS_PENDING_REVIEW**: no obvious partner email fits the existing enum (`SECTION_VERIFIED` is misleading, `SECTION_NEEDS_CHANGES` is wrong). Recommend **`null`** until/unless a "submitted / advanced" event is added. **← confirm null is acceptable.**
3. **Reinstate → ACTIVE** currently maps to `PARTNER_ACTIVATED`. Fine to keep, or add a distinct `PARTNER_REINSTATED` email. **← keep PARTNER_ACTIVATED?**

---

## Recommended implementation

Add to `partner-fsm.ts`:

```ts
const LADDER: PartnerStatus[] = [
  'LEAD',
  'IDENTITY_PENDING_REVIEW',
  'IDENTITY_VERIFIED',
  'OPS_PENDING_REVIEW',
  'OPERATIONALLY_CONFIGURED',
  'ACTIVE',
  'INTEGRATION_ENHANCED',
]

/** -1 for off-ladder states (PAUSED/SUSPENDED/TERMINATED/legacy). */
function ordinal(s: PartnerStatus): number {
  return LADDER.indexOf(s)
}

/** True when both states are on-ladder and `to` sits earlier than `from`. */
export function isBackwardTransition(from: PartnerStatus, to: PartnerStatus): boolean {
  const f = ordinal(from)
  const t = ordinal(to)
  return f >= 0 && t >= 0 && t < f
}
```

Then key the three helpers on direction for the conflated targets. e.g. `notificationEventForTransition` stops underscoring `from`:

```ts
function notificationEventForTransition(
  from: PartnerStatus,
  to: PartnerStatus,
): 'PARTNER_ACTIVATED' | 'SECTION_NEEDS_CHANGES' | 'SECTION_VERIFIED' | null {
  if (to === 'ACTIVE') return 'PARTNER_ACTIVATED'
  if (isBackwardTransition(from, to)) return 'SECTION_NEEDS_CHANGES'
  if (to === 'IDENTITY_VERIFIED' || to === 'OPERATIONALLY_CONFIGURED') return 'SECTION_VERIFIED'
  return null // includes forward → OPS_PENDING_REVIEW (decision #2)
}
```

`transitionVerb` and `auditActionForTransition` follow the same shape: handle terminal/hold first, then `isBackwardTransition` → "Request changes" / `PARTNER_REQUEST_CHANGES`, then forward-specific verbs/actions.

This removes the ordering fragility entirely — no more "this branch is unreachable because an earlier one ate the state."

---

## Test coverage — ✅ added

`apps/admin/src/lib/partner-fsm.test.ts` sweeps every `(from, to)` pair in `ALLOWED_TRANSITIONS` asserting verb + variant + audit action + notification, plus explicit regression guards on the direction-sensitive cases (forward identity-verify ⇒ `SECTION_VERIFIED`; backward bounce ⇒ `SECTION_NEEDS_CHANGES`). Written in the house throw-based, vitest-ready style (no hard `vitest` import) so it type-checks today and plugs into vitest later. Validated green by running `runAll()` under Node type-stripping.

To make audit/notification testable, `auditActionForTransition` + `notificationEventForTransition` were moved from `actions.ts` into `partner-fsm.ts` (pure, exported); `actions.ts` now imports them.
