# Public Partner Profile — Disclosure & Sharing Spec

**Status:** DRAFT for Pavel approval · 2026-07-14
**Origin:** Cowork design session (prototype `design/partner-profile-frontface-v2.html`).
**Supersedes:** the 2026-07-12 "creator-tier-gated, identity never public" posture of
`apps/marketing/src/app/partners/[slug]/page.tsx` — see §7 for exactly what changes.

---

## 1. Goal — have both worlds

Partners can **publicly share their profile** (a growth/traffic flywheel: partners drive
creators and other partners to iLaunchify). At the same time, a **Maker-tier creator must
never be able to identify who manufactures their product**, and **no partner (or competitor)
can see another partner's client roster or prices.**

**The mechanism (key insight):** anonymity does NOT come from hiding the whole profile. It
comes from the public profile **containing nothing that links a manufacturer to a specific
creator's product** — no product catalog, no prices, no named clients. A profile that is a
**brand/marketing page, not a catalog**, can be fully public *and* leak nothing. This mirrors
how real contract manufacturers operate: no public price lists, quote-per-client, opaque
pricing so competitors can't map their bands.

---

## 2. Decisions (locked with Pavel, 2026-07-14)

- **D1 — Visibility:** Public, **partner opt-in**. Viewable + shareable when the partner sets
  `participationMode = PUBLIC` and has published (`profilePublishedAt != null`, `slug` set).
- **D2 — Products:** **None on the public profile, ever.** No portfolio, no SKUs, no prices.
- **D3 — Reviews:** Shown to everyone, but **client-anonymized for the public**; **full named
  reviews unlock for PAID creators only** (Builder/Agency). Free Makers and logged-out see the
  anonymized version (protects the client roster from cheap snooping).
- **D4 — PDP attribution unchanged:** Maker sees generic "Manufacturer" (no name, no link);
  Builder/Agency see the name → profile link. (Already built in `lib/partner-profile.ts`.)
- **D5 — Prices:** never shown to anyone on the profile. Quote-request only.
- **D6 — Fees:** the merit fee a partner is charged is never shown publicly (already scrubbed
  in the prototype: badge reads "Premier", merit ladder shows attainment ✓/★ not %).

---

## 3. Viewer matrix

| Element | Logged-out (public) | Maker (signed in) | Builder / Agency (paid) |
|---|---|---|---|
| Reach profile via shared link | ✅ (if partner PUBLIC+published) | ✅ | ✅ |
| Name, logo, merit badge (no fee), service types, tagline, location | ✅ | ✅ | ✅ |
| Certifications, merit standing (pillars/score, no fees) | ✅ | ✅ | ✅ |
| Aggregate rating + count, "actively taking briefs", best-for | ✅ | ✅ | ✅ |
| **Products / portfolio / SKUs** | ❌ none | ❌ none | ❌ none |
| **Prices** | ❌ | ❌ | ❌ |
| Reviews — structure + rating + comment | ✅ (client masked) | ✅ (client masked) | ✅ |
| Reviews — **client brand/name** | ❌ masked | ❌ masked | ✅ named |
| Share button (get the public link) | ❌ (only signed-in paid can share) | ❌ | ✅ |
| PDP manufacturer link → profile | n/a | ❌ generic "Manufacturer" | ✅ named link |

**Why it's safe:** with no product/price/client linkage anywhere public, a Maker who lands on a
shared profile URL cannot confirm "this is *my* manufacturer." The PDP still never hands them a
name or link.

**Residual risk (accepted):** a determined Maker could *circumstantially* infer a match from
capabilities + location + certs. This is weak, non-confirming, and identical to real-world
sleuthing. No hard identifier (SKU, brand, price) is ever exposed.

---

## 4. Content rules — public profile

**Include (non-linking):** logo, company name, merit tier badge (Verified/Trusted/Premier —
styled, no fee text), service-type line, tagline, city/state, "on iLaunchify since", full
capabilities (categories / formats / processes / MOQ / lead time — operational, **no prices**),
certifications, merit standing (pillars + score, **no fee %**), aggregate rating + review count,
"actively taking briefs", best-for tags, generic capability imagery only.

**Exclude / mask:**
- **Portfolio tab → removed entirely** (was the #1 leak: named client SKUs).
- **Reviews → client identity masked** unless viewer is paid. Masked form: initials-only avatar,
  "Verified creator · N orders · ★★★★★", comment text. No brand/company/role. (Comment text
  that itself names a brand is a moderation concern, not a render gate — note for content ops.)
- Any price / per-unit cost / quote figure → never rendered.

---

## 5. Schema

**No migration required.** All needed fields exist:
- `Partner.participationMode` (`PUBLIC | INVITED_ONLY`, default INVITED_ONLY) — D1 opt-in.
- `Partner.profilePublishedAt` (nullable) — publish gate for the public route.
- `Partner.slug` (`@unique`) — canonical `/partners/{slug}` handle.
- Service `disclosureLevel` (`FULL | CITY_STATE | ANONYMOUS`) — only FULL partners are nameable.

Optional (future, not this slice): a `Partner.publicProfileReviewsNamed` override if a partner
ever wants named reviews public. Out of scope now.

---

## 6. Files touched (implementation surfaces)

1. **`apps/marketing/src/app/partners/[slug]/page.tsx`** (route)
   - Allow **logged-out + any tier** to view when the partner is PUBLIC + published + FULL.
   - Remove the "must be ≥ minCreatorTier to see anything" hard block for the standalone profile.
   - Compute `isPaidViewer` (Builder/Agency) and pass to the component for review naming + share.
   - `generateMetadata`: for PUBLIC partners, the name **may** appear (SEO/traffic). For
     non-public partners, keep the current no-leak title + `notFound()` path.

2. **`apps/marketing/src/lib/partner-profile.ts`** (gate)
   - New/renamed helper: `canViewPublicProfile(partner)` = PUBLIC + published + FULL disclosure.
   - Keep `canViewPartnerProfiles(viewerTier, gate)` for the **PDP name+link** and **named
     reviews** (paid gate) — these two are the tier-gated bits, NOT the profile page itself.
   - Clarify the two gates are now distinct: *profile visibility* (partner opt-in) vs
     *identity-in-context + named reviews* (creator tier).

3. **`packages/db/src/partner-profile.ts`** (reader)
   - Add a `viewer: { isPaid: boolean }` (or `named: boolean`) parameter, OR return raw review
     identity and let the component mask. Prefer masking in the **reader** so names never reach
     the client bundle for non-paid viewers (defense in depth — don't ship names to the browser
     then hide with CSS).
   - Stop returning `portfolio` for the public profile (or return `[]`); component drops the tab.
   - Never return price fields (confirm none are in the VM — currently none).

4. **`packages/ui/src/components/PartnerFrontFace.tsx`** (component)
   - All the prototype visual changes: taller banner (230px) + straddling logo, name + inline
     badge + services beside the logo (on the black), tagline single-line, tagline/meta below,
     per-tier badge styling (Verified/Trusted/Premier, no fee), merit ladder attainment (✓/★),
     Share popover (render only when `canShare`/paid).
   - Drop the Portfolio tab.
   - Reviews: render masked vs named from the `isPaid`/`named` prop.

5. **`packages/ui/registry.json`** — update the PartnerFrontFace entry note (public, no products,
   masked reviews, share).

**Not touched:** PDP attribution (`getManufacturerIdentity`) already behaves correctly (D4).

---

## 7. What reverses from the 2026-07-12 build

- Route comment "identity never leaks into metadata" / "never confirm or deny a partner's
  existence" → **relaxed for PUBLIC opt-in partners only.** Non-public partners keep the exact
  current behavior (lock notice / `notFound()`).
- Viewing the profile no longer *requires* a paid tier — it requires the **partner** to be public.
  Creator tier now gates only the *named reviews* and the *PDP link*, not the page.

---

## 8. Sequencing (single-writer discipline; commit after each)

1. Reader masking + drop portfolio (`packages/db`) → commit.
2. Gate helper split (`lib/partner-profile.ts`) → commit.
3. Route: public opt-in + `isPaid` + metadata (`partners/[slug]/page.tsx`) → commit.
4. Component: visual redesign + share + masked reviews + drop portfolio → commit.
5. Registry note → commit.
6. `pnpm typecheck` + `pnpm lint` + a manual smoke of the 3 viewer states.

Each step is committed immediately (Cowork can't write `.git`; Pavel runs the handed-off
`git add … && commit && push`). `PartnerFrontFace.tsx`, the route, and the reader are
single-writer for this work — Code should not be mid-edit on them.

---

## 9. Open items / follow-ups (not blocking this slice)

- **Counsel:** confirm the public-disclosure + anti-circumvention posture with the legal
  redlines (`legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md`) — public naming of a partner + masked
  reviews touches the same disclosure surface as the nomination liability work (D7).
- **Partner UI:** the opt-in toggle (`participationMode` + publish) needs a control in the
  partner app profile settings, with a plain-language explainer of what goes public.
- **Content moderation:** review comment text that names a brand bypasses the mask — flag for
  the ratings pipeline / manual review.
- **Comparison teaser (rejected earlier):** we are NOT doing an anonymous "sign in to see more"
  gate; public partners show the real (scrubbed) page. Private partners keep the lock.
- **Admin:** `PartnerProfileSetting.minCreatorTier` now means "tier to see identity IN CONTEXT
  (PDP link + named reviews)", not "tier to load the profile page". Update the admin label/help.
