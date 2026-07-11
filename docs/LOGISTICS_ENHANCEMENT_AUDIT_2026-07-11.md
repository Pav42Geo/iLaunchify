# Logistics Enhancement Audit — 2026-07-11

Full audit of the logistics substrate (`packages/shipping`, `packages/orders`, admin/partner/creator surfaces) against the business model (orchestration platform, not matching marketplace) and its dependencies, plus a prioritized enhancement plan. Companion to `docs/LOGISTICS_AND_FULFILLMENT.md` (L1–L9 LOCKED) and `AUDIT_2026-07-09_CONSISTENCY.md`.

---

## 1. Executive summary

The logistics layer is **deliberately over-built and gated off**. All nine shipping modules exist, are Prisma-free, and are clean (zero TODO/FIXME in `packages/shipping`). L0–L4a are BUILT; the 12 `LogisticsSetting` gates default OFF; the four blockers are **external accounts, not code**: EasyPost env, Amazon SP-API approval, ShipBob agreement, insurance verification.

**The real finding:** the constraint on logistics is no longer building — it's (a) flipping what's already live-capable, (b) closing the small number of internal seams that block the V2 moat (per-hop shipping / application-point resolver), and (c) making "not done" visible, since incompleteness is expressed structurally (OFF gates, disabled buttons, one named stub) and is invisible to a grep.

**Strategic frame:** in the orchestration thesis, logistics is the SHIP leg of the workflow graph and the **pooling + buffer-inventory moat (V2, Modes 2–3) depends on per-hop legs and the §8 application-point resolver** — that is the highest-leverage internal build remaining.

---

## 2. Audit — current state

### 2.1 BUILT and wired end-to-end
- Routing + dispatch creation + merit-fee snapshot at routing (`packages/orders/routing.ts`).
- FC selection: V1 nearest (`fc-selector.ts`) + V1.5 weighted scorer + rotation band (`fc-scorer.ts`, auto-activates at ≥3 eligible nodes) + `FcAwardLog` + public-pool eligibility (`fc-pool.ts`).
- Checkout 4-destination selection, server-gated (CREATOR_ADDRESS + WAREHOUSE_PARTNER live; HOLD + CHANNEL_INBOUND gated).
- Partner ship panel (doc gate + QC checklist), FC inbound queue → `InboundReceipt`/`InboundReceiptLine`, outbound release queue, receiving-exceptions mediation, SLA watchtower (the last three are **newer than the design memory** — Partner-Role-Accounts extensions).
- Storage accrual math → partner billing display; manifest generation (FSMA-shaped); EasyPost tracking webhook (HMAC, forward-only).
- Admin logistics console: gates, shipments (751-line list), carriers CRUD, FCs, channel plans, SLA, exceptions, order-level FC override.

### 2.2 BUILT-BUT-DORMANT (flip-ready)
| Item | Gate / flag | Blocker |
|---|---|---|
| EasyPost rail (rate/buy/child-users, DI'd HTTP) | `carrier:easypost` + `EASYPOST_API_KEY`/`WEBHOOK_SECRET` | Account + env only |
| HOLD_AT_MANUFACTURER + CHANNEL_INBOUND destinations | LogisticsSetting | Admin flip (+ SP-API for confirm) |
| Cold chain (CHILLED/FROZEN classes, `cold-pack.ts` — **0 app callers**) | per-storage-class gates | V2 by design (L1) |
| Merit withhold + rotation engines | `MeritPolicy.enabled` / `RotationPolicy.enabled` / `FcRotationPolicy` | Pavel flip |
| Storage billing **charge execution** | payments verification | `STRIPE_TESTMODE_VERIFICATION.md` |

### 2.3 STUBBED / MISSING
- `transitionDispatch` (`dispatch-fsm.ts:44`) throws — real transitions use `assertDispatchTransition` + inline txn. Named Code handoff.
- SP-API writer: plans stay DRAFT `'pending-spapi'`; "Confirm with Amazon" ships disabled.
- Insurance: gate + schema fields, no rating/binding logic (checklist = `docs/SHIPPING_INSURANCE_VERIFICATION.md`).
- Referenced-but-absent adapters: ShipBob `FulfillmentConnector`, ShipEngine LTL, Loadsmart reefer, WFS, FBT (gates/enums/registry rows exist).
- **Test gaps:** no unit tests for `cold-pack.ts`, `tracking-webhook.ts`, `receiving-checklist.ts`; `gateway.ts` only indirectly covered.
- Dormant schema surface (fine, but track): `ShipmentLeg` async-freight timeline + LTL fields, `PLATFORM_LTL`/`PLATFORM_BROKER` account types, `ChannelInboundPlan` SP-API fields, `INSURANCE_CERT`.

### 2.4 Accepted V1 limitations (per roadmap — not bugs)
FC fee snapshot at receipt (not checkout) · CUFT accrual shows "—" · manual release tracking until EasyPost FC lanes · RAMP is a review ritual, no hard routing block.

### 2.5 Open items already on the books
- `FOLLOWUP_PRINTER_FC_AUDIT_2026-07-09.md`: live eyeball verification of printer/FC role paths, blocked only on local CockroachDB coming back.
- PS-8 print-coverage tables **unmigrated** (needs `pnpm db:push && db:generate && rm -rf apps/*/.next`); PS-8b RFQ must not merge before the push.
- `FEE_SHIPDISPATCH_MERIT_PATCH_2026-07-09.md`: merit freeze at `shipDispatch` — Code's patch, no-op until MeritPolicy flips.
- §8 open policy [PAVEL]: who eats printer→applier freight; checkout fallback order UNRESOLVED.

---

## 3. Gap analysis vs the business model

The orchestration thesis says: decompose orders into a partner workflow graph and **hide it**. Measured against that:

1. **Multi-hop is modeled, but shipping is still effectively single-leg-aware.** `OrderDispatch.shipToNodeId` + per-hop costed legs (§8, PS-7) aren't landed. Without them, printer→applier→FC chains (the "honey problem") can't be costed or routed honestly — and **Modes 2–3 (pooling, buffer inventory) are impossible**. This is the single biggest internal gap.
2. **Signals exist, consumers don't.** `InboundReceipt`, `ReceivingDiscrepancy`, SLA stamps, `FcAwardLog`, doc-gate outcomes are recorded but nothing closes the loop: no Risk Center R5 detectors (proposal only), no feed into Merit/rotation, and per the notifications audit `DISPATCH_RECEIVED` fan-out is dead (3 sites in `routing.ts`).
3. **"Hidden orchestration" needs an ops cockpit.** Hiding complexity from creators means admin must see it all. The SLA watchtower + exceptions inbox are a strong start; there's no single logistics **readiness/health board** (which gates are on, which envs present, live vs dormant rails, spend counters — the V2 "integration spend observability" item).
4. **Charging lags capability.** Storage accrual, first-leg margin, merit withhold are all computed but not collected (Stripe verification + flips). Revenue-bearing logistics is one verification away.
5. **Quality posture is inverted in one spot:** the only untested modules (`cold-pack`, `tracking-webhook`, `receiving-checklist`) are exactly the ones that touch physical-world correctness and money-adjacent QC.

---

## 4. Enhancement proposals (prioritized, dependency-aware)

### P0 — Flip & finish (days; no new surface area)
1. **EasyPost pilot**: set env keys, flip `carrier:easypost`, run one real label buy + webhook round-trip on a test partner. Everything else is coded. *Dep: EasyPost account.*
2. **Complete the printer/FC live verification** (FOLLOWUP doc) once local Cockroach is back — closes the last L-series QA item.
3. **Run the PS-8 migration** (`db:push` + `db:generate` + `.next` purge) so print-coverage/RFQ stops blocking merges.
4. **Test the untested**: unit tests for `cold-pack.ts`, `tracking-webhook.ts` (incl. HMAC negative cases), `receiving-checklist.ts`; direct `gateway.ts` test with fake HTTP. Add to `run-vitest-suites.mjs`.
5. **Resolve `transitionDispatch`**: either wire it as the single FSM entry (preferred — matches "every state change through an FSM helper") or delete it and bless `assertDispatchTransition` as the pattern. Coordinate with Code (their named handoff).
6. **Wire `DISPATCH_RECEIVED` notifications** (3 dead sites in `routing.ts` → `dispatchToPartnerService`) — cheap, and receiving is now first-class so the event finally has real payloads.

### P1 — The natural next build: per-hop shipping + closing the loop (the moat prerequisite)
7. **Land §8 / PS-7: application-point resolver + per-hop legs.** `resolveApplicationPoint`, `FcValueAddedService` (RELABEL/KITTING), `OrderDispatch.shipToNodeId`, per-hop costed `ShipmentLeg`s. The spec itself says the validator must land **before PS-3 printer-pinning goes live**, and pooling/buffer inventory (V2 moat) sits on top of it. Needs the two [PAVEL] policy calls first: who eats printer→applier freight, and checkout fallback order.
8. **Logistics readiness board** (admin, v2 surface pattern): one page showing each gate (on/off), env presence (reuse integrations registry), rail status (live/dormant/stubbed), and counters (labels bought, rate calls, accrued storage, award-log volume). Pulls forward the V2 "integration spend observability" item cheaply and fixes the "not-done is invisible" problem.
9. **Feed logistics signals into Merit/Risk.** Minimal version, no Risk Center build: derive per-partner receiving-discrepancy rate + SLA-breach rate from existing tables and surface them in the Merit console as inputs (shadow, like everything else). This is the LOCKED hard-gate-vs-soft-score discipline applied to data you already collect.
10. **Turn on money where math is live** once `STRIPE_TESTMODE_VERIFICATION` passes: storage billing charge execution (L9), first-leg margin bps, and let Code land the shipDispatch merit patch (stays 0 until MeritPolicy flips).
11. **FC fee snapshot at checkout** (upgrade from at-receipt) + CUFT accrual — retire two accepted V1 limitations while touching the same code.

### P2 — External-dependent adapters (build behind gates as accounts land)
12. **SP-API writer** (L3 completion): OAuth + inbound-plan confirm; enables the disabled button, fills the dormant `ChannelInboundPlan` fields. *Dep: Amazon dev approval.* Then MCF delegation per Channel spec.
13. **ShipBob `FulfillmentConnector`** (L4/V1.5). *Dep: master agreement.* Consider evaluating **Trackstar earlier** than V2 — if it covers ShipBob-class WMSs, one abstraction may replace N connectors and shrink L4.
14. **WFS → FBT adapters** (L7 order), **insurance** rating/binding once the verification checklist passes, **EasyPost FC lanes** for release tracking (retires the manual-tracking limitation).

### P3 — V2 moat (sequenced after P1 #7)
15. **Buffer inventory + pooling (Modes 2–3)**: platform-owned/committed buffer stock at FCs, pooled production runs; requires per-hop legs, InventoryPool/Ledger (shared with Channel spec), and the readiness board for ops control.
16. **Cold chain gate-on** (CHILLED/FROZEN): Lineage-class FC + Loadsmart reefer async rail (schema already has the states) + quote desk + FSMA clause + spoilage rider. `cold-pack.ts` finally gets callers.
17. **Split-destination orders** (part FBA / part FC) — natural once per-hop legs exist. Retail EDI last.

---

## 5. Recommended sequence

**Now (this sprint):** P0 items 1–6 — mostly flips, tests, and one FSM decision. Output: EasyPost live in test mode, QA closed, notification loop fixed.
**Next:** Pavel resolves the two §8 policy calls → build P1 #7 (per-hop + resolver) as the flagship item, with #8 readiness board alongside. This unblocks PS-3 pinning AND the V2 moat simultaneously — the highest-leverage internal work in the repo.
**Then:** money flips (#10–11) as soon as Stripe verification passes; adapters (#12–14) strictly as external accounts land — no speculative building, matching the "operational trust > margin" philosophy.
**V2:** pooling/buffer (#15) first among moat items, since cold chain and split-destination both get easier on top of it.

**Decisions needed from Pavel:** ~~§8 freight-cost bearer~~ **DECIDED 2026-07-11: creator pays by default, admin-tunable `interPartnerFreightBearer`** · ~~§8 checkout fallback order~~ **DECIDED 2026-07-11: no creator-facing fallback — publish-gated coverage state + event-driven coverage guard + admin assignment override + auto-RFQ/auto-relist (PRINT_PROVIDER_SELECTION §8.5). PS-7 is now unblocked.** · flip dates for `carrier:easypost`, MeritPolicy, RotationPolicy/FcRotationPolicy · whether Trackstar evaluation moves up to V1.5 (#13) · `transitionDispatch` wire-or-delete (with Code).
