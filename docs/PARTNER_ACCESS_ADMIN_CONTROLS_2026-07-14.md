# Partner Access & Opportunity Controls — Admin Management Spec

**Status:** DRAFT proposal for Pavel · 2026-07-14
**Companion to:** `docs/PUBLIC_PARTNER_PROFILE_SPEC_2026-07-14.md` (the disclosure model this governs).

---

## 1. What this is

A single admin control plane that turns every disclosure / sharing / marketplace decision into a
**lever** an admin can **lock or unlock** — set once as a **global default**, then **override per
partner account**. It answers "what is this partner allowed to do, who set it, and why."

Two axes:
- **Global default** — the platform-wide policy (also the master kill switches).
- **Per-partner override** — a tri-state that beats the default for one account.

Every lever resolves through: `partner override → global default → hard prerequisites` (see §5).

---

## 2. The lever catalog ("opportunities")

Each lever is tri-state per partner: **Inherit** (use global) · **Allow** (force on) · **Deny**
(force off). Each has a global default. Mapped to the data field it drives.

### Group A — Identity & Disclosure
| Lever | Controls | Backed by |
|---|---|---|
| **A1 Public profile** | Off / Invited-only / Public | `participationMode` + `profilePublishedAt` |
| **A2 Disclosure level** | FULL / CITY_STATE / ANONYMOUS (nameable in context) | service `disclosureLevel` |
| **A3 Profile sharing** | Share button + public link active | new flag |
| **A4 Named reviews audience** | Anonymous-always / **Paid-only** (default) / Any-logged-in | new policy |
| **A5 Ratings & reviews visible** | show/hide the reviews block | new flag |
| **A6 Certifications visible** | show/hide certs publicly | new flag |
| **A7 Merit badge visible** | show/hide the earned tier badge (never the fee) | new flag |

### Group B — Marketplace Opportunities ("get work")
| Lever | Controls | Backed by |
|---|---|---|
| **B1 Discoverability** | listed in marketplace search | new flag |
| **B2 Creator brief intake** | eligible for the co-creation Brief opportunity pool | co-creation |
| **B3 Print rotation** | eligible for Smart Rotation awards (pure printers) | RotationPolicy |
| **B4 Capability RFQ / coverage** | eligible for capability RFQs + print coverage | print coverage |
| **B5 Nomination eligibility** | can be nominated as a co-partner | nomination model |
| **B6 Sample order intake** | accepts sample orders | sample policy |
| **B7 Quote requests / messaging** | creators may request a quote / message | messaging |

### Group C — Commercial (already exist — surfaced here read-mostly)
| Lever | Controls | Backed by |
|---|---|---|
| **C1 Merit tier** | audited hand-set override | existing `/tiers` |
| **C2 Fee override** | rare admin fee adjustment | existing fee model |

*(C1/C2 are shown for context + audit continuity; they keep their current owners/screens.)*

---

## 3. States per lever (per partner)

- **Inherit** — follow the global default (the norm).
- **Allow** — force ON for this partner (e.g., early-access a marquee partner to public profiles).
- **Deny** — force OFF (e.g., restrict a partner under review from receiving briefs).
- **Pending** — partner has *requested* an unlock; awaiting admin decision (see §6).

Overrides may carry an optional **expiry** (temporary grant/restriction) and **require a reason**.

---

## 4. Global policy (defaults + master switches)

Expand the existing `PartnerProfileSetting` singleton (or a new `PartnerAccessPolicy` singleton)
to hold a default for every lever, plus **master kill switches**:
- `publicProfilesEnabled` (master — off = no public profiles platform-wide; the current
  `PartnerProfileSetting.enabled`).
- `defaultNamedReviewsAudience = PAID_ONLY`.
- `defaultDisclosureLevel`, `defaultDiscoverable`, `defaultBriefIntake`, etc.
- `minCreatorTierForIdentity` (the existing dial) — **relabeled**: "tier to see identity in
  context (PDP link + named reviews)", NOT "tier to load the profile page" (per companion spec §7).

A master switch flipped OFF wins over any per-partner **Allow** (safety).

---

## 5. Effective-state resolver

One pure function, reused by every surface (admin, marketing route, reader, rotation engine):

```
resolvePartnerOpportunity(partner, lever, viewerCtx?) →
  { effective: boolean|enum, source: 'override'|'default'|'prerequisite', blockedReason?: string }
```

Resolution order:
1. **Master kill switch** (global) — if OFF, effective = OFF, source = default.
2. **Partner override** (Allow/Deny) if set.
3. Else **global default**.
4. **AND hard prerequisites** — non-negotiable gates that can only *subtract*:
   - Public profile ⇒ requires FULL disclosure + published + partner ACTIVE + not suspended.
   - Named reviews ⇒ requires viewer is paid (A4) — the tier gate.
   - Print rotation ⇒ requires **pure printer** (mfr/co-packer who also print never rotate — locked rule).
   - Brief intake / discoverability ⇒ requires ACTIVE + onboarding complete.
   - Nameability ⇒ never exceeds the partner's own `disclosureLevel` opt-in.

The resolver returns **why** a lever is blocked so the admin UI can explain it ("Denied by
prerequisite: partner has not published a profile").

---

## 6. Partner-initiated requests (optional, phase 2)

A partner can **request** an unlock from their app (e.g., "make my profile public", "join print
rotation"). Creates a `PartnerAccessRequest` → shows in an admin **queue** → approve/deny writes
the override + `AuditLog` + notifies the partner. Turns access into a governed workflow, not a
silent DB edit.

---

## 7. Data model (additive — no destructive changes)

- **Global:** extend `PartnerProfileSetting` → `PartnerAccessPolicy` (singleton) with a column per
  default + master switches.
- **`PartnerAccessOverride`** — `id (uuid)`, `partnerId`, `lever (enum)`, `state (INHERIT|ALLOW|DENY)`,
  `value (String?)` for enum levers (e.g. disclosure), `reason`, `expiresAt?`, `setById`,
  `createdAt`. `@@unique([partnerId, lever])`.
- **`PartnerAccessRequest`** (phase 2) — `partnerId`, `lever`, `status`, `note`, `decidedById`, …
- **Audit:** every write → `AuditLog` (new entity type `PartnerAccessOverride` in `packages/audit`).
- New models use `uuid()` (freeze rule). Apply via `pnpm db:push` + `db:generate`.

---

## 7b. Navigation placement (locked with Pavel 2026-07-14)

Grounded in `apps/admin/src/components/nav/sidebar-config.ts`:

- **Global policy + bulk Access list → `/settings/partner-access`** — the sidebar entry already
  exists (Settings group, line ~294: `{ label: 'Partner Access', icon: Globe, href:
  '/settings/partner-access', capability: 'platform:admin' }`). Build it as a **two-tab page**:
  **Policy** (defaults + master switches) and **Partners** (bulk table).
- **Per-partner Access tab → the partner detail page** (Users & Roles → Partners, `/partners/[id]`).
  A new **tab** ("Access & Opportunities") — NOT a sidebar item.
- **Requests queue → the Inbox group** (with the other approval queues: Leads, Partner
  verification, Partner ramp). New item `Access requests` + a `badgeKey` (e.g.
  `partnerAccess.pending`). NOT a Settings tab — approvals live in Inbox by convention.
- **ABSORB the old `Partner Profiles` item** (line ~297, `/settings/partner-profiles`, holding
  `PartnerProfileSetting.enabled` + `minCreatorTier`) **into Partner Access.** Migrate those two
  settings into the new Policy tab; **remove/redirect** the old sidebar item + route so there is a
  single partner-disclosure/opportunity surface. `minCreatorTier` becomes the "tier to see
  identity in context" dial (companion spec §7).

RBAC: `/settings/partner-access` = `platform:admin`; Super-admin-only levers (A1/A2/C2) fenced
inside; `Access requests` inbox = partner-ops (`partners:approve`) with Super-admin for A1/A2 grants.

## 8. Admin UI (admin v2 surface pattern — hero band / KPI strip / chips / table / RowActionsMenu)

**1. Global policy** — `Admin → Settings → Partner Access` — grouped controls (A/B/C) with the
master kill switches up top; each control shows the default + a "used by N overrides" hint.

**2. Bulk list** — `Admin → Partners → Access` — the v2 table:
- KPI strip: # public profiles · # brief-eligible · # in rotation · # restricted · # pending requests.
- Filter chips: profile state, sharing on/off, brief intake, rotation, named-reviews policy, "has overrides".
- Columns: partner · tier · A1 · A3 · A4 · B1 · B2 · B3 (effective badges, color-coded by source).
- **Bulk actions:** Allow/Deny a lever for selected partners (reason required).
- RowActionsMenu → partner Access tab.

**3. Per-partner** — partner detail → **"Access & Opportunities" tab**:
- Lever list grouped A/B/C. Each row: tri-state control · **effective badge** · **source**
  (Inherited / Override / Blocked-by-prerequisite) · blocked-reason · reset-to-default · audit link.
- Header shows pending requests + a "restricted" banner if any Deny is active.

**4. Requests queue** (phase 2) — `Admin → Partners → Access Requests` — approve/deny with reason.

---

## 9. Governance

- **RBAC** (ties to the admin RBAC epic): high-impact levers — A1 public profile, A2 disclosure,
  C2 fee — are **Super-admin only** (consistent with partner-verify = Super-only). Group B
  marketplace levers → Partner-ops role.
- **Reason required** on every override; **AuditLog** on every change (who / old→new / why).
- **Effective-dated** overrides optional (expiry auto-reverts to Inherit).
- **Safety:** master kill switch beats per-partner Allow; prerequisites can only subtract.

---

## 10. Build sequencing

1. `PartnerAccessOverride` model + `PartnerAccessPolicy` expansion (`packages/db`) → `db:push`/`generate`.
2. Resolver lib (`packages/access` or into `packages/auth`) + unit tests → commit.
3. Wire the resolver into the profile route/reader (companion spec) + rotation/brief eligibility → commit.
4. Admin global policy page → commit.
5. Admin per-partner Access tab → commit.
6. Admin bulk Access list + KPI strip + filters → commit.
7. (Phase 2) Requests model + queue + partner-app request UI.
8. `pnpm typecheck` + `lint` + smoke each surface.

---

## 11. Open questions for Pavel

- **Scope now:** ship the whole lever catalog, or start with Group A (identity/disclosure — what
  the companion spec needs) and add Group B (marketplace opportunities) after?
- **Requests workflow (§6):** build the partner-initiated request queue now, or admin-only toggles
  first and add requests later?
- **Override vs policy-by-tier:** should some levers default off the partner's **merit tier**
  (e.g., rotation only for Trusted+), rather than a flat global default?
