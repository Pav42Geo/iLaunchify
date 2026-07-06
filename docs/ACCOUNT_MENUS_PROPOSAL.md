# Account Menus — Audit + Proposal (DRAFT 2026-07-06)

Audit of the avatar/account dropdown in all four apps + a proposal for role-specific v2 menus.
Interactive mockup: `docs/account-menus-mockup.html` (open in a browser).

---

## 1. Audit — what exists today

One shared component, `AppHeaderUserMenu` (`packages/ui/src/components/AppHeaderUserMenu.tsx`),
consumed by creator/partner/admin with hardcoded per-app section arrays. Marketing still runs an
**unmigrated fork** (`apps/marketing/src/components/UserMenu.tsx`) that has drifted.

### Bugs / mislinks found

| # | App | Issue |
|---|-----|-------|
| 1 | Marketing | "Production orders" links to `creatorUrl('/products')` — same target as "My products". Should be `/orders`. |
| 2 | Marketing | "Help & support" links to marketing-local `/help` — **route doesn't exist → 404**. Creator's `/help` does exist. |
| 3 | Marketing | `UserMenu.tsx` is a stale fork of the shared component (own comment says "starter set; trim with Pavel before locking"). Never locked. |
| 4 | Marketing vs Creator | "Settings" → `/settings/profile` on marketing, `/settings` on creator. Inconsistent. |
| 5 | Creator | Tier chip "· Manage" → `/settings/profile`. Plan management shipped at **`/settings/plan`** (V1.5 self-serve upgrade). Mislink. |
| 6 | Creator | "Channels" → `/settings/channels` (old connection form). The full Channels hub is **`/channels`** (with inventory + orders tabs). |
| 7 | Partner | `companyName` is passed into the `activeBrandName` slot → renders under an "ACTIVE BRAND" label with a **pink gradient swatch** — creator semantics + creator color in the ink-toned partner app. |
| 8 | Partner | No partner status chip. `VERIFIED / TRUSTED / PREMIER` may be surfaced info-only (locked rule: never "Premier gets X"). |
| 9 | Admin | Menu items drifted from sidebar v3: "Certificate types" (now "Certificate Library"), "Leads" (now inside Inbox group). Two sources of truth = permanent drift. |
| 10 | All 3 dashboards | The dropdown mostly **duplicates the sidebar** (Dashboard / Products / Orders…). Sidebar is role-skinned (partner) and capability-filtered (admin); the dropdown copy is neither. |

### Structural finding

Every app has a persistent sidebar that owns navigation. The account menu's job should be
**identity + account + context switching** — not a second nav. That single principle resolves
almost every issue above.

---

## 2. Proposal

### 2.0 Shared: `AppHeaderUserMenu` v2 (one component, config-driven)

Additive props, no breaking change:

- `roleChip?: { label, tone }` — partner status / admin role (info-only).
- `brandCards?: { brands, activeBrandId, addBrandHref?, maxBrands?, upgradeHref? }` — creator.
- Items gain optional `children: AppHeaderUserMenuItem[]` → **sliding sub-panel** (Facebook-style:
  panel slides left, back-chevron header, height animates). Not an accordion — keeps the panel
  stable and scannable.
- Each app keeps its config in one `nav/menu-config.ts(x)`; admin **derives** its config from
  `sidebar-config.ts` so it can never drift again.

### 2.1 Creator menu (~320px)

1. **Identity** — name, email, tier chip → fix to `/settings/plan`.
2. **Brand cards** (the tier-aware section you asked for):
   - Every brand renders as a card: swatch/logo initial, name, `/handle`, active check.
   - Click card = switch brand (same cookie mechanism as BrandSwitcher); "Manage" affordance → `/brands/[id]`.
   - **Maker** (single brand): one card, plus a subtle "Add another brand — upgrade to Builder" nudge → `/settings/plan`.
   - **Builder / Agency**: card list (max ~3 visible + "View all brands" → `/brands`) + "Add brand" → `/brands/new`.
   - Topbar `BrandSwitcher` stays for ≥2 brands (fast-switch path); menu cards are the manage+switch path. Same cookie, no new state.
3. **Account section only** (nav duplication removed): Plan & billing → `/settings/plan` · Payments → `/settings/payouts` · Channels → `/channels` (hub, not settings form) · Notifications → `/settings/notifications` · Settings → `/settings`.
4. Help & support → `/help` · Sign out.

Dropped: Dashboard / My brands / My products / Orders rows — the sidebar owns them. ("My brands" is
replaced by the brand cards themselves.)

### 2.2 Partner menu (~320px)

1. **Identity** — person name, email, + **status chip** (VERIFIED/TRUSTED/PREMIER, info-only, ink tone).
2. **Company card** — replaces the misused "Active brand" chip: ink-toned square initial, company
   name, "Company profile" label → `/settings`. (Future-proofs multi-service/role-skin accounts.)
3. **Account**: Application status → `/my-application` (hide once ACTIVE, or relabel "Company profile") ·
   Billing → `/settings/billing` · Payments → `/payments` · Team → `/settings/team` · Settings → `/settings`.
4. Help & support → `/help` · Sign out.

Dropped: Dashboard / My products / Packaging / Orders / Certifications rows — the role-skinned
sidebar owns them (dropdown copy ignores role skins today).

### 2.3 Admin menu — Facebook-style panel (~360px)

Your instinct is right: the admin surface is too big for a flat list, and mirroring the whole
sidebar tree is pointless. The Facebook pattern solves it:

1. **Identity card** — name, email, **admin role chip** from RBAC (e.g. Super Admin / role preset).
2. **Shortcut grid** (2×3 tiles, large icons): Dashboard · Inbox (with `inbox.total` badge) ·
   Orders · Risk Inbox · Audit Log · Support tickets. These are the "I'm anywhere, take me to the
   work" targets — badge-bearing queues, not catalog pages.
3. **Drill-in rows** (sliding sub-panels, derived from `sidebar-config.ts`, capability-filtered,
   `hiddenUntilBuilt` respected):
   - Settings & configuration → the Settings group children
   - Applications → Design Studio / Packaging Studio / Marketplace / Academy groups
   - Help & support
4. Sign out.

Because it's **generated from sidebar-config**, labels/links/capabilities stay in lockstep with the
sidebar forever — the drift in bug #9 becomes impossible.

Optional V1.5 creative layer: "Recently visited" row (localStorage, last 5 admin pages) above the
shortcut grid.

### 2.4 Marketing (marketplace header)

Delete the fork; render shared `AppHeaderUserMenu` with the creator config, all links via
`creatorUrl()` + `external: true`. Fixes bugs #1–#4 in one move.

---

## 3. Suggested phasing

- **P0 (quick fixes, ~1 file each):** bugs #1, #2, #5, #6 — pure href/label corrections.
- **P1:** AppHeaderUserMenu v2 (roleChip + brandCards + children/sub-panel) + creator & partner configs.
- **P2:** Admin Facebook-style panel derived from sidebar-config.
- **P3:** Marketing fork deletion (needs the shared component exported with cross-app link support — already there via `external`).

Open questions for Pavel:
1. Partner "My application" post-activation — hide, or relabel "Company profile"?
2. Keep topbar BrandSwitcher alongside menu brand cards, or retire it?
3. Admin shortcut-grid contents — the six above, or personalized (recently visited)?
