---
name: ilaunchify-markets-and-regions
description: "Market (regulatory jurisdiction) and Region (geographic location) are TWO concepts, both V1 schema even though V1 ships US-only. Adding later is migration-hostile."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

In iLaunchify, "market" and "region" are TWO distinct concepts that drive different decisions:

**Market** = regulatory + commercial jurisdiction (US/FDA, CA/CFIA, EU/EFSA, GB/FSA). Drives label rules, allergen policy, language requirements, currency, rule pack selection. V1 = US only ACTIVE + CA seeded as COMING_SOON (hidden).

**Region** = physical location (partner facility, creator brand, shipping destination). Drives shipping cost, lead time, partner-proximity matching, freight options. V1 = US states + 5 US sub-regions (NE/SE/MW/SW/NW per Census Bureau) + state tree.

**Both schemas land in V1** even though V1 only activates US, because adding them later is migration-hostile — existing partner/product references become ambiguous when retroactively scoped to markets.

**Models added V1:** Market + MarketConfig + Language + MarketLanguage + Region (with tree + centroidLatLng + shippingZone) + PartnerMarketCert (partner-market with cert ref + expiry) + BrandTargetMarket. Partner gains primaryRegionId; Brand gains operatingRegionId; ProductTemplate gains targetMarkets many-to-many.

**Matching algorithm (V1):** marketplace ranks partners for a creator by:
- Hard filters: partner.marketsCert covers creator.targetMarkets + capability overlap + status ACTIVE
- Soft rank: proximityScore (1.0 same-state / 0.7 same-sub-region / 0.4 same-country / 0.0 cross-country) × 50 + certification overlap × 30 + leadTime × 15 + price × 10 − recent disputes × 20

**Onboarding additions V1:** Partner declares which markets they serve + cert numbers + expiry (admin verifies in existing Vendor Verification queue, extended to 5 sections). Brand declares operating region + target markets (US auto-selected for V1).

**Marketplace UI V1:** Sidebar gains Market filter (auto-filled from brand's primary target market) + Proximity filter (Anywhere / My region / My state). Partner cards show proximity chip + market certification chip + cert badges.

**Admin scope V1:** Minimal `/admin/markets` (CRUD + language assignment) + `/admin/regions` (read-only with display-name + shipping-zone editing). FOD's 6-tab admin (Markets / Assignments / Translations / Settings / TemplateSpecs / RulePacks — 5,783 lines) deliberately NOT replicated; deferred to V1.5+.

**Roadmap:**
- V1 (now) — US-only ACTIVE, CA COMING_SOON
- V1.1 — CA activation, bilingual EN+FR label rendering, Health Canada cert, translation strings UI
- V1.5 — Per-market rule pack management UI, per-market template assignments, per-market settings (number/date format, currency, weight units), real distance math in matching
- V2 — EU activation (27 member-state markets, EFSA rule packs, multi-currency Stripe, VAT, customs)
- V2.5 — APAC

**Why:** Pavel raised the gap 2026-05-24 after I incorrectly filed FOD's `/admin/languages-markets` as "V2 defer" in the FOD admin delta. The implementation IS V2-deferrable; the schema is V1-mandatory. Same architectural pattern as flavors-as-presets: build the right model day 1, ship the simplest config of it.

**How to apply:** Anything touching partner discovery, label rendering, compliance rule selection, or product cataloguing must reference Market and Region. Never hardcode "US" as a string; always reference the Market row. Future-self will thank you when Canada activates in V1.1 without a schema migration storm.

Related: [[ilaunchify-business-model]] (the B2B marketplace this matching serves), [[ilaunchify-flavors-as-presets]] + [[ilaunchify-ingredient-sourcing]] (other "build the right model V1, ship simplest config" decisions).

Canonical spec: `docs/MARKETS_AND_REGIONS.md`.
