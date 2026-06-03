---
name: ilaunchify-partner-team-model
description: "Partner team model uses TWO junction tables — PartnerMembership for org-wide membership + admin flag, and PartnerServiceMembership for service-scoped (prepress/production) work roles tied to specific PartnerService rows. Locked 2026-05-25."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

A Partner organization in iLaunchify can offer **multiple services simultaneously** (MANUFACTURING / COPACKING / LABEL_PRINTING / WAREHOUSE per existing ServiceType enum). Different humans typically handle different services. The team model reflects this with **two-tier membership**:

**`PartnerMembership`** — org-wide row, one per (partnerId, userId):
- `isAdmin: Boolean` — the org-wide PARTNER_ADMIN flag (manages company profile, billing, payouts, team, certifications)
- Carries shared user metadata: 2FA enrollment, last-active timestamp, invitedBy
- Replaces the old `Partner.userId @unique` single-user model

**`PartnerServiceMembership`** — service-scoped row, one per (partnerMembershipId, partnerServiceId):
- `roles: PartnerServiceRole[]` where PartnerServiceRole = `PARTNER_PREPRESS | PARTNER_PRODUCTION`
- Ties a specific human to a specific PartnerService row
- A user who works on both label printing and manufacturing has two rows
- A user with org-wide admin and no service work has zero rows (still sees everything via the admin flag)

**Why this shape (locked rationale):**

- Roles need to be scoped to a specific PartnerService, not a "type" of work. Mike the label-prepress tech should not see Linda's recipe-review queue even though both are "prepress" in the abstract.
- A user often holds different roles on different services (admin org-wide + prepress on label + production on warehouse). A flat `roles[]` on PartnerMembership loses the per-service distinction.
- Cascade is clean when a Partner adds/removes a service — only PartnerServiceMembership rows touched, PartnerMembership unaffected.
- Order routing already keyed by PartnerService.id, so "queues this user can see" becomes a natural query.

**Associates question (Pavel asked):** for V1, "associate" = just invite a second person with the same scope. No seniority field. Multiple equal memberships per service. Matches Stripe / Linear / Notion / Figma B2B norms. Add `seniority: LEAD | PRIMARY | ASSOCIATE` in V1.5 only if real partner demand surfaces. Initial schema migration leaves room for this by NOT exposing seniority at all (no field to default to a wrong value).

**Onboarding flow (the operational answer):**

1. Founder signs up at /signup/partner → User + Partner row + PartnerMembership(isAdmin=true). No service memberships yet — services don't exist until onboarding Phase 2 Section 3 declares them.
2. Founder completes 5-layer onboarding. Once Partner.status = ACTIVE, the /partner/team page unlocks (gated to post-ACTIVE — fraud prevention; see [[ilaunchify-operational-philosophy-v1]]).
3. Admin invites teammates via PartnerInvite. Invite modal exposes: org-wide admin checkbox + per-service role picker. Only services the Partner has activated show up in the picker.
4. Invitee accepts → User row + PartnerMembership row + N PartnerServiceMembership rows per invite grants.
5. Invitee lands on role-scoped dashboard. PARTNER_PREPRESS for LABEL_PRINTING sees only the label-printing prepress queue, etc.

**Schema needed (not yet in the codebase):**
- `PartnerMembership` (junction with isAdmin flag) — replaces Partner.userId @unique pattern
- `PartnerServiceMembership` (junction tying user-membership to specific PartnerService rows with role array)
- `PartnerInvite` (invite tokens carrying both grantAdmin flag + serviceGrants JSON)
- `enum PartnerServiceRole { PARTNER_PREPRESS, PARTNER_PRODUCTION }`
- `enum PartnerInviteStatus { PENDING, CONSUMED, REVOKED, EXPIRED }`

**Edge cases worth not forgetting:**
- Last-admin lockout protection (last PARTNER_ADMIN cannot demote themselves)
- Last-service-member soft warning (not hard block — admin chooses)
- Soft-remove only (removedAt flag, never hard-delete; preserves audit reproducibility)
- 2FA mandatory for org-wide admin, strongly recommended for PARTNER_PRODUCTION (presses Gate B = liability transfer), optional for PARTNER_PREPRESS
- Service deactivation auto-soft-removes scoped memberships; reactivation can restore
- Service added post-team-setup → "zero members yet" alert on partner dashboard

**Full spec lives in docs/PRINT_PRODUCTION_WORKFLOW.md §2.1-2.7.** Related: [[ilaunchify-partner-onboarding]] (the 5-layer model that gates everything), [[ilaunchify-operational-philosophy-v1]] (post-ACTIVE gating + role preservation rationale).
