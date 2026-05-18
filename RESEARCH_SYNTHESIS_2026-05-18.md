# iLaunchify — Research Synthesis & Scope Reframe

**Date:** May 18, 2026
**Sources:** Simona's persona research conversation (May 15–17, 2026) + technical audit of FOD-reference (May 18, 2026)
**Purpose:** Reconcile the research with the audit so the rebuild starts from a coherent business model.

---

## What the research changed

The original platform framing — "white-label platform for food, beverage, supplements, pet food, baby food" — is **too broad and partially mis-targeted**. The research narrows it sharply, and that narrowing should drive the rebuild scope.

### Validated personas

**Demand side: Creators, in three tiers.**

| Tier | Audience size | What they need |
|---|---|---|
| Emerging | 10K–100K followers | Validating their first product |
| Established | 100K–1M | Scaling a product line |
| Creator brand | 1M+ | Managing a multi-SKU CPG brand |

The platform's entire architecture — automatic approval, Design Studio, dual-dispatch fulfillment, "Manufactured for" labeling, Subscribe & Save — was built around this persona. This is product-market fit territory.

**Supply side: Small contract manufacturers (Tier 1).**

| Attribute | Profile |
|---|---|
| Size | 10–100 employees, $1M–$20M annual revenue |
| Categories | Supplements, beauty/skincare, functional food & beverage |
| MOQ | 500–5,000 units per run |
| Compliance | FDA registered, GMP certified |
| Decision-maker | Owner or VP Sales (accessible directly) |
| Core motivation | Fill excess capacity, reduce CAC |
| Core anxiety | Client contracts canceling, unpredictable order flow |
| Platform fit signal | Already works with emerging/indie brands |

Tier 3 (specialty/niche — vegan, organic, allergen-free, Halal, Kosher) is a strong secondary onboarding target because their specialization becomes a filter for creators. **Tier 2 mid-size co-mans are not launch partners** — their MOQs don't match creator demand signals early.

### Rejected personas

- **Generic small businesses** doing white/private label sourcing. Alibaba/Faire territory, price-sensitive, operational mental models don't match a creator-first UX.
- **Fitness/beauty chain procurement** (Planet Fitness scale). Procurement-driven, bulk POs, long sales cycles — your fulfillment architecture (per-order dual-dispatch) is wrong for them.
- **Local fitness/beauty studios.** Volume too low. The exception (high-trust boutique with cult following) folds back into the creator profile.

### The unifying variable

**Community trust, not channel type.** A 90K-follower fitness creator on Instagram and a 3-location boutique studio with a cult following are the same persona for purposes of this platform. A 2,400-location commodity gym is not, regardless of scale.

This is the single most important insight in the research. It means:
- Persona research stays tight on one trust-driven profile.
- Product decisions stay coherent (one platform, one relationship model).
- Marketing stays focused (community-led growth, not enterprise sales).

### What's still unknown

1. **Print providers persona** — Simona was about to start this. Critical for the dual-dispatch model.
2. **End consumer behavior** — no research on who actually buys a creator's product. Affects pricing, Subscribe & Save mechanics, return policy.
3. **Manufacturer onboarding flow** — the research established WHO; not yet HOW (sales motion, fee structure, terms).
4. **Partial transparency sensitivity** — the research hypothesized that smaller manufacturers accept anonymity for volume, larger ones resist. Worth user-validating before locking the "Manufactured for" mechanic.

---

## Mapping research → rebuild scope

### Scope changes vs. the original codebase

| Original FOD framing | Reframed scope | Why |
|---|---|---|
| Food, beverage, supplements, **pet food**, **baby food** | **Supplements, functional food & beverage** (V1); **beauty/skincare** (V2 candidate) | Research-validated categories. Pet food and baby food are heavily regulated industries with very different consumer behaviors and zero match to the creator/community-trust model. |
| "White-label platform" (one-sided framing) | **Two-sided marketplace**: Creators × (Manufacturers + Print providers) | Research is explicit about dual-dispatch + supply-side onboarding. The codebase only partially reflects this. |
| 5 jurisdictions (US, EU, CA, AU, UK) at launch | **US/FDA only at launch.** Multi-jurisdiction is V2+. | One jurisdiction, done correctly (rule packs, label format, claims dictionary) beats five jurisdictions stubbed. Audit confirmed only US has even an empty rule pack. |
| Multiple state libraries, multiple ORMs, multiple auth attempts | **One of each.** | Audit found 4 state libraries, 3 auth systems, 2 DB stacks coexisting. The cost of polyglot at this stage is the project. |
| Microservices fleet (28 containers) | **Modular monolith** for V1: one Next.js app + one Python compliance/calc service + Prisma/CockroachDB. | Audit confirmed the microservices are aspirational. A modular monolith ships faster and can be decomposed later when scale demands. |

### The non-negotiable moat to build

The research explicitly names the platform's moat: **"compliance workflow, print coordination, creator-facing UX."**

The audit found these three things in this state:
- **Compliance workflow:** scaffolded but empty (1 rule pack, 21 lines, hardcoded sodium check).
- **Print coordination:** partially scaffolded in backend; no real wiring in frontend.
- **Creator-facing UX:** 21 competing recipe-builder variants, a 7,812-line "Enhanced" builder, build silences errors.

**The rebuild has to make all three real.** The audit's recommendation — port the schema, port the calc engine, port the USDA pipeline, port the order FSM, but build compliance intentionally — exactly matches the research's strategic prioritization.

---

## V1 scope (what the rebuild ships)

**One creator vertical, one jurisdiction, one supply-side flow done end to end:**

1. **Categories:** Supplements + functional food & beverage. (Pet/baby deferred. Beauty/skincare as V2 candidate.)
2. **Jurisdiction:** US/FDA only. 21 CFR 101 (Nutrition Facts) + 21 CFR 111 (DSHEA Supplement Facts panel).
3. **Personas in V1:**
   - Creator (Tier 1 emerging, 10K–100K followers — the most underserved tier)
   - Small contract manufacturer (Tier 1 supply-side)
   - Print provider (Tier 1 — provisional until Simona's research completes)
4. **Core flows:**
   - Creator: signup → product design (recipe + ingredients + USDA pickup) → FDA compliance check → label generation → publish to creator's storefront → first order
   - Manufacturer: signup → capability profile → MOQ & lead time settings → receive routed orders → fulfill
   - Print provider: signup → capability profile → receive label print orders → fulfill
   - End consumer: visit creator storefront → buy → Stripe checkout → dual-dispatch order → receive product

**Out of V1:**
- EU/CA/UK/AU jurisdictions
- Pet food, baby food
- Marketplace browsing (creators discovering manufacturers)
- Subscribe & Save (V1.5 — needs end-consumer research first)
- Multi-currency
- Public storefront templates beyond one default
- Admin analytics dashboards
- Audit log UI

---

## Open questions for Pavel & Simona

Before locking architecture, three things to confirm:

1. **Print provider tier.** The research hasn't run yet. For the V1 sketch, I'll assume "small US-based print-on-demand providers capable of food-grade label printing with FDA-compliant ink + facility certification." If you and Simona land somewhere different, the schema and onboarding flow may shift.

2. **Beauty/skincare in V1 or V2?** The research surfaced it as adjacent to the validated supplements/food&bev categories (similar manufacturer profile, similar creator profile). But beauty has its own regulatory stack (cosmetics labeling rules, MoCRA registration). Including it in V1 doubles the compliance work. Defer to V2 is the safer call.

3. **"Manufactured for" labeling sensitivity.** The research raised this as a real manufacturer concern but didn't validate it with actual manufacturers. The schema needs to know whether the manufacturer's name is fully hidden, partially shown (city/state only), or fully visible per the manufacturer's choice. I'll design the schema to support all three; the UX choice can come from user-testing.

---

## What changes about the audit's "what to keep" list

The audit recommended porting forward 10 assets. The research **confirms 8 of them** and **demotes 2:**

**Confirmed valuable:**
- Prisma schema (27 models)
- Calculation engine (`services/calculation/calc_service.py`)
- Order lifecycle FSM (`services/orderLifecycleService.js`)
- USDA data + chunking pipeline
- Domain types under `frontend/src/types/`
- Nutrition Facts renderer (`NutritionFactsRenderer.tsx`)
- Architecture docs in `/docs/` (as design priors)
- PDS service schema concept (not necessarily the implementation)

**Demoted:**
- **Multi-jurisdiction `JurisdictionContext.tsx`** — not needed in V1 (US only). Keep the *concept* for V2; rebuild fresh.
- **Kong gateway** — not needed in V1 (modular monolith). Reintroduce when microservices split.

**Added back to the keep list given the research:**
- The conceptual model of "Manufactured for" / partial transparency. The schema needs to support this from day 1.
- The dual-dispatch order routing logic — even if the implementation in `backend/services/` is small, the *model* matters and should be ported.

---

## Next steps

1. Sketch the rebuild repo (folder tree + ARCHITECTURE.md + scaffolded skeleton).
2. Pavel + Simona react to the V1 scope above and the three open questions.
3. Simona finishes print provider research; we update the supply-side schema if needed.
4. Begin V1 build, week 1: schema port + auth + basic CRUD.

---

*This synthesis is a living document. As Simona's research continues, update sections accordingly.*
