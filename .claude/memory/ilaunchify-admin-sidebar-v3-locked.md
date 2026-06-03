---
name: ilaunchify-admin-sidebar-v3-locked
description: "VERBATIM admin sidebar v3 tree, pasted by Pavel 2026-05-31. Source of truth — never re-derive from FOD screenshots or memory of approval. Read this file before touching apps/admin/src/components/nav/sidebar-config.ts."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

**Locked by Pavel 2026-05-31.** This is the canonical admin sidebar tree
that drives `apps/admin/src/components/nav/sidebar-config.ts`. Every label
below is exact — `Cert instance reviews` not `Cert reviews`, `Users & Roles`
not `People & access`, `MANAGE` not `Catalog`. Names matter.

**Why this exists:** I (Claude) shipped a deviated sidebar earlier in the
same session ("Inbox / Catalog / People & access / Commerce / Applications")
because the verbatim tree did not survive context compaction. Pavel pushed
back. This file is the antidote — read it before any sidebar edit and
treat divergences as bugs.

**How to apply:** When a referenced route doesn't exist yet, mark the entry
`hiddenUntilBuilt: true` per Pavel's "hide until built" rule (2026-05-31).
The structure stays in the config as the locked plan; the renderer filters
out hidden items + sections that would render with no visible children.

# The locked tree

```
DASHBOARD                          ← landing — KPI cards + inbox preview + activity feed + quick actions

INBOX
  ├─ Leads
  ├─ Partner verification
  ├─ Cert instance reviews
  ├─ Ingredient queue
  ├─ Product approvals
  ├─ Packaging-type submissions
  ├─ Phrase submissions
  └─ Support tickets

ORDERS

MANAGE
  ├─ Products & Categories
  ├─ Users & Roles
  │    ├─ Admins
  │    ├─ Creators
  │    └─ Partners
  ├─ Asset Management
  │    ├─ Packaging Symbols
  │    ├─ Packaging Materials
  │    ├─ Die-Cut Shapes (+ compliance grids)
  │    ├─ Packaging Types
  │    ├─ Nutrition Facts Labels
  │    ├─ Supplement Facts Labels
  │    ├─ Mandatory Phrases
  │    ├─ Certificate Library
  │    ├─ Ingredient Library
  │    ├─ Die-Cut Design Templates
  │    ├─ Product Mockups
  │    ├─ Graphics Library
  │    └─ Fonts Library
  ├─ Communications
  │    ├─ Notification templates
  │    ├─ Broadcasts
  │    └─ Support workflows
  ├─ Languages & Markets
  │    ├─ Markets / Regions
  │    └─ Global Compliance Center
  │         ├─ Market Profiles
  │         ├─ Regulation Matrix
  │         └─ Compliance Gallery
  └─ AI Tools                      (V1.5+ forward-pointer)
       ├─ Prompt Library
       └─ Template Agents

SETTINGS
  ├─ Tiers & Plans
  ├─ Billing & Subscription
  ├─ Security & Access
  ├─ Developer & API
  ├─ Audit Log
  └─ Analytics & Monitoring

HELP & SUPPORT
  └─ My tickets

— APPLICATIONS —
Marketplace
Design Studio (with Admin mode)
Packaging Studio
Packaging Mockups (2D & 3D)
Integrations & API
  ├─ Channels
  ├─ Marketing
  └─ Analytics
```

# 2026-06-01 amendment (v3.1 — flatten MANAGE)

Pavel revisited the structure on 2026-06-01 and asked for two changes:

1. **Remove the wrapping `MANAGE` group entirely.** Promote its direct
   children to top-level entries in the PRIMARY region:
   - `Products & Categories` — flat item at `/products`
   - `Users & Roles` — top-level expandable group
   - `Asset Management` — top-level expandable group
2. **Languages & Markets and Communications move INTO Settings** —
   they were NOT promoted to top-level. They're now nested groups inside
   the Settings group, alongside the existing Tiers & Plans / Billing /
   Audit Log / Analytics leaves.

**AI TOOLS removed** from the tree entirely.

PRIMARY region (final) reads as:
- Dashboard
- Inbox (group)
- Orders
- Products & Categories
- Users & Roles (group)
- Asset Management (group)
- Settings (group — holds Tiers & Plans, Billing, Security, Developer &
  API, Communications [group], Languages & Markets [group], Audit Log,
  Analytics & Monitoring)

APPLICATIONS region keeps its existing structure. HELP region (bare,
no label) sits at the very bottom with the Help & Support group.

# Notes locked alongside the tree

1. **Three nesting levels in places** — e.g. `MANAGE > Languages & Markets >
   Global Compliance Center > Market Profiles` is three levels deep.
   SidebarSection must support sections-inside-sections.
2. **The dashes around `— APPLICATIONS —`** are not a label flourish —
   they're the region divider. Region 1 (DASHBOARD through HELP & SUPPORT)
   has no label header; region 2 is labeled APPLICATIONS.
3. **AI Tools is V1.5+ forward-pointer** — the parent section stays, all
   children are hidden today. Pavel's instruction is "hide until built".
4. **`Markets / Regions` is one entry**, not two — leads to a combined
   page (or the existing /markets surface). Distinct from the
   `Global Compliance Center` sub-tree below it.
5. **Cert instance reviews ≠ Certificate Library.** The Inbox entry is
   the per-partner cert verification queue (PartnerCertificateInstance
   rows in PENDING_REVIEW). The MANAGE entry is the CertificateType
   library (admin CRUD of the cert-type catalog).
