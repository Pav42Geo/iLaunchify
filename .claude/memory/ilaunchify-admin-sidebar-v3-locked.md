---
name: ilaunchify-admin-sidebar-v3-locked
description: "Admin sidebar SOURCE OF TRUTH. v3 (Pavel 2026-05-31) was fully restructured into v4 (Pavel 2026-07-04) — this file now documents v4. Read before touching apps/admin/src/components/nav/sidebar-config.ts; treat divergences as bugs. Labels are exact — names matter."
metadata:
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

**v4 — restructured by Pavel 2026-07-04 (this supersedes the v3 lock of 2026-05-31).**
This is the canonical admin sidebar that drives
`apps/admin/src/components/nav/sidebar-config.ts`. Every label below is exact
(`Cert instance reviews` not `Cert reviews`). Read this before any sidebar edit.

**How to apply:** unbuilt routes are marked `hiddenUntilBuilt: true`; the renderer
filters hidden items + groups that would render empty. Cross-app links use plain
`<a href>` (never `<Link>` cross-app). Three nesting levels are supported (e.g.
Settings > Order Settings > items).

# The v4 tree

```
-- PRIMARY (no region label) ----------------------------------------------
DASHBOARD                                -> /dashboard

INBOX  (the one work queue, ordered by theme)
  Partners:        Leads . Partner verification . Partner ramp
  Catalog review:  Product approvals . Category review . Ingredient queue .
                   Accessory verification . Packaging review .
                   Cert instance reviews . Cert type requests
  Orders & money:  Disputes . Cancellation requests . Refund requests
  Support:         Support tickets

ORDERS                                   -> /orders
PRODUCTS                                 -> /products
CATEGORIES                               -> /categories

USERS & ROLES
  Creators . Partners . Admins . Roles & Permissions

LIBRARIES                                (reference catalogs -- replaced "Asset Management")
  Certificate Library . Ingredient Library . Bulk import (assets)

LOGISTICS
  Shipments . Receiving exceptions . SLA monitor . Carriers .
  Fulfillment centers . Channel plans . Logistics gates

FINANCE                                  (promoted out of Settings)
  Overview . Invoices . Payouts & transfers . Refunds . Clawbacks . Tax forms (1099)

SETTINGS  (config only)
  Tiers & Plans . Product Domains . Support Policy
  Order Settings > { Fees & Commissions . Partner Routing . Routing preview .
                     Shipping & Fulfillment . Cancellations & Refunds .
                     Scoped Overrides . Sample Policy . Channel Replenishment }
  Markets & Regions . Theme Studio
  Integrations & API > { API keys & status (/developer) . Channels .
                         Ingredient Data Sources }
  Security & Access
  Compliance & Data Rights > { Document access log . Label-claim consents .
                               Erasure requests* . Sub-processors* }
  Audit Log

-- APPLICATIONS (region divider) ------------------------------------------
DESIGN STUDIO   (2D label/artwork authoring + its assets)
  Design Templates . AI Generator . AI Template Pool . Die-lines .
  Facts Labels . Mandatory Phrases . Labeling Symbols .
  Graphics Library* . Fonts Library*

PACKAGING STUDIO   (3D/structural + its assets; the group != the tool)
  3D Models & Surfaces (/packaging-studio, the tool) . Die-cut Templates .
  Packing Types . Packaging Symbols . Product Mockups (2D)

PRODUCT BUILDER                          -> /product-builder
  (top-level item, not a group — one tabbed page, ?view=briefs|rooms;
   co-creation oversight, added Pavel 2026-07-10)

MARKETPLACE
  Niches . Niche rules . Lifestyle Tags . Decoration compatibility .
  Niche audit . Phrase audit

ACADEMY
  Overview . Courses . Lessons . Topics

-- HELP (bare region) -----------------------------------------------------
Help Center                              -> /support-tickets
```
`*` = `hiddenUntilBuilt: true` (route not built).

# What changed from v3 -> v4 (2026-07-04) and why

- **Inbox = the single work queue.** `Category review` moved in from top-level;
  ordered by theme (Partners / Catalog review / Orders & money / Support).
- **"Asset Management" dissolved.** Each studio owns its own assets; only
  cross-cutting reference catalogs remain, as **Libraries** (Certificate,
  Ingredient, Bulk import). Rule: *an asset lives with the studio that consumes
  it; cross-cutting catalog data lives on its own.*
- **Users & Roles** reordered -> Creators . Partners . Admins . Roles & Permissions.
- **Finance promoted** to top-level (was 3 levels deep in Settings).
- **Logistics** placed between Compliance-area and Finance (Pavel's spot).
- **Settings slimmed to config-only**; Compliance & Data Rights nested inside it;
  removed dead placeholder groups (Communications, Global Compliance Center,
  Analytics & Monitoring). `Languages & Markets` flattened -> **Markets & Regions**.
- **Integrations & API consolidated into Settings.** `/developer` IS the
  "Integrations & API keys control center" (was mislabeled "Developer & API" and
  duplicated an Applications group). Folded to one group: API keys & status +
  Channels + Ingredient Data Sources. Marketing/Analytics placeholders deleted.
- **Applications** is now studios/surfaces only: Design Studio . Packaging Studio .
  Marketplace . Academy. Packaging Studio **promoted to first-class**; the old
  hidden `/applications/packaging-studio` duplicate removed.
- **Packaging Studio group vs. tool:** the group is "Packaging Studio"; its 3D
  tool child is "3D Models & Surfaces" (-> `/packaging-studio`) so section != tool.
- **Die-line/die-cut consolidation** (three distinct models -- keep separate):
  - `Die-lines` (`/dielines`) = partner-submitted `PackagingDieline` *files* ops.
    The redundant "Die-line Curation" nav link was dropped (rows open the curator).
  - `Die-cut Templates` (`/asset-management/die-cut-templates`) = `DieCutTemplate`
    *shapes* -- a 2-tab module: **Library** + **Container assignments** (the old
    "Container Die-lines" page, now redirected here; its sidebar link retired).
  - `Design Templates` (`/templates`) = artwork (`LibraryTemplate`), keyed to a shape.
  - `Product Mockups (2D)` = `MockupTemplate` (2D photo-masks; NOT the 3D studio).
- **PackagingType HUB** -- hub-and-spoke: `/packaging-studio/[id]` gathers one
  container (Overview . 3D & Surfaces . Die-lines . Mockups . Default die-cut),
  reached via **Manage** on library cards; container-keyed lists link back to it.
  Admin-native 3D-model import lives on its 3D & Surfaces tab.

# Companion docs (deeper rationale)
- `docs/PACKAGING_ENTITY_MANAGEMENT_AUDIT.md` -- relation audit + hub-and-spoke recommendation.
- `docs/DIE_CUT_TEMPLATES_MODULE.md` -- the 2-tab die-cut module spec/status.

# Amendments since v4

- **2026-07-05 (Pavel):** DESIGN STUDIO gained **Design History** (`/design-history`,
  after `Die-lines`, before `Facts Labels`, capability `creators:read`) — the
  versioning-v2 Phase 4 support tool over creator Design/EditSnapshot rows.
  Placement per the "asset lives with the studio that consumes it" rule;
  restore inside is tickets:admin server-side. Not drift — do not remove.
- **2026-07-05 (Pavel):** Settings gained a **Notifications** group —
  Templates / Branding / Deliverability / Log at `/notifications-center/*`
  (the removed Communications group returning, now that pages exist). See
  `ilaunchify-notification-center.md`. Not drift — do not remove.

- **2026-07-10 (co-creation P0) — SUPERSEDED same day, see next entry:**
  MARKETPLACE briefly gained **Briefs** (`/briefs`) and **Rooms** (`/rooms`) —
  read-only co-creation oversight lists over `ProductBrief` / `CoCreationRoom`
  (docs/CO_CREATION_MARKETPLACE_SPEC.md §10).
- **2026-07-10 (Pavel):** the admin co-creation module is renamed
  **Product Builder** — the Marketplace › Briefs + Rooms items were REMOVED and
  replaced by ONE top-level APPLICATIONS item:
  `Product Builder` (icon `Hammer`) → `/product-builder`, placed directly
  BEFORE the Marketplace group. The two lists combine into one tabbed page
  (`?view=briefs|rooms`, default briefs); each tab keeps its own filter params
  (q/status/niche/sort/dir/page) and every href carries `view=…`. Old list
  routes `/briefs` and `/rooms` are thin redirects to
  `/product-builder?view=…`; DETAIL routes `/briefs/[briefId]` and
  `/rooms/[roomId]` stay unchanged (deep-linked from row actions,
  notifications, cross-links). Not drift — do not remove.

# Rules that survive from v3
1. **Names matter** -- labels are verbatim; a divergence is a bug.
2. **Hide-until-built** -- unbuilt routes stay in config as `hiddenUntilBuilt: true`.
3. **Cert instance reviews != Certificate Library** -- Inbox entry is the per-partner
   verification queue (`PartnerCertificateInstance` PENDING_REVIEW); the Libraries
   entry is the `CertificateType` catalog CRUD.
4. **Region dividers**: PRIMARY has no label; APPLICATIONS is labeled; HELP is bare.
