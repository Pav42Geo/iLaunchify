# Creator Recipe Customization — Phased Build Plan

**Prepared:** 2026-06-27 · Implements `docs/CREATOR_RECIPE_CUSTOMIZATION_REGULATORY.md`.
**Thesis (from the research):** there is no FDA recipe-approval gate for conventional food, so on-the-go creator customization can be **instant** when it's bounded to a **manufacturer-pre-vetted option set of lawful ingredients**, the label auto-recomputes, and the product isn't a hard-gated category. This plan adds exactly those guardrails. All schema is **additive + CockroachDB-safe**; the whole feature sits behind a per-product flag defaulting **false**, so nothing changes until a manufacturer opts in. Counsel/process-authority sign-off gates go-live, not the code.

## What already exists (do NOT rebuild)

- `ProductOptionAxis` — `editableByCreator`, `affectsLabel`, `boundSlotId`, `required`, `isActive` (the permission matrix).
- `ProductOptionValue` — `recipeOverlay` (the swap/add operation) + `OverlayOp` + `OptionValueStatus`.
- `TemplateIngredientSlot` (+ `allowReplacement`), `TemplateIngredientReplacement`, `TemplateOptionalIngredient` — the replaceable/optional option space.
- `Ingredient` — `allergenFlags`, `verificationStatus`, `bioengineeredStatus`, `complianceNotes`.
- Label engine recomputes Nutrition/Supplement Facts + allergens deterministically.
- Edit-review FSM (`PENDING_EDIT_REVIEW`) for routing out-of-bounds changes.
- Recipe-entry modes already exist: `SEARCH_BUILD` / `AI_PARSER` / `DECLARED_PANEL` (only Mode 1 lit; Declare gated to Trusted+).

**Missing = the regulatory metadata + the gating logic + the declare-first default.** That's this plan.

---

## PR-A — Schema (additive). Needs one `pnpm db:push`.

```prisma
// Food-side ingredient legality (drives whether an option can be customized instantly).
enum IngredientLawfulStatus {
  GRAS_LISTED         // 21 CFR 182/184 listed/affirmed GRAS
  GRAS_SELF_AFFIRMED  // company GRAS self-determination (no FDA notice)
  APPROVED_ADDITIVE   // approved food additive used within its scope
  PRIOR_SANCTIONED
  LISTED_COLOR        // listed / certified color additive
  RESTRICTED          // limited use — not instant; needs review
  UNVERIFIED          // default — not classified, NOT instant-eligible
}

// Supplement-side novelty status (21 CFR / FD&C §413).
enum NdiStatus {
  PRE_1994                  // marketed in a supplement before Oct 15 1994
  FOOD_SUPPLY_UNALTERED     // present in food supply, not chemically altered
  NDI_NOTIFIED              // covered by a prior NDI notification
  REQUIRES_NDI_NOTIFICATION // novel — 75-day notice required, NOT instant
  NOT_APPLICABLE            // non-supplement ingredient
  UNKNOWN                   // default
}

// Category instant-eligibility (research §5 tiers).
enum CustomizationTier {
  TIER_C_INSTANT  // ambient/standard food — instant customization OK
  TIER_B_PROCESS  // juice/seafood HACCP, certified color — needs validated plan
  TIER_A_GATED    // acidified/LACF/infant — never instant; manufacturer/process review
}

// model Ingredient — add:
  lawfulStatus IngredientLawfulStatus @default(UNVERIFIED)
  ndiStatus    NdiStatus              @default(UNKNOWN)

// model Category — add (safe default = most restrictive; admin opts categories into instant):
  customizationTier CustomizationTier @default(TIER_A_GATED)

// model ProductTemplate — add (manufacturer opt-in + attestation, snapshotted for legal reproducibility):
  creatorCustomizationEnabled Boolean @default(false)
  customizationAttestation    Json?   // { attestedById, attestedAt, withinSafetyPlan, processAuthorityValidated?, optionSpaceSnapshot }
```

Reversible: every change is an additive nullable column / new enum; the feature is dark until `creatorCustomizationEnabled` is set.

---

## PR-B — Classify the data (seed + admin). App + seed; no schema.

- **Seed ingredient statuses conservatively.** USDA FoodData whole-food ingredients → `GRAS_LISTED`; clearly-additive entries → leave `UNVERIFIED`/`RESTRICTED`; partner-private ingredients → `UNVERIFIED` by default (they're self-attested today). For supplement library ingredients, seed `ndiStatus` where the marketing history is known, else `UNKNOWN`. **Conservative default means nothing is instant-eligible until a human classifies it — the right failure mode.**
- **Admin classification UI** (extends the existing ingredient governance queue): set `lawfulStatus` / `ndiStatus`; this is a *compliance artifact*, not a lookup (there's no authoritative FDA grandfathered list), so it's a counsel-reviewable admin action.
- **Admin category tiers:** classify the 13 locked categories into `customizationTier` (most ambient/standard → `TIER_C_INSTANT`; canned/acidified/juice/seafood → A/B; infant formula stays A).

---

## PR-C — Declare-first manufacturer default. App-only (UX); no schema.

Reprioritize the existing recipe-entry modes (research §6 + the earlier simplification thread):
- Default the Food recipe step to **`DECLARED_PANEL`** for manufacturer onboarding (they already have the finished label).
- **Un-gate Declare** — remove the Trusted+ lock; the low-friction path should be free/default.
- **Demote `SEARCH_BUILD`** to an "Advanced / build from scratch" option, and reframe the slot/ingredient/cost compute engine as the **creator-customization** engine (where it earns its keep computing labels per permutation).
- Supplement/Cosmetic/Pet already lean declared — leave as-is.

This is the cheap, high-leverage friction cut, independent of the rest.

---

## PR-D — Gating logic + manufacturer opt-in. App-only; uses PR-A columns (cast-guarded until push).

Two pure helpers (single source of truth):
- `isOptionInstantEligible(option, domain)` → true iff the option's overlay ingredient(s) are instant-safe: food → `lawfulStatus ∈ {GRAS_LISTED, GRAS_SELF_AFFIRMED, APPROVED_ADDITIVE, PRIOR_SANCTIONED, LISTED_COLOR}`; supplement → `ndiStatus ∈ {PRE_1994, FOOD_SUPPLY_UNALTERED, NDI_NOTIFIED}`.
- `productInstantCustomizable(template, category)` → `category.customizationTier === TIER_C_INSTANT` (or B with a validated plan) **and** `template.creatorCustomizationEnabled` **and** every `editableByCreator` option is instant-eligible.

Manufacturer builder:
- A **"Enable creator customization"** toggle on the template — selectable **only** when the category tier allows it and all exposed options are instant-eligible; otherwise it shows *why* (which option / category blocks it).
- On enable, capture the **attestation** (within safety plan; process-authority validated for Tier B) into `customizationAttestation` + snapshot the option space.
- Anything out-of-bounds (free-form add, an `UNVERIFIED`/`REQUIRES_NDI_NOTIFICATION` ingredient, a Tier A/B category without validation) → **not instant**: route to the existing `PENDING_EDIT_REVIEW` FSM with the reason.

## PR-E — Creator-facing customization (later, larger). App; uses the above.

The creator UI to swap replaceable slots / toggle optional ingredients **within the vetted space**, with the label + allergen panel recomputing live (engine exists). Orders from an instant-eligible composition flow straight to production; out-of-bounds compositions are disabled or routed to manufacturer review. This is the big creator feature and belongs after A–D land.

---

## Sequencing, reversibility, and the compliance gate

1. **PR-A** (schema, one push) → **PR-C** (declare-first, ships value immediately, independent) → **PR-B** (classify) → **PR-D** (gating + opt-in) → **PR-E** (creator UI).
2. Everything is **additive and dark by default** (`creatorCustomizationEnabled=false`, `customizationTier` defaults to gated, ingredient statuses default to not-instant). You can land A–D with zero behavior change and flip products on one at a time.
3. **Compliance gate is human, not code:** the *defaults are safe* (nothing instant until classified + attested), but before enabling instant customization on any real category/product, the ingredient lawful-status classifications, the category tiers, and the attestation language must be confirmed with **regulatory counsel** (and a **process authority** for any Tier B line). The code enforces the boundary; counsel sets where the boundary is.

## One-line summary

Add `lawfulStatus`/`ndiStatus` to ingredients, `customizationTier` to categories, and a `creatorCustomizationEnabled` + attestation to the template; gate "instant customize" on (category tier ∧ every exposed option lawful ∧ manufacturer attested); route everything else to the review FSM; and default manufacturer onboarding to declare-first so the compute engine moves to where it belongs — powering creator customization.
