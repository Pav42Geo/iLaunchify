# Shared Design Workspace — Co-Creation Studio × Design Studio

**Status:** LOCKED — D-W1…D-W6 all locked to the recommendations (Pavel 2026-07-13).
W0 substrate BUILT same day (DesignCollaborator + Design.roomId + UserRole.DESIGNER +
designerSeatCap in @ilaunchify/plans + pure access/edit-lock engine in
@ilaunchify/orders design-collaboration.ts, tested). Build tracker:
docs/BUILD_CHECKLIST_DESIGN_WORKSPACE_2026-07.md · flow prototype:
design/design-workspace-flow-prototype.html
**Date:** 2026-07-13 · Research: Figma + Canva collaboration models (sources at bottom)
**Relates to:** docs/CO_CREATION_SELF_DESIGN_ON_DIELINE_SPEC.md (D-S1…D-S6), Studio versioning v2
(Alternates), Rooms & Messages hub, Legal CMS, anti-circumvention policy.

The third design door from the DIY conversation: the creator invites a trusted
packaging designer to work WITH them on the label design, inside our Studio,
scoped to one collaboration room. This doc plans that workspace.

---

## 1 · What Figma and Canva actually do (verified 2026-07)

**Figma**
- Real-time multiplayer via a custom CRDT-based sync engine — every editor's
  cursor + selection visible live; up to 200 editors per file. This engine took
  Figma years and is their core moat.
- Roles per file/project: **viewer** (view, comment, follow, cursor-chat) /
  **editor** / admin. Share modal grants per-file or per-project.
- **Branching → request review → merge**: branches are private exploration;
  a named reviewer previews changes side-by-side or as an overlay before merge.
- **Open sessions** (FigJam): time-boxed (24h) guest access without an account,
  optional password; when the session ends the file locks for outsiders but
  stays viewable. Guests-to-org resources are permission-restricted.

**Canva**
- **Approval workflow**: designer clicks "Request approval" → chosen reviewer(s)
  notified in-app + email → approve or send feedback. **Publish options stay
  locked until approved, and any edit after approval voids it** (re-approval
  required). Group approvers: any ONE member of the group approving is enough.
- **Brand Kit + Brand Templates with template locking**: admins lock parts of a
  template so collaborators can only edit the intended regions.
- Same-design simultaneous editing (Google-Docs style), comments + @mentions,
  version history; team roles decide who manages brand/content/invites.

## 2 · What we TAKE, what we SKIP, and why

| Pattern | Verdict | Our shape |
|---|---|---|
| Canva approval workflow (request → notify → approve/changes; edit voids approval) | **TAKE — core** | Maps 1:1 onto the LABEL BuildObject FSM we already run. Two stages: designer→creator (internal), then creator→maker (room proof, D-S3 inversion). Edit-after-approval reopens the object — we already do this. |
| Canva template locking | **TAKE — already stronger** | Our locked layers: die-line substrate immutable, regulated panels deterministic + painted last. The designer can ONLY touch the brand layer. |
| Figma roles viewer/commenter/editor | **TAKE** | `VIEW / COMMENT / EDIT` on a DesignCollaborator row, scoped to ONE design + room — never org-wide. |
| Figma open-session time-boxing | **TAKE (adapted)** | Invites expire (14d to accept, engagement-scoped after); access auto-revokes when the LABEL object is approved or the room closes. No account-less editing — our platform is invite-only (AUTH_ENTRANCE S1) and the die-line is NDA'd IP, so guests get real (minimal) accounts. |
| Figma branching/merge | **ADAPT** | Our Alternates ARE the branches (tier-capped Maker 2 / Builder 5 / Agency ∞). "Merge" = promoting an alternate + submitting the composed proof to the room. No new mechanism needed. |
| Figma live multiplayer (CRDT cursors, 200 editors) | **SKIP V1 — phase it** | Years of engine work; wrong first bet for a 2–3 person label workspace. V1 = turn-based edit lock + presence ("Maria is editing — you're viewing"), riding the PresenceState heartbeat we shipped. True co-editing is Phase W3, and we BUY it (Yjs/Liveblocks), never build. |
| Canva simultaneous editing | **SKIP V1** | Same reason. Turn-based covers the real workflow (designer works, creator reviews) with zero conflict risk. |

## 3 · Our model

**Actors.** Creator (room owner) · invited Designer (guest) · Maker (reviews the
final proof only — the designer NEVER interacts with the maker directly).

**Scope wall (IP).** The designer sees exactly: the Studio in room context
(die-line substrate + regulated layer rendered, brand layer editable), the
design's versions/alternates/comments, and the creator's Brand Kit. The
designer NEVER sees: the recipe/formula, milestones/amounts, room chat, the
brief's private payload, or the maker's identity beyond what the die-line
itself reveals. Legal: invite acceptance requires signing a designer NDA via
the Legal CMS (a `LegalDocument` audience=DESIGNER — counsel drafts with D-CC4).
Anti-circumvention `contactLeakPolicy` applies to Studio comments too.

**Approval chain (Canva-shaped, two stages).**
1. Designer works → "Ready for review" → creator notified.
2. Creator approves internally (or requests changes — pins/comments in Studio).
3. Creator (only the creator) composes + submits the proof to the room.
4. Maker approves / requests changes (D-S3 inversion). Changes flow back down
   the same chain. Edit after any approval voids it — FSM reopen, re-approve.

**Turn-based editing (V1).** One active editor per design at a time (soft lock
with takeover: "Request edit control" → current editor confirms or 2-min
timeout). Presence line + avatars from the existing heartbeat. Every version
save is attributed (who + when) — the audit trail IS the collaboration record.

## 4 · Phases

- **W0 — no-regret substrate (build with slice 3):** `DesignCollaborator`
  model (uuid): designId, roomId, invitedEmail, userId?, role VIEW/COMMENT/EDIT,
  status INVITED/ACTIVE/REVOKED, ndaAcceptedAt, expiresAt. Design.roomId FK
  (already planned for the room adapter). AuditLog on every grant/revoke.
  Nothing user-visible yet.
- **W1 — invited designer, turn-based:** invite by email (PartnerInvite token
  pattern), minimal guest account (D-W1), NDA gate, Studio in room context with
  edit lock + presence line, internal request-approval loop, notifications
  (DESIGN_REVIEW_REQUESTED / DESIGN_REVIEW_DECISION), revoke + expiry.
- **W2 — richer presence:** live viewport-follow ("watch Maria"), Studio-side
  comment pins with @mentions, faster presence polling on canvas.
- **W3 — true co-editing (only if demanded):** CRDT via a bought engine
  (Yjs/Liveblocks) behind the same seam. Explicitly NOT a commitment.

## 5 · Decisions for Pavel

- **D-W1 — Guest identity.** Recommend: real User with a new minimal role
  (`DESIGNER`) whose entire app surface is the Studio(s) they're invited to +
  notifications. No creator dashboard, no marketplace. (Alt: full creator
  account — rejected: over-grants; account-less: rejected — NDA + audit need
  identity.)
- **D-W2 — Who can invite + seat caps.** Recommend: creator only (owner), caps
  by tier — AMENDED 2026-07-13: Maker 0 (Builder+ perk, upsell shown in-room) / Builder 2 / Agency 5 concurrent designer seats, admin-tunable in Co-Creation Settings (same
  ladder as Alternates; monetization surface).
- **D-W3 — Designer submit rights.** Recommend: designer can mark "ready for
  review" but ONLY the creator submits the proof to the room (keeps the room
  two-party, liability clean, matches D4 ownership).
- **D-W4 — Edit concurrency.** Recommend: turn-based lock V1 (soft lock +
  takeover request), CRDT deferred to W3.
- **D-W5 — Access lifetime.** Recommend: auto-revoke at LABEL approval or room
  close, whichever first; creator can revoke anytime; unaccepted invites die
  at 14 days.
- **D-W6 — NDA gate.** Recommend: hard gate — no Studio render until the
  designer NDA is accepted (Legal CMS, MATERIAL-change re-accept applies).
  Counsel must bless the copy (rides the D-CC4 work).

## 6 · Why this fits what we've already built

PresenceState heartbeat → the presence line. Legal CMS → the NDA gate.
PartnerInvite → the invite token mechanics. Alternates + tier caps → branching.
LABEL FSM + pin board → both approval stages. Contact-leak policy → guest
comms guard. AuditLog → the attribution trail. The only genuinely new pieces
are DesignCollaborator, the guest role, and the edit lock.

## Sources

- https://www.figma.com/blog/how-figmas-multiplayer-technology-works/
- https://www.figma.com/blog/multiplayer-editing-in-figma/
- https://help.figma.com/hc/en-us/articles/360039970673-Team-permissions
- https://help.figma.com/hc/en-us/articles/360063144053-Guide-to-branching
- https://help.figma.com/hc/en-us/articles/5691414603543-Request-a-branch-review
- https://www.figma.com/blog/introducing-open-sessions/
- https://help.figma.com/hc/en-us/articles/4410786053911-Invite-visitors-to-an-open-session
- https://help.figma.com/hc/en-us/articles/4410793238167-Restrict-or-prevent-guest-access
- https://www.canva.com/help/get-approval/
- https://www.canva.com/help/design-approval-for-enterprise/
- https://www.canva.com/help/review-designs/
- https://www.canva.com/help/roles-and-permissions/
- https://www.canva.com/learn/approval-process-workflow/
- https://www.canva.com/solutions/brand-management-tools/

## Downgrade policy (Pavel, 2026-07-13)

**Principle: doors close for NEW work; existing commitments run to completion**
(same "never strand in-flight work" rule as the module kick-off toggle — a room
is a commercial engagement with a maker who has committed labor; a plan change
must never break it).

On Builder/Agency → lower tier:
- **New briefs:** blocked (D-CC1 tier gate — already enforced in postBrief).
- **In-flight briefs/rooms:** fully functional to completion — shortlist,
  select, room chat, submissions, reviews, milestones, CLOSED_WON
  materialization. No tier gate exists anywhere on the room path, on purpose.
- **DIY label design:** stays available on every tier (it's the creator's own
  labor on their own engagement).
- **Designer seats:** REVOKED above the new tier's cap, newest seats first so
  the longest-running engagements survive (`enforceDesignerSeatCapForCreator`,
  wired into `setCreatorTierWithAudit` — fires on admin demotes, Stripe
  cancellations, and dunning downgrades alike; audit action
  `DESIGNER_SEATS_TIER_DOWNGRADE_REVOKED`). Best-effort with the invite gate
  as the hard stop.
- **Sidebar/briefs index:** stays visible while the creator has briefs in
  flight (existing `showBriefs` rule) — access recedes only when the work ends.
