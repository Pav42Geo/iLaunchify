# Admin sidebar v4 — reorganization proposal

**Status:** PROPOSAL (2026-07-01) for Pavel's approval. Supersedes v3
(`ilaunchify-admin-sidebar-v3-locked.md`) once locked. Source of change: the tree grew
organically and now violates admin-IA norms.

## What's wrong today (audit)

- **PRIMARY has ~11 top-level entries** (Dashboard, Inbox, Orders, Logistics, Products,
  Categories, Category review, Users & Roles, Asset Management, Compliance, Settings) —
  best practice is **5–7**. Users struggle to scan/recall beyond that.
- **"Settings" is a kitchen sink** — it nests Order Settings, Finance, Communications,
  Languages & Markets, Compliance-center, Theme, Developer, Security, Audit. Config and
  money and legal all buried together.
- **Review queues are split** — most live in Inbox, but "Category review" is a separate
  top-level item. All approval/review work should be in one queue.
- **Packaging Studio is buried** — it's an item inside the Design Studio group AND has a
  duplicate hidden `/applications/packaging-studio` entry. You want it first-class.
- **~15 hidden placeholder entries + 1 duplicate** clutter the config (dead links / empty
  pages you don't need at this stage).

Principles applied (grouping by mental model, ≤7 primary, shallow nesting, config→Settings,
remove-before-lengthen) — sources at the bottom.

## Proposed structure

### Region 1 — PRIMARY (run the business) · 8 groups
```
Dashboard
Inbox                     ← the ONE work queue (all approvals + support)
  Leads · Partner verification · Partner ramp · Product approvals ·
  Category review (moved in) · Cert reviews · Cert type requests ·
  Ingredient queue · Accessory verification · Packaging review ·
  Disputes · Cancellation requests · Refund requests · Support tickets
Orders
Logistics
  Shipments · Receiving exceptions · SLA monitor · Carriers ·
  Fulfillment centers · Channel plans · Logistics gates
Catalog                   ← was "Asset Management" + top-level Products/Categories
  Products · Categories · Ingredient Library · Certificate Library ·
  Packaging Symbols · Labeling Symbols · Packaging Mockups (2D & 3D) · Bulk import
People                    ← renamed from "Users & Roles"
  Creators · Partners · Admins · Roles & Permissions
Finance                   ← PROMOTED out of Settings (money is frequent + important)
  Overview · Invoices · Payouts & transfers · Refunds · Clawbacks · Tax forms (1099)
Settings                  ← config ONLY now
  Tiers & Plans · Product Domains · Support Policy ·
  Order Settings { Fees & Commissions · Partner Routing · Routing preview ·
                   Shipping & Fulfillment · Cancellations & Refunds ·
                   Scoped Overrides · Sample Policy · Channel Replenishment } ·
  Markets & Regions · Theme Studio · Developer & API · Security & Access ·
  Compliance & Data Rights { Document access log · Label-claim consents } (nested here) ·
  Audit Log
```

### Region 2 — APPLICATIONS (the studios & marketplace surfaces) · 5 groups
```
Marketplace
  Niches · Niche rules · Lifestyle Tags · Decoration compatibility ·
  Niche audit · Phrase audit
Design Studio
  Design Templates · AI Generator · AI Template Pool ·
  Die-lines · Die-line Curation · Mandatory Phrases · Facts Labels
Packaging Studio          ← PROMOTED to first-class (was buried + duplicated)
  Packaging Studio (model library) · Container Die-lines · Packing Types
Academy
  Overview · Courses · Lessons · Topics
Integrations & API
  Channels · Ingredient Data Sources
```

### Region 3 — HELP
```
Help Center
```

## Key moves (why)

| Move | Why |
|------|-----|
| Category review → **Inbox** | All approval/review work in one queue; frees a top-level slot |
| "Asset Management" + Products/Categories → **Catalog** | One home for everything you catalog/manage; "Asset Management" was an ambiguous label |
| Users & Roles → **People** | Plain-language, matches how admins think |
| **Finance promoted** to top-level | It was 3 levels deep inside Settings; it's high-frequency + high-stakes |
| **Settings slimmed** to config only | Removes the kitchen-sink; Compliance nested inside (infrequent, config-like) |
| **Packaging Studio promoted** in Applications | You asked for it; Container Die-lines + Packing Types move under it (they're packaging structures) |
| Studio catalogs stay in **Design Studio** | Mandatory Phrases / Facts Labels / Die-lines feed the studio |

Result: PRIMARY drops from ~11 → 8 top-level; Settings goes from ~13 children → config-only;
Applications gains a first-class Packaging Studio.

## Placeholder entries to REMOVE (empty/unbuilt — no dead links)

Hidden today (`hiddenUntilBuilt: true`) — delete from config:
`Phrase submissions`, `Packaging Materials`, `Die-Cut Design Templates`, `Graphics Library`,
`Fonts Library`, `Erasure requests`, `Sub-processors`, `Notification templates`,
`Broadcasts`, `Support workflows`, `Market Profiles`, `Regulation Matrix`,
`Compliance Gallery`, `Analytics & Monitoring`, `Integrations → Marketing`,
`Integrations → Analytics`, and the **duplicate** `Packaging Studio` (`/applications/packaging-studio`).

That removes the whole **Communications** group (all 3 children hidden) and the **Global
Compliance Center** sub-group (all 3 hidden). If you later build them, they come back under
Settings.

## Open questions before I implement

1. **Finance top-level** — promote as shown, or leave nested in Settings?
2. **Rendered-but-thin pages** — beyond the hidden ones above, are any of these actually
   empty stubs you want cut now? (e.g. Academy pages, Niche/Phrase audit, Routing preview,
   Decoration compatibility) — tell me which and I'll hide/remove them too.
3. **"Catalog" naming** — OK, or prefer "Catalog & Assets" / keep "Asset Management"?

## Sources
- Sidebar UX best practices (2026) — https://www.alfdesigngroup.com/post/improve-your-sidebar-design-for-web-apps
- UX navigation patterns — https://www.eleken.co/blog-posts/ux-navigation-design
- Dashboard IA principles — https://www.gooddata.ai/blog/six-principles-of-dashboard-information-architecture/
- IA for navigation (Abby Covert) — https://abbycovert.com/writing/information-architecture-for-navigation/
