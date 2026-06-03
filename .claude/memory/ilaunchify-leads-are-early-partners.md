---
name: ilaunchify-leads-are-early-partners
description: /admin/leads is the partner intake funnel — Lead rows ARE Partner rows in early FSM states (LEAD/INVITED/IN_PROGRESS). No separate Lead model. Notes stored on Partner.leadNotes JSON column. Do not build a parallel Lead model.
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

`/admin/leads` and `/admin/partners` query the SAME table. Leads in iLaunchify
are not a separate concept — they are Partner rows that are still in the
intake funnel states of `PartnerStatus`:

- `LEAD` — captured from /business landing form, no auth yet
- `INVITED` — admin sent magic-link invite
- `IN_PROGRESS` — partner started onboarding accordion
- `DRAFT` / `UNDER_REVIEW` / `IDENTITY_PENDING_REVIEW` / `OPS_PENDING_REVIEW`
  — verification chain
- `ACTIVE` / `INTEGRATION_ENHANCED` / `SUSPENDED` / `REJECTED` — terminal-ish

The `/admin/leads` surface filters Partner rows to the early states. The
`/admin/partners` surface buckets everything. They share `Partner`, `User`,
`PartnerService`, `PartnerMembership`, `AuditLog`.

**Notes storage on a Lead**: there is no `LeadNote` model. Free-text admin
notes + assignment metadata are stamped on `Partner.leadNotes` as a
`{ notes: [{ id, body, authorId, createdAt }], assignedToUserId }` JSON
blob. The legacy free-form application JSON some leads still carry is
rendered behind a `<details>` toggle in the Snapshot card.

**Activity timeline**: sourced from `AuditLog` filtered to
`entityType='Partner' AND entityId=lead.id` — the same audit stream as the
full partner record.

**Why this matters:**

**Why:** Pavel's intake funnel is unified. Splitting Lead and Partner into
two models would duplicate identity, conversion-tracking, and audit
plumbing for no business gain. The state machine already encodes
"leadiness."

**How to apply:**
1. Never propose a `Lead` model in schema changes. Use `Partner` + a
   `status` filter.
2. When wiring marketing-funnel signals (UTM source, form-fill
   timestamps, qualification reason), put them on `Partner` or
   `Partner.leadNotes` JSON, not a new table.
3. When the user says "lead" they mean an early-stage Partner row. When
   they say "partner" they usually mean ACTIVE-ish.
4. `/admin/leads` and `/admin/partners` must stay consistent — any new
   column on Partner should surface in BOTH lists where relevant.
5. If we ever need creator-side leads (signup intent without a
   CreatorProfile), that would be a separate concept — but for the
   business landing's "Talk to sales" funnel, it's all Partner.

See [[ilaunchify-partner-onboarding]] for the 10-state FSM details.
