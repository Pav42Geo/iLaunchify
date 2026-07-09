# Adaptive, service-composed application + service naming

**Date:** 2026-07-08 · **Problem (Pavel):** the fixed linear application asks every applicant the same questions — so a 3PL gets "what kind of products do you offer?", which is nonsense. And "Label printing" is too narrow (printers do packaging too). Fix: correct the service names + make the application **adaptive** to the services selected.

## Service naming (research-backed)

Sources: [CPG manufacturing models](https://thefreshfactory.co/blog/cpg-manufacturing-models/), [co-pack vs contract mfg](https://myfbaprep.com/blog/fulfillment/co-packing-vs-contract-manufacturing-whats-the-difference/), [co-pack vs 3PL](https://shipdudes.com/blog/co-packing-vs-3pl-assembly-cpg-brands-scale), [converter services](https://www.atlanticpkg.com/printing_graphics/).

| Enum (LOCKED — don't rename) | Display name | Subtitle | What defines them |
|---|---|---|---|
| `MANUFACTURING` | **Manufacturing** | Contract / co-manufacturing | Makes from scratch — sources, formulates, produces, packages |
| `COPACKING` | **Co-packing** | Contract packaging & fill | Fills / packages semi- or finished goods on their lines |
| `LABEL_PRINTING` | **Packaging printing** (Pavel ✓ FINAL) | Labels · sleeves · cartons · flexible | A *converter* — prints labels + shrink sleeves + folding cartons + flexible packaging. NOTE: "Packaging printing" (not "Printing & packaging") because the latter implies they also *pack* (co-packing), which they don't — they print packaging materials. |
| `WAREHOUSE` | **Fulfillment (3PL)** | Storage · pick-pack-ship · kitting | Third-party logistics for finished goods — warehousing, fulfillment, returns |

**Only display labels change** (the enum stays — precedent: `WAREHOUSE` already displays "Fulfillment Center"). Central label map: `apps/partner/src/lib/role-skins.ts` `SERVICE_TYPE_LABEL` — change there to propagate platform-wide (align in a follow-up; do the application first).

## The application is service-composed (adaptive)

Same principle as Activation Setup: **you pick your services, the middle steps are the union of the question groups for those services.** No fixed 5-step form.

**Flow = `2 shared front + N selected-service cards + 2 shared back`:**
1. **Company basics** (shared) — company, legal, years in business.
2. **Services** (shared) — the multi-select that *drives the branch*.
3…N. **One card per selected service** (only the ones picked), in a stable order.
- **Certifications** (shared) — the picker.
- **Contact + references** (shared) — name, email, "who have you produced for?", success narrative.

A print-only applicant sees: Company → Services → Printing & packaging → Certs → Contact. A manufacturer+co-packer sees both service cards. The **co-packer-who-also-prints** just checks both services and gets both cards — the composition handles the overlap, no awkward either/or.

### Per-service card (light — qualification, not full spec)

| Service | Card asks (application level) |
|---|---|
| **Manufacturing** | Product categories · processes · **product models (white / private / fully-custom)** · smallest run |
| **Co-packing** | Packaging formats you handle · fill types · do you supply packaging? · smallest run |
| **Packaging printing** | What you print (labels / shrink sleeves / folding cartons / flexible) · print methods (digital/flexo/offset) · smallest run |
| **Fulfillment (3PL)** | Storage classes (ambient / cold / frozen / hazmat) · rough capacity · location · value-adds (kitting/returns) |

Deep structured detail (every substrate, die-line, format) stays in onboarding — the application card is coarse fit-signal only.

## Build — BUILT 2026-07-08

- `ApplicationWizard` rebuilt: `STEPS` **computed from `watch('serviceTypes')`** — shared Company + Services front, one card per selected service (Manufacturing / Co-packing / **Packaging printing** / Fulfillment (3PL)), shared Certs + Contact back. Step index clamped so deselecting a service can't strand you; progress + per-step validation adapt to the live list.
- Per-service answers stored under `leadNotes.serviceDetails[SERVICE]` (declaration; structured onboarding capture is authoritative). `submitLead` schema swapped the manufacturing-centric fields for `serviceDetails: record`.
- New display names used in the wizard. **TODO (follow-up):** align `SERVICE_TYPE_LABEL` (`role-skins.ts`) platform-wide so "Packaging printing" / "Fulfillment (3PL)" show everywhere. Typecheck + colors + invariants green.
