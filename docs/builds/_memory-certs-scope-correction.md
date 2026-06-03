# Memory file to add — Pavel, drop into `.claude/memory/`

Cowork can't write into `.claude/memory/` in the current session (protected path). Copy the block below to:

`.claude/memory/ilaunchify-certificates-declare-only.md`

And append the one-line index entry to `.claude/memory/MEMORY.md` and `.claude/memory/INDEX.md` (lines included at the bottom).

---

## File — `.claude/memory/ilaunchify-certificates-declare-only.md`

```markdown
---
name: ilaunchify-certificates-declare-only
description: "iLaunchify cert module is declaration-and-verification only. Not a certification body. Partners declare certs they already hold; admin verifies the uploaded PDF. 'Request new cert type' is admin-curation when a held cert isn't yet in our master library — never 'help me get certified.'"
metadata:
  type: project
---

iLaunchify does NOT offer certification services. Critical scope correction
locked 2026-06-01 after I (Claude) incorrectly added a "Get certified" button
in a picker mockup that conflated three distinct concepts.

## What the cert module DOES

1. **Lets partners declare certs they already hold.** Partner uploads the
   cert PDF, admin verifies it's real and matches the issuing body's
   records, the `PartnerCertificateInstance` is marked VERIFIED, partner
   can attach it to their products.
2. **Maintains an admin-curated master library of `CertificateType` rows.**
   Canonical names + thumbnails + issuing body + applicability metadata
   (categories, labelingTypes, markets, claims). Admin owns this library.
3. **Shows attached cert badges on partner products** in the marketplace +
   on creator product detail pages + on the Design Studio canvas (via the
   `badgeSvgFileId` vector for print).

## What the cert module does NOT do

1. **Does NOT certify partners.** Certification is between the partner and
   the external certifying body (USDA, OU, NSF, etc.) — paperwork, audits,
   fees, surveillance visits all happen externally with zero iLaunchify
   involvement.
2. **Does NOT advertise alternative cert types to partners** who don't
   already hold them. The picker only surfaces the partner's own VERIFIED
   instances — alternatives live in the admin master library only.
3. **Does NOT route partners to certifying bodies' application pages.**
   Out of scope.

## What "Request new cert type" actually means

Admin-curation flow, not partner-onboarding:

1. Partner holds Star-K Kosher. Star-K isn't yet in iLaunchify's master
   library. Partner clicks "Request new cert type" in the picker footer.
2. Form opens asking the partner to describe the cert (name, issuing
   body, what claim it covers, applicable categories, applicable markets,
   issuing-body URL).
3. Admin reviews the request in `/admin/certificate-requests` queue.
4. Admin approves → creates a new `CertificateType` row in the master
   library → notifies the partner.
5. Partner returns and uploads their Star-K PDF as a normal
   `PartnerCertificateInstance` against the new type.

Critical: at no point does iLaunchify help the partner BECOME Star-K
certified. The request is to add the TYPE to our taxonomy.

## What the picker shows (final, locked design)

Three sections only:

1. **From your library — for this product** — partner's VERIFIED
   `PartnerCertificateInstance` rows, filtered by the product's category +
   labelingType + market. Click "Attach" to add to product.
2. **Your universal certs — company-level** — partner's facility-level or
   company-level certs (cGMP, B Corp, etc.) — auto-attached, with detach
   affordance.
3. **Request new cert type** — one footer link to the admin-curation flow
   described above.

NO "Get certified" button anywhere. NO "Available to certify" section
listing master library alternatives the partner doesn't own.

Dropdown stays open until partner clicks Done — multi-attach friendly.
Expiry chips colored by urgency. Region filter at the top with override
toggle for partners targeting multiple markets.

## Where master library alternatives DO live

- `/admin/certificate-types` — admin curates the full 80-120 cert types
  with all their categories/markets/claims/alternativesOf mappings.
- `/admin/certificate-requests` — admin reviews + approves partner
  requests to add new types to the library.
- Buyer-facing claim grouping on the public marketplace — a buyer
  searching "kosher" gets products with OU, OK, Star-K all surfaced
  under one filter (`claimCategories` schema field).

Master library alternatives NEVER surface in the partner's product
picker.

## Why this matters

If the picker showed "Get certified" or "Available to certify" UX:
1. iLaunchify would imply we offer certification services (we don't).
2. Partners would expect us to help them through certification audits
   (we can't and won't).
3. We'd take on regulatory liability that belongs to the certifying body.
4. The legal stance in the Creator Agreement (compliance tooling is
   assistance, not certification) would collapse — if we're brokering
   certs we ARE in the certification chain.

This is the same class of mistake as treating the compliance scan as
certification per `docs/legal/FDA_REGULATORY_POSTURE.md` §5 — the
platform's role is information surfacing, not authoritative compliance.

## How to apply

- Never propose UI that lets a partner pursue a cert through iLaunchify.
- Never propose schema that tracks "certification application status" —
  that's the certifying body's system, not ours.
- Always frame the picker as "From your library" — the partner already
  knows what they hold, we just help them attach it to products.
- "Request new cert type" is the only escape hatch, and it's admin-
  curation of our taxonomy, not partner-onboarding to a cert.

See also: [[ilaunchify-operational-philosophy-v1]] (operational trust >
margin), [[ilaunchify-brand-assets-not-design-system]] (earlier
scope-correction memory of similar shape).
```

---

## Append to `.claude/memory/MEMORY.md` (Project context section)

```
- [Certificates module — declare-only, not certification](ilaunchify-certificates-declare-only.md) — iLaunchify is NOT a certifying body. Partners declare certs they already hold; admin verifies the PDF. "Request new cert type" is admin-curation when a held cert isn't in our master library. Never "help me get certified."
```

---

## Append to `.claude/memory/INDEX.md` (Phases section)

```
- `ilaunchify-certificates-declare-only.md` — Cert module scope lock: declare-only, never certify
```
