# Facility as a first-class model — decision + phased plan

**Date:** 2026-07-08 · **Decision (Pavel):** a partner can operate multiple facilities, and the **facility** — not the company — is the routing unit. Each facility has its own location, capabilities, capacity, storage classes, and **certs** (SQF/GMP/FDA registration are per-plant).

## Why this is foundational (not a UI repeater)

Today: address lives on `Partner`; capabilities live on `PartnerService` (partner-scoped); certs on `PartnerCertificateInstance` (partner-scoped); routing (`findRouting`, `fc-selector`) picks a *service*, scored by the *partner's* single location. Making facility first-class means the routing/capability spine becomes **facility-scoped**:

| Thing | Today | Facility-first |
|---|---|---|
| Address / geo | `Partner` (one) | `Facility` (many, each geocoded) |
| Capabilities (categories, MOQ, processes) | `PartnerService` | per **facility** service |
| Capacity / blackout / storage class | `PartnerService` / partner | per facility |
| Certs | partner-scoped | **facility-scoped** (SQF is per-plant) |
| Routing / proximity | nearest *partner* | **nearest capable *facility*** |

That last row is the payoff: route an order to the *specific plant* that's closest + capable + certified, not just "the company."

## Phased plan (land the substrate now, roll out routing later)

Same discipline as the multi-tenant substrate: add the no-regret data layer now, defer the disruptive routing rewrite until it's pulled in.

**Phase 1 — no-regret substrate (additive, nothing breaks): BUILT 2026-07-08.**
- New `Facility` model (`id, partnerId, name, addressLine1/2, city, state, postalCode, country, lat?, lng?, isPrimary, status`) + `FacilityStatus` enum + `Partner.facilities`. ✅
- **Nullable `facilityId`** + `facility` relation + index on `PartnerService` and `PartnerCertificateInstance`. ✅ (`Facility` added to audit entity types.)
- **Backfill script** `packages/db/prisma/backfill-facilities.ts` (`pnpm --filter @ilaunchify/db backfill:facilities`) — creates one primary `Facility` per partner from their address, links facility-less services + cert instances to it. Idempotent. Run after `db:push`+`db:generate`.
- `PartnerService @@unique([partnerId, type])` kept for Phase 1; **Phase 2 relaxes it to `[partnerId, type, facilityId]`** so a partner can run the same service at multiple facilities.

**Phase 2 — capture (UI writes real facilities):**
- Onboarding "Facilities" repeater → real `Facility` rows.
- Per-facility capability + cert capture (the structured purpose-map fields, scoped to the facility a service runs at).

**Phase 3 — routing payoff:**
- `findRouting` + `fc-selector` iterate a partner's facilities, filter by facility capability + facility certs + facility storage class, and score by **facility** proximity → route to the nearest capable plant.
- Cert gate reads facility-scoped certs.

## Sequencing note

Phase 1 is a contained, additive schema slice (model + FKs + backfill) — buildable as one reviewed migration. Phases 2–3 are larger and interact with the capability purpose-map rebuild (`ONBOARDING_ACTIVATION_FIELD_AUDIT_2026-07.md`) — do them together so capability capture is facility-scoped from the start.

**Recommended order across the current queue:** (1) finish the visible **application card flow** (small, queued, includes the private-label/min-run fields), (2) **Facility Phase 1** substrate, (3) capability purpose-map + cert wiring **facility-scoped** (Phase 2), (4) routing per-facility (Phase 3).
