# Routing binding model — D2 / D4 / D5 decision brief

**For:** Pavel · **Date:** 2026-06-22 · **Source:** `docs/ROUTING_BINDING_MODEL.md` §6, §9
**Purpose:** lock the three open routing decisions so `findRouting` can be finalized.
**Context:** D1 LOCKED (owner unavailable → cancel + refund). D3 largely done (print leg
honors the configured `PackagingComponent.partnerOfferingId`; owner-preferred fallback).
None of these three are individually large; they're blocking because the memory rule says
**don't touch `findRouting` until D1–D4 are locked.** Locking D2 + D4 lifts that block.

Each decision below: the question, what's at stake, the options, a recommendation, and what
locking it changes in code.

---

## D2 — null `manufacturerServiceId` (legacy / seed products)

**Question.** Some `ProductTemplate`s have no owner manufacturer pinned (legacy rows + seed
data created before the owner-product model). When such a product is ordered, how should the
manufacturing leg route?

**Stakes.** Low. Affects only un-pinned products. New products created through the current
builder always get an owner, so this is a backward-compat question, not a go-forward one.

| Option | Behavior | Pros | Cons |
|---|---|---|---|
| **A. Category-match fallback (status quo)** | Fall back to the old "shop manufacturers by category + scoring" path for null-owner products only | Nothing breaks today; legacy/seed products stay orderable for demos | Re-introduces the "shop the recipe" anti-pattern for these rows — the exact thing the owner-model fixes |
| **B. Treat null-owner as un-routable → ON_HOLD** | Refuse to auto-route; park the order for an admin to assign a manufacturer (or backfill the owner) | Honest — never silently routes a recipe to a manufacturer who didn't author it; forces data cleanup | A legacy/seed product order needs manual admin touch to proceed |

**Recommendation: A (category-match fallback), scoped to null-owner only — but treat it as a
migration smell, not a feature.** It's the conservative choice (zero regressions) and the
owner-model already governs every *new* product. Pair it with a quick admin report of
"PUBLISHED products with no manufacturerServiceId" so the legacy set can be backfilled and the
fallback eventually deleted. If the legacy set is already empty/near-empty in your DB, prefer
**B** — it's cleaner and the manual-touch cost is ~zero.

**What locking unblocks:** `findRouting` keeps (A) or adds (B) a single guarded branch for the
null-owner case; either way the "shop by category for owned products" bug is removed for
everything that *has* an owner.

---

## D4 — generic-BOM products ("shop the manufacturer")

**Question.** Should V1 support platform-owned commodity SKUs where there is *no* single owner
manufacturer and the platform genuinely shops multiple manufacturers on price/capacity (a real
marketplace match, not owner-pinned)?

**Stakes.** Scope-defining. This is the difference between "orchestrate the creator's owned
product" (V1 thesis) and "platform-run commodity catalog" (a different, bigger product).

| Option | Behavior | Pros | Cons |
|---|---|---|---|
| **A. Confirm V2-only (recommended)** | V1 is owner-product only; generic-BOM "shop the manufacturer" is explicitly out of scope | Keeps V1 focused; matches the orchestration thesis + pooling/buffer-inventory deferrals; no new routing path to build or test | No platform-commodity SKUs at launch (you weren't planning them for V1 anyway) |
| **B. Build a V1 generic-BOM path** | Add a routing mode that shops manufacturers by capability tuple for owner-less commodity products | Enables a commodity catalog | New routing path + fairness/pricing logic + new failure modes, all unbudgeted for V1; competes with the owner model |

**Recommendation: A — confirm V2-only.** This is the natural close of the owner-product model
and consistent with every other "earn the right to" deferral (pooling, buffer inventory).
Saying it explicitly is what lets `findRouting` drop the generic-BOM branch entirely for V1.

**What locking unblocks:** `findRouting` has exactly two cases — owner-pinned manufacturing
(not routed) + bound commodity legs (print/copack/warehouse). No third "shop the manufacturer"
mode. Simpler engine, smaller test surface.

---

## D5 — multi-flavor lead time (sequential vs parallel)

**Question.** When a variety pack contains N flavors, does the manufacturer run them
**sequentially** (≈ N × single-flavor lead time) or **in parallel** (≈ single-flavor lead
time)? This sets the promised delivery date shown at checkout.

**Stakes.** Medium — it's a customer-facing accuracy question (quoted ETA) and a
partner-fairness one (under-quoting forces declines / delay-accepts; over-quoting loses
orders). Schema already supports per-band, first-run-vs-repeat lead times (§9); only the
multi-flavor rule is unspecified.

| Option | Behavior | Pros | Cons |
|---|---|---|---|
| **A. Manufacturer declares; default parallel (recommended)** | Add a per-service (or per-product) flag "flavors run sequentially?"; default OFF → quote = single-flavor band time | Accurate to the real line; default matches the common case (most co-mans run flavors in parallel batches); partner owns the truth | One small field + one quote-math branch to wire |
| **B. Always parallel** | Quote = single-flavor band time regardless of flavor count | Simplest; no new field | Under-quotes sequential lines → more delay-accepts / declines on big variety packs |
| **C. Always sequential** | Quote = N × single-flavor band time | Never under-quotes | Over-quotes the common (parallel) case → scares creators off variety packs with inflated ETAs |

**Recommendation: A — manufacturer declares, default parallel.** It's the honest model and the
default already matches reality, so most products need zero partner action. It also leans on the
delay-accept flow (§7, already built) as the safety net when a partner's real timing differs.
If you want the absolute-minimum-V1 cut, **B** is acceptable and delay-accept absorbs the
mis-quotes — but A is a single field and removes a recurring friction.

**What locking unblocks:** the quote/routing lead-time resolver (already band-matched per §9)
adds one branch: `quotedLeadDays = sequential ? sum(flavorBandDays) : max(flavorBandDays)`.
First-run-vs-repeat surfacing can ride the same change.

---

## One-line lock-ins to sign

- **D2:** ☐ A (category-match fallback, null-owner only, + backfill report) · ☐ B (null-owner → ON_HOLD)
- **D4:** ☐ A (generic-BOM is V2-only — confirmed out of V1)
- **D5:** ☐ A (manufacturer declares; default parallel) · ☐ B (always parallel)

Once D2 + D4 are checked, the "don't touch `findRouting`" hold lifts and the engine can be
finalized to the two-case model; D5 is a follow-on quote-math wire that doesn't block the engine.
