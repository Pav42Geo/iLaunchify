# Creator Recipe Customization — US Regulatory Reality & Design Guardrails

**Prepared:** 2026-06-27 · Research memo (FDA.gov + eCFR primary sources).
**Not legal advice.** This informs the product model; the option-space, category gates, and any label/liability language must be confirmed with regulatory counsel — and, for canned/acidified products, a qualified *process authority* — before being encoded as hard production gates. (Consistent with the project's "specialized counsel for liability language" principle.)

---

## 0. The question

Does the FDA approve each food/beverage recipe — and re-approve it whenever a manufacturer (or a creator, on the fly) changes or adds an ingredient? If so, an "on-the-go customization" model would stall behind FDA approval. If not, what actually constrains it?

## 1. Verdict

- **"FDA approves each recipe" → MOSTLY FALSE.** There is **no FDA pre-market approval** of conventional food/beverage recipes or formulas, and **no re-approval** when an ingredient changes. That submit→prove-safety→approve model is the **drug** model. FDA does not approve food products *or* food labels; it enforces **after market** via misbranding/adulteration. The manufacturer self-determines compliance.
- **Kernel of truth at the *ingredient* layer (not the recipe):** a brand-new **non-GRAS food additive** or a **color additive** needs FDA pre-market approval — of the *substance*, industry-wide — not of your formula. Most new ingredients use **GRAS**, which can involve *zero* FDA interaction (GRAS self-determination; the GRAS notice is voluntary).
- **Dietary supplements are the exception that matters:** adding a **novel New Dietary Ingredient (NDI)** triggers a **75-day pre-market notification** (FD&C §413). Swapping a pre-1994 / already-marketed / already-notified dietary ingredient does **not**.
- **A few categories are hard-gated** (process/filing sits between change and production): **low-acid canned foods & acidified foods** (FCE registration + filed scheduled process; a formulation change affecting pH/process re-triggers it), **juice & seafood HACCP** (documented hazard reanalysis on change), **infant formula** (90-day notification; any reformulation = a "new formula").

**So your customization instinct is right; only the "FDA approves it" premise is wrong.** The thing that makes on-the-go customization safe isn't FDA sign-off (there is none for ordinary food) — it's a **manufacturer-pre-vetted, bounded option set** plus an automatic, deterministic label recompute.

## 2. What a conventional-food ingredient change *actually* requires (all manufacturer-owned, no FDA approval)

1. **Ingredient statement** re-ordered by descending predominance by weight — 21 CFR 101.4.
2. **Nutrition Facts** recalculated; records substantiating values retained — 21 CFR 101.9.
3. **Allergen declaration** updated for the **Big-9** (incl. sesame since Jan 1 2023) — FALCPA + FASTER Act, FD&C §403(w). Missing one = misbranded.
4. **Food-safety plan reanalysis** if the change creates a new/elevated hazard (e.g., new allergen) — FSMA Preventive Controls, 21 CFR 117 Subpart C. Self-authored, FDA-*inspected*, **not filed/approved**.
5. **The new ingredient must itself be lawful** — GRAS, prior-sanctioned, or an approved additive used within its scope; colors must be listed/certified.

All four label/safety items are **computable or selectable** — exactly what the platform's label engine already does deterministically. None is an FDA gate.

**Liability note (private label / co-manufacturing):** the brand owner whose **name is on the label** bears ultimate FDA misbranding responsibility and **cannot contract it away**; the contract manufacturer shares cGMP/food-safety duty and must propagate any ingredient change back to the brand to re-validate the label. In iLaunchify the brand owner is the **creator** — so a creator-driven swap re-points label responsibility to the creator, with the manufacturer responsible for safely producing within its vetted option space.

## 3. Does "on-the-go" customization work? Yes — under four conditions

Because there is **no FDA approval to wait on** for ordinary food, a creator customizing a recipe can be **instant** when:

1. **The label recomputes correctly** for the permutation (ingredient list, Nutrition/Supplement Facts, allergens). ✅ deterministic, already built.
2. **Every swappable/addable ingredient is lawful** (GRAS/approved; for supplements, *not* a novel NDI; colors listed/certified).
3. **The manufacturer's food-safety plan already covers the option space** (allergen control, hazards) — done **once** at template-build time, not per order.
4. **The product category isn't hard-gated** (see §5).

These conditions are satisfied by **bounding creator freedom to a manufacturer-pre-vetted option set** — which is precisely your replaceable/optional-ingredient design.

## 4. Why your replaceable / optional model is the right mechanism

The manufacturer, **once**, at template-build time, defines: the base recipe, which slots are **replaceable**, which **optional**, and the **allowed options** per slot. Each option is pre-cleared — lawful ingredient, known allergen flags, costed, within the safety plan. A creator then composes **only within that space**, so every permutation is automatically compliant and the label auto-recomputes. **No per-swap FDA step. No per-swap manufacturer re-approval.** The "approval" that matters happened once, when the manufacturer blessed the option matrix — not on each creator order.

This is why the complexity wasn't wasted: the slot/replaceable/optional graph **is** the compliance boundary. The danger is only **free-form "add any ingredient"** — which can't guarantee lawful/safe/in-plan — so that path must **not** be instant.

## 5. The guardrails to encode (the actionable part)

- **Per-option lawful-status** on each allowed ingredient: e.g. `GRAS | APPROVED_ADDITIVE | LISTED_COLOR`; for supplements `PRE_1994 | FOOD_SUPPLY_UNALTERED | NDI_NOTIFIED | REQUIRES_NDI_NOTIFICATION`. Only instant-eligible statuses may appear in a creator-customizable slot. ("Previously marketed" is the manufacturer's evidentiary burden — there's no authoritative FDA grandfathered list — so curating the allow-list *is* a compliance artifact.)
- **Allergen recompute per permutation** (already auto-derived) — surface "Contains" changes to the creator at customization time.
- **Category instant-eligibility gate** (§ below). Only Tier C flows straight through.
- **Out-of-bounds = review, not instant.** Free-form additions, novel dietary ingredients, or anything outside the vetted set route to the manufacturer's existing approval FSM (`PENDING_EDIT_REVIEW`) — and flag NDI (supplements) / process re-filing (acidified/LACF) where relevant.
- **Manufacturer attestation** that the customizable option space is within its food-safety plan + (for Tier A) validated by a process authority. Snapshot it for legal reproducibility.

### Category gating for "produce now"

| Tier | Categories | On-the-go customization |
|---|---|---|
| **A — hard gate** | Infant formula; **low-acid canned**; **acidified** (incl. many shelf-stable canned/bottled beverages, salsas, dressings) | **Not instant.** A formula change can move pH / invalidate the filed scheduled process (or re-trigger the 90-day infant-formula notice). Requires manufacturer/process-authority validation of the *whole option set* up front, or it routes to review. |
| **B — process gate** | Juice (Part 120), seafood (Part 123) HACCP; any added **certified color** | Allowed only if the option set is within the validated HACCP plan + colors are listed/certified; otherwise route to reanalysis. |
| **C — no filing gate** | Most ambient/standard foods: powders, bars, baked goods, confections, snacks, dry mixes, RTD non-acidified, refrigerated/frozen non-seafood | **Straight through** with automatic label + allergen recompute and a lawful-ingredient check. This is the sweet spot for instant creator customization. |

## 6. Reconciliation with "declare-first manufacturer onboarding"

These two threads fit together cleanly:
- **Manufacturer onboarding → declare-first.** A manufacturer already has the product + finished label; let them *declare* it (panel + ingredient statement + allergens). Don't force a from-scratch recipe build. (Lower friction, lower platform compliance exposure — the panel is manufacturer-attested.)
- **Creator customization → the replaceable/optional COMPUTE engine.** This is exactly where the slot/ingredient/compute module earns its keep: it recomputes the label for each creator permutation within the vetted option space.

So the heavy recipe/ingredient/cost builder isn't "complexity to delete" — it's **mis-placed as the manufacturer's default**. Move it to power **creator customization** (your original idea), and default manufacturer onboarding to declare-first. Both threads validated.

## 7. Bottom line

You can offer creators **limited, on-the-go recipe customization with instant, compliant output** — for Tier C products, bounded to a manufacturer-pre-vetted option set, with automatic label/allergen recompute. No FDA recipe approval exists to block it. Hard-gate Tier A (and validate Tier B) by category, and route anything outside the vetted set — or any novel/NDI ingredient — to manufacturer review. Encode the option-status + category gates, then have counsel + a process authority confirm them before they go live.

---

## Sources

**No FDA recipe/label approval; additives vs GRAS; colors:**
fda.gov/consumers/consumer-updates/it-really-fda-approved · fda.gov/food/food-ingredients-packaging/generally-recognized-safe-gras · fda.gov/food/food-additives-and-gras-ingredients-information-consumers/understanding-how-fda-regulates-food-additives-and-gras-ingredients · fda.gov/food/color-additives-information-consumers/understanding-how-fda-regulates-color-additives · fda.gov/industry/color-certification/color-certification-faqs

**Labeling + food-safety obligations on an ingredient change:**
ecfr.gov 21 CFR 101.4 · 21 CFR 101.9 · 21 CFR 101.36 (Supplement Facts) · fda.gov FALCPA + FASTER Act (sesame) · ecfr.gov 21 CFR 117 (+ Subpart C reanalysis) · fda.gov FSMA Preventive Controls · ecfr.gov 21 CFR Part 171 (Food Additive Petitions) · 21 CFR Part 170 Subpart E (GRAS notice) · fdaimports.com (private-label brand-owner liability)

**Dietary-supplement NDI:**
fda.gov/food/dietary-supplements · fda.gov NDI notification process + "NDIs – Background for Industry" (75-day, §413 / 21 U.S.C. 350b; pre-1994 + food-supply-unaltered exemptions) · fda.gov draft NDI guidance

**Category hard gates:**
fda.gov LACF/acidified establishment registration & process filing · ecfr.gov 21 CFR Part 113 / 114 + LACF Inspection Guide 8 (formulation change → new scheduled process; pH ≤ 4.6) · fda.gov infant formula regulations + FAQ (90-day; reformulation = new formula); ecfr.gov 21 CFR 106/107 · ecfr.gov 21 CFR Part 120 (juice HACCP) · fda.gov seafood HACCP Part 123 · ecfr.gov 21 CFR Part 73/80/82 (colors)
