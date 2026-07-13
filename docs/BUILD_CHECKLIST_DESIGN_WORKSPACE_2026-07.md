# Build Checklist — DIY Label Design + Shared Design Workspace

**Living tracker** (same convention as BUILD_CHECKLIST_ONBOARDING_2026-07.md — check items off as built).
Specs: docs/CO_CREATION_SELF_DESIGN_ON_DIELINE_SPEC.md (D-S1…D-S6 LOCKED 2026-07-13) ·
docs/SHARED_DESIGN_WORKSPACE_SPEC.md (D-W1…D-W6 LOCKED 2026-07-13).
Flow prototype: design/design-workspace-flow-prototype.html (interactive — mirrors this list).

Owners: **[Code]** Studio/die-line zone · **[Cowork]** room/messaging/UI-shell zone · **[Pavel]** ops/decisions · **[Counsel]** legal copy.

## Phase A — DIY design loop (self-design-on-dieline)

- [x] A1 · Contract: `labelProofPayloadSchema` + `isLabelProofPayload` (@ilaunchify/orders) — **[Code]** (f5a3b62c)
- [x] A2 · Pure composer `composeLabelProofSvg` (dieline + brand + regulated painted last) — **[Code]** (f5a3b62c)
- [x] A3 · Storage key `labelProofKey` (room+object-scoped, partnerFile immutable) — **[Code]** (f5a3b62c)
- [x] A4 · Guarded `creatorSubmitLabelProof` (packaging-approved + dieline-provenance gates) — **[Code]** (627960c2)
- [x] A5 · LABEL viewer: proof renders from `payload.svgKey`, mm-sized, pins overlaid, both apps — **[Cowork]**
- [x] A6 · "Design the label" affordance (creator, PACKAGING approved → `/rooms/[roomId]/label`) — **[Cowork]**
- [x] A7 · messaging.ts `InputJsonValue` tsc blocker fixed — **[Cowork]**
- [x] A8 · Studio front-end: room-context editor at `(studio)/rooms/[roomId]/label` (substrate = pinned die-line `normalizedSvg` per D-S2; locked layers; save via `Design.roomId`) — **[Code]** (slice 3, unblocked)
- [x] A9 · Review inversion (D-S3): non-submitter reviews — service choke-point guard in `reviewObject` + real `partnerReviewObject` action + shell shows review controls to the non-submitter side — **[Cowork]**
- [ ] A10 · Compliance pre-check gates the proof submit (reuse `checkRoomLabelReadiness`) — **[Code]** in the Studio submit + **[Cowork]** room-side copy
- [ ] A11 · Regulated layer composed from approved RECIPE (deterministic panels into `composeLabelProofSvg`) — **[Code]** (spec follow-up)
- [ ] A12 · `normalizedSvgKey` backfill for verified die-lines — **[Code]** (spec follow-up)
- [ ] A13 · DESIGN milestone kind (maker's internal design service, priced via terms flow) — **deferred by D-S6**

## Phase B — Shared workspace W0 (no-regret substrate)

- [x] B1 · Schema: `DesignCollaborator` (+role/status enums), `Design.roomId` soft FK, `UserRole.DESIGNER` — **[Cowork]**
- [x] B2 · `designerSeatCap` tier ladder (Maker 1 / Builder 2 / Agency 5) in @ilaunchify/plans — **[Cowork]**
- [x] B3 · Pure access engine (`evaluateCollaboratorAccess` — NDA hard gate; `canGrantDesignerSeat`; `resolveEditLock` turn-based + takeover) + tests — **[Cowork]**
- [x] B4 · Audit entity type `DesignCollaborator` — **[Cowork]**
- [x] B5 · `pnpm db:push && pnpm db:generate` for W0 models — **[Pavel]** (2026-07-13)

## Phase C — Shared workspace W1 (invited designer, turn-based)

- [ ] C1 · Designer NDA document (Legal CMS, audience=DESIGNER) — **[Counsel]** copy · **[Pavel]** publish — HARD GATE for C4+
- [x] C2 · Invite flow: creator invites by email (seat-cap guarded), token accept at `/design-invite/[token]` → minimal DESIGNER account (role flips only for footprint-free accounts) — **[Cowork]**
- [x] C3 · Room-side seat management card (invite / pending / revoke; auto-revoke wired at LABEL approval + closeRoomWon; switch-archive hook = one line in Code's actions.ts) — **[Cowork]**
- [x] C4 · NDA acceptance gate wired (accept page renders `designer-nda` from Legal CMS; no doc published = honest hold, access dead by construction; Studio-side check = `getCollaboratorAccessForUser`) — **[Cowork]** · **[Code]** Studio check rides A8's guard
- [ ] C5 · Designer's app surface: DESIGNER role routing (invited Studios + notifications ONLY; scope wall enforced) — **[Cowork]** guards + **[Code]** Studio context
- [x] C6 · Edit lock persisted + Studio presence line ("Maria is editing — you're viewing", takeover flow) — **[Code]** (engine ready in @ilaunchify/orders)
- [x] C7 · Internal approval loop: `DesignReviewRequest` + request/decide services + both notifications; creator decides from the room's Design team card; `requestDesignReviewAction` exported for Code's Studio "Ready for review" button — **[Cowork]** done · **[Code]** Studio affordance pending
- [ ] C8 · Contact-leak policy applied to Studio comments — **[Cowork]**
- [x] C9 · Version attribution surfaced (who saved each DesignVersion) — **[Code]**

## Phase D — W2 polish (after W1 ships)

- [ ] D1 · Live viewport-follow ("watch Maria") on canvas
- [ ] D2 · Studio comment pins + @mentions
- [ ] D3 · Faster canvas presence polling

## Phase E — W3 (explicitly NOT committed)

- [ ] E1 · True co-editing via bought CRDT engine (Yjs/Liveblocks) — only if creator demand proves out

## Sequence gates

1. B5 unblocks everything in C that touches the DB.
2. C1 (counsel NDA) hard-gates C4 and therefore any real designer access — invite UI (C2/C3) can build against a placeholder doc but MUST NOT go live before C1.
3. A8 (Code's Studio route) unblocks A9/A10 end-to-end testing.
4. Phase D starts only after C ships and gets real usage.
