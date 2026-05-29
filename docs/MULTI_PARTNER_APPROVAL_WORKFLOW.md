# Multi-Partner Approval Workflow (Phase H)

**Status:** Spec locked 2026-05-29 — building H1–H5 incrementally. Replaces ad-hoc partner-acceptance logic with a documented, auditable workflow.

The core idea: every production order fans out into N partner dispatches (manufacturer + optionally printer + co-packer + warehouse). Each dispatch is independently approvable; the order doesn't advance to fulfillment until every dispatch is `ACCEPTED`. Payment is held in Stripe escrow throughout.

---

## 1. Mental model

```
Creator places order (paid → Stripe escrow held)
        │
        ▼
  createDispatches() (Phase G8) fans into N rows
        │
        ▼
┌────────────────────────────────────────┐
│  Per-dispatch acceptance gates          │
│                                         │
│  PRODUCT (manufacturer): PENDING_ACCEPT │
│  LABEL   (printer):      PENDING_ACCEPT │
│  WAREHOUSE (3PL):        PENDING_ACCEPT │
└────────────────────────────────────────┘
        │ all rows = ACCEPTED
        ▼
  Order → IN_FULFILLMENT
  Stripe transfers fire (one transfer per partner)
        │
        ▼
  Production → QC → Ship → Deliver
```

Turnkey collapse: when one partner offers every service the order needs, routing produces one dispatch row. Same gate logic, just one row.

---

## 2. Per-dispatch state machine

```
                          ┌──────────────┐
                          │ CANCELLED    │
                          └──────────────┘
                                 ▲
                                 │ manufacturer reject (no reroute)
                                 │
PENDING_ACCEPT ──accept──▶ ACCEPTED ──start──▶ PRODUCING ──qc──▶ READY ──ship──▶ SHIPPED ──▶ DELIVERED
       │                        │
       │ request-changes        │ withdraw
       ▼                        ▼
CHANGES_REQUESTED          WITHDRAWN
       │                        │
       │ creator adjusts        │ auto-reroute
       │ + resubmits            ▼
       ▼                   (back to PENDING_ACCEPT on new partner)
  PENDING_ACCEPT
       │
       │ partner declines / times out / no headroom in queue
       ▼
   DECLINED ──reroute──▶ PENDING_ACCEPT (new partner)
              │
              │ no eligible partner
              ▼
           ON_HOLD (admin manual routing)
```

### State definitions

| State | Meaning | Who triggers |
|---|---|---|
| `PENDING_ACCEPT` | Waiting for the partner to approve | system (on dispatch create / reroute / adjustment resubmit) |
| `ACCEPTED` | Partner has confirmed they can do this batch at this spec | partner |
| `CHANGES_REQUESTED` | Partner needs the creator to adjust before they'll accept | partner |
| `DECLINED` | Partner explicitly declined — system attempts reroute | partner |
| `TIMED_OUT` | Acceptance deadline elapsed without action — system attempts reroute | system |
| `WITHDRAWN` | Partner accepted previously but now can't deliver — system attempts reroute | partner |
| `PRODUCING` | Production has started | partner |
| `READY` | Ready to ship after QC | partner |
| `SHIPPED` / `IN_TRANSIT` / `DELIVERED` | Existing post-acceptance lifecycle | partner |
| `CANCELLED` | Order killed, refund issued | system (after manufacturer reject) |

### Aggregate Order status

The Order row carries a derived `aggregateApprovalStatus`:

| Status | When |
|---|---|
| `AWAITING_PARTNERS` | At least one dispatch is `PENDING_ACCEPT` |
| `PARTIALLY_ACCEPTED` | Some dispatches `ACCEPTED`, others still `PENDING_ACCEPT` |
| `CHANGES_REQUESTED` | Any dispatch is `CHANGES_REQUESTED` (creator must adjust) |
| `FULLY_ACCEPTED` | All dispatches `ACCEPTED` — flips Order to `IN_FULFILLMENT` |
| `CANCELLED` | Order killed |

Derived field, not free-form — computed inside the dispatch FSM transition functions.

---

## 3. Partner actions per dispatch

Three partner actions at `PENDING_ACCEPT` time:

### 3.1 Approve
The partner confirms they can do this batch at the spec the manifest describes (substrate, packaging material, finishes, quantity, lead time, ship-to). Transitions `PENDING_ACCEPT → ACCEPTED`. Audit log row written. Creator notified.

### 3.2 Request changes
Partner flags specific manifest fields that won't work as-stated. The action requires:
- One or more `flaggedFields[]` from a structured list: `quantity`, `substrate`, `packagingMaterial`, `finishes`, `shipTo`, `leadTime`, `other`.
- A `partnerNote` (free text, max 1000 chars).
- Optional `suggestedAlternative` for each flagged field.

Transitions `PENDING_ACCEPT → CHANGES_REQUESTED`. Creator gets a notification listing the flagged fields. Order's `aggregateApprovalStatus` becomes `CHANGES_REQUESTED`. The dispatch stays in this state until the creator submits an adjustment, at which point it returns to `PENDING_ACCEPT` against a new manifest version.

Other dispatches' acceptances are **not** revoked unless the adjustment changes a field that affects them (see §4 manifest versioning).

### 3.3 Reject (decline)
Partner explicitly declines. Different downstream behavior depending on partner type:

- **Manufacturer rejects** (PRODUCT dispatch): the product can't be rerouted — it's the manufacturer's recipe. Order → `CANCELLED`, full refund to creator, all sibling dispatches cancelled, creator notified with the manufacturer's reason and a "pick another product or contact support" CTA. Admin also notified for follow-up.
- **Printer / co-packer / warehouse rejects**: the dispatch is fungible. System calls `findRouting()` to find an alternative partner of the same service type, `rerouteCount++`, new dispatch row created at `PENDING_ACCEPT`. If `rerouteCount` hits `MAX_REROUTES` or no alternative exists, the order parks at `ON_HOLD` for admin manual routing.

### 3.4 Withdraw (after acceptance)
A partner has accepted but their circumstances change (machine breakdown, supplier issue, capacity surprise). Action takes the dispatch from any post-ACCEPT pre-SHIP state back to `WITHDRAWN`, then auto-reroute behaves the same as a reject for that partner type. Creator notified with the reason. Rare but the failure mode is bad if unhandled.

### 3.5 Quality check fail
At the `PRODUCING → READY` transition, the partner runs QC. If it fails, two options:
- Redo: dispatch stays at `PRODUCING`, `qualityCheckFailedAt` stamped, `qualityCheckFailureNotes` populated. No creator notification (partner handles internally).
- Escalate: partner pings iLaunchify admin. Status moves to `ON_HOLD` for admin triage.

---

## 4. Manifest versioning

Each `OrderDispatch` carries a `manifestVersion` (incrementing int). A partner accepts the manifest *as of that version*. When the creator submits a `CHANGES_REQUESTED` adjustment, a new manifest snapshot is computed and the impacted dispatches return to `PENDING_ACCEPT` at the new version.

### Field → impacted dispatch types

| Manifest field | PRODUCT (manufacturer) | LABEL (printer) | WAREHOUSE (3PL) |
|---|---|---|---|
| Quantity | ✓ | ✓ | ✓ |
| Substrate | — | ✓ | — |
| Packaging material | ✓ | — | ✓ |
| Finishes | — | ✓ | — |
| Ship-to | — | — | ✓ |
| Lead time | ✓ | ✓ | ✓ |

When the creator changes a field, only the dispatches in its impact column have their acceptances revoked. Others stay `ACCEPTED` at the prior manifest version.

The dispatch detail page shows both the current manifest version and the version the partner accepted; if they don't match, the partner sees a "manifest changed, please re-review" banner with a diff against their accepted version.

---

## 5. Creator timeline UI

The creator's order detail page renders one row per dispatch, showing:
- Partner name + service type icon
- Current status + colored chip
- ETA on the next state (or "decision needed by Friday 4pm" for PENDING_ACCEPT)
- Partner response-time hint ("Acme avg response 4h")
- Expand-to-see-history (audit log entries for this dispatch)

If any dispatch is `CHANGES_REQUESTED`, a top-of-page banner shows the flagged fields with an `Adjust order` button that drops the creator back into the checkout wizard at the relevant step (e.g., back to step 2 with substrate prefilled to the partner's suggested alternative).

The `aggregateApprovalStatus` shows as a prominent status pill at the top.

---

## 6. Notifications matrix

| Event | Notified |
|---|---|
| Dispatch ACCEPTED | Creator (per-dispatch update) |
| Last dispatch ACCEPTED → FULLY_ACCEPTED | Creator ("Production starting!") + each partner ("Other partners have signed off, proceed to production") |
| Dispatch CHANGES_REQUESTED | Creator (with flagged fields + partner note) |
| Dispatch DECLINED (printer/copacker/warehouse) | Creator (rerouting in progress) + new partner (incoming dispatch) |
| Dispatch DECLINED (manufacturer) | Creator (order cancelled) + admin (refund triggered) |
| Dispatch WITHDRAWN | Creator + admin + (auto-reroute side: new partner) |
| Approval deadline 2h before TIMED_OUT | Partner reminder |
| All dispatches timed out / no reroute possible | Creator (admin reviewing) + admin |
| Order → CANCELLED via manufacturer reject | Creator (with reason + CTA) + admin |

All notifications flow through the existing `@ilaunchify/notifications` dispatcher with the user's quiet-hours respected.

---

## 7. Audit trail

Every transition writes an `AuditLog` row via `logAuditAs()`:

| Action | Entity | Payload |
|---|---|---|
| `DISPATCH_ACCEPTED` | OrderDispatch | `{manifestVersion}` |
| `DISPATCH_CHANGES_REQUESTED` | OrderDispatch | `{flaggedFields, partnerNote, suggestedAlternative}` |
| `DISPATCH_DECLINED` | OrderDispatch | `{reason, declineNotes}` |
| `DISPATCH_WITHDRAWN` | OrderDispatch | `{reason}` |
| `DISPATCH_REROUTED` | OrderDispatch | `{fromPartnerServiceId, toPartnerServiceId, rerouteCount}` |
| `ORDER_ADJUSTED` | Order | `{changedFields, fromManifestVersion, toManifestVersion}` |
| `ORDER_CANCELLED_BY_MANUFACTURER` | Order | `{manufacturerServiceId, reason}` |

These power the admin Order detail timeline for support traceability.

---

## 8. V1 simplifications + forward markers

What ships in V1 (Phase H):
- All five FSM transitions (accept, request-changes, decline, withdraw, QC fail)
- Manifest versioning with the impact-column model in §4
- Creator timeline UI + dispatch detail
- Notifications via the existing dispatcher

What's deferred to V1.5+:
- **Smart reroute scoring** (#153 marketplace matching). V1 picks first-eligible alternative; V1.5 scores by proximity, response time, rating.
- **Free reroute allowance vs. fee** for excessive adjustments. V1 no fee — friction would discourage legitimate iteration. V1.5 introduces a courtesy threshold (e.g. 2 free adjustments, then $X each).
- **Per-partner SLA contracts** beyond `acceptDeadlineAt`. V1 24h flat for everyone; V1.5 partner profile carries a custom window.
- **Withdrawal cost recovery** — if a partner withdraws mid-production, who pays for materials already consumed? V1 admin handles case-by-case; V1.5 standardises.

---

## 9. Build sequence

| PR | Slice |
|---|---|
| **H0** | This document |
| **H1** | Schema — DispatchStatus extensions, OrderDispatch.manifestVersion + changeRequest Json, Order.aggregateApprovalStatus, BundleStatus already present from G8 |
| **H2** | Partner-side approve / request-changes / reject actions + dispatch detail UI extensions + reroute wiring |
| **H3** | Creator-side per-dispatch timeline + "Adjust order" deep-link back into wizard |
| **H4** | Notifications matrix wired into `@ilaunchify/notifications` |
| **H5** | Audit log entries for every action, admin Order detail timeline |
| **H6** | Pavel migrate + smoke test end-to-end |

H1+H2 ship the working partner workflow. H3 is the creator's "what's happening" view. H4+H5 close the trust loop. Each PR is self-contained.

---

## 10. Open questions for V1 launch

1. **Aggregate ETA**: when partners give individual lead times, do we show the creator the max of all (true earliest delivery) or sum (worst case)? My recommendation: max — assumes parallel execution, which is how the workflow actually runs.

2. **Re-acceptance after creator adjustment**: should the original partner get first-refusal, or does it always re-open to all eligible partners? My recommendation: first-refusal with a 4h window, then open up.

3. **"Approve with reservations"**: a partner might say "yes I can do this but I need 3 extra days." Should this be a CHANGES_REQUESTED with lead-time flagged, or a separate `APPROVED_WITH_CONDITIONS` state? My recommendation: structured CHANGES_REQUESTED — keeps the FSM simple, makes the creator the decision-maker.

Pavel to decide if other answers are needed before H1 ships.
