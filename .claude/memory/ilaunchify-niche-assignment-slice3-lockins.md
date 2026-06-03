---
name: ilaunchify-niche-assignment-slice3-lockins
description: "Slice 3 niche-assignment wiring lock-ins (2026-06-01) — additive audit relations, local union, WAREHOUSE handled, E1 was stale-client."
metadata: 
  node_type: memory
  type: project
  originSessionId: c22b9193-cf99-4666-822d-5c0c8b192e68
---

Pavel-locked 2026-06-01 for the niche-assignment Slice 3 (suggestNiches engine → manufacturer accepts/edits → admin overrides → NicheAssignmentAudit row). Resolves the four lock-in items the repo agent raised:

- **NicheAssignmentAudit relations:** add *additive* `productTemplate` + `niche` relations to the model (migration + `prisma generate`, then Pavel restarts Next per [[ilaunchify-dev-prisma-restart]]). NOT a manual app-side join. Matches plan §4 + additive-migration rule.
- **NicheRuleConditionKind:** the engine in `packages/marketplace/src/types.ts` keeps a *local TS union* mirroring the Prisma enum; admin imports the Prisma version from `@ilaunchify/db`. It's a JSON-internal discriminator, not a taxonomy row → no marketplace-taxonomy-guardian needed.
- **ServiceType.WAREHOUSE:** canonical 3PL member — handle it in the niche service maps (render/no-op) so switches stay exhaustive. Niches attach to ProductTemplates, not warehouse services.
- **E1 (PartnerStatus FSM):** FALSE ALARM. `IDENTITY_VERIFIED` + `OPS_PENDING_REVIEW` exist in the schema enum (10-state FSM intact, see [[ilaunchify-partner-onboarding]]) and are wired in admin `partner-fsm.ts`. The "absent from enum" compile error was a stale generated Prisma client → `prisma generate`. No FSM change.

Sequence: mechanical hygiene (E4 null guards / E5 AuditLog.createdAt→.at rename / E6 Json cast + local-union fix) → `prisma generate` clears E1 → land the two E2 wiring fixes → commit Slice 3.

**Post-regenerate outcome (2026-06-01):** schema relations applied (`migrate dev` + `generate` ran on Pavel's Mac). The "~24 errors" collapsed to 6 in the admin app — 5 were dead/unreachable FSM-helper branches (`IDENTITY_VERIFIED`/`OPS_PENDING_REVIEW` re-checked after earlier returns in `partner-fsm.ts transitionVerb` + `actions.ts auditActionForTransition`/`notificationEventForTransition`), 1 was a `marketsCert.market` type drift (the `loadPartner` typeof-source selected the full market row; real query selects `{id,code,name}`). All fixed behavior-preservingly. E5/WAREHOUSE/local-union were already correct — no-ops.

**LATENT FSM BUG flagged for Pavel (the real E1):** the transition-helper functions in `apps/admin/.../partners/[partnerId]/actions.ts` + `lib/partner-fsm.ts` conflate FORWARD vs BACKWARD moves to the same target state. A forward `IDENTITY_PENDING_REVIEW → IDENTITY_VERIFIED` currently emits the `SECTION_NEEDS_CHANGES` notification (not `SECTION_VERIFIED`) because `notificationEventForTransition` ignores `from`. Correct fix keys on `from` per [[ilaunchify-partner-onboarding]] ALLOWED_TRANSITIONS — but it changes partner-facing email + audit-action strings on the LOCKED FSM, so left as a Pavel decision (per [[ilaunchify-operational-philosophy-v1]]).
