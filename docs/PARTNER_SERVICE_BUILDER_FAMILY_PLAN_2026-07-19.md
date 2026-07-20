# Partner Service Builder family: manufacturing + print (co-packing is the template)

**Status:** PLAN + CHECKLIST. Written 2026-07-19 (Cowork). Origin: Pavel asked when to build the
manufacturing service builder (prototype `design/manufacturing-service-builder-prototype.html`) and to
fold in the print builder + its plan.

**The family.** Three partner service builders, one shape (6 steps, a live check that DERIVES the floor
from real economics instead of asking for a typed number, and a Review + standing step). They must look
and behave the same (Pavel: "same service builder prototype… the stepper as the co-creation stepper").

| Service | Prototype | Pricing model | Builder built? | Plan |
|---|---|---|---|---|
| **Co-packing** | `copacker-service-builder-prototype.html` | operations + line changeover | **YES** (CP-1..CP-6) | `COPACK_*` docs |
| **Print** | `print-service-builder-prototype.html` | per-process price curves (CIP4) | schema (PS-9-0) + PP-0 done; **UI + evaluator NOT built** | `PRINT_PRICING_SPEC_2026-07-15.md` |
| **Manufacturing** | `manufacturing-service-builder-prototype.html` | **batch economics** (batches derive MOQ) | **NO** (only a product builder + scattered editors) | this doc, §2 |

Co-packing is the proven template: pure engine first (CP-2), then the 6-step builder (CP-4), then the
money wiring behind a shadow flag (CP-3/CP-6). Manufacturing and print follow the same arc.

---

## §1 Manufacturing: the division of labor (the PREREQUISITE, decide before porting)

Co-packing had no prior authoring surface, so its builder was net-new. Manufacturing already has three
surfaces, so the risk is duplication (three places to set MOQ). Before building, this table fixes who
owns what. **The rule: the SERVICE builder describes the PARTNER (who they are, what their floor can
do); the PRODUCT builder describes a THING (one recipe/pack/price); onboarding is a quick first pass
that seeds the service builder, never the authority.**

| Concern | Owner after the builder lands | Today (to be migrated) |
|---|---|---|
| Identity, facility, lead times, **minimum order value** | **Service builder** (step 1) | scattered / missing |
| **Batch configs** (units/batch, batch time, loaded rate, changeover, max batches) → **derived MOQ + lattice + overrun** | **Service builder** (step 2) — NEW model | MOQ is typed flat in `ManufacturingEditor` + onboarding |
| Scope: categories, fill types, container formats | **Service builder** (step 3) | `ManufacturingEditor` capabilities + onboarding |
| Certifications | **Service builder** (step 3) + shared certs surface | `/certifications` |
| **Commercial defaults** (what pre-fills every product) | **Service builder** (step 4) | `settings/product-defaults` `ProductDefaultsForm` |
| Floors + **overrun policy** + live check | **Service builder** (step 5) — NEW | none (overrun is unmodelled) |
| Standing / merit badge | **Service builder** (step 6, read-only) | `/standing`, `/performance` |
| **Self-fill ceiling + overflow-to-co-packer** | **Service builder** (step 2/4) | none (`COPACK_SELF_FILL_OVERFLOW_BRIEF`) |
| **Capacity reservation** (per-week line/batch hours) | **Service builder** (step 2) | none (`COPACK_CAPACITY_RESERVATION_BRIEF`) |
| Per-product recipe, packaging, **price band**, per-product overrides | **PRODUCT builder** (`products/new`, `products/[id]/edit`) — unchanged | unchanged |
| Storage-at-facility, labeling/prepress | stays on the services workspace sections (already good) | unchanged |

**Migration discipline:** `ManufacturingEditor` (the capabilities card) and `ProductDefaultsForm` fold
INTO the builder (the way co-packing retired the legacy `CopackEditor`). The product builder is
untouched. Onboarding keeps a trimmed first pass that writes the same fields the builder reads, so a
partner is never asked the same thing twice.

**The one genuinely new idea (why this is an upgrade, not just consolidation):** MOQ stops being a
typed number and becomes DERIVED from batch economics, exactly as co-packing derives its floor from
changeover. `MOQ = the smallest batch you actually run`; a quantity snaps UP to a batch multiple (the
lattice); the remainder is `overrun` that an explicit policy bills or absorbs. This is the manufacturing
twin of the co-pack crossover, and it is the model the prototype's live check already runs.

---

## §2 Manufacturing service builder plan (MB-1..MB-6, mirrors CP-1..CP-6)

- **MB-1 — schema (additive, uuid, no drops).** `PartnerBatchConfig` (per manufacturing service:
  `unitsPerBatch`, `batchTimeHours` or minutes-Int, `loadedRateCentsPerHour`, `changeoverMinutes`,
  `maxBatchesPerRun`, `allergenClass`, `status`). Service columns: `minOrderValueCents`,
  `overrunPolicyPct` (0..100), the commercial-defaults home, and (folding the briefs in later)
  `selfFillMaxUnits` + `overflowCoPackerServiceId`. `db:push` + `db:generate` gate, same as CP-1.
- **MB-2 — pure batch engine (START HERE).** `packages/orders/src/batch-economics.ts`: `runBatches`,
  `deriveBatchMoq`, `selectBatchConfig` (min-overrun then min-cost), `batchLattice`, `billedUnits`
  (qty + overrun × policy), `batchOrderValueFloorOk`. Pure, no prisma, client-safe subpath (for the
  builder live check). Pin the prototype's numbers exactly (like `copack-quote.test.ts`).
- **MB-3 — writer + loader.** `saveBatchBuilder` (transactional: batch configs replace, config upsert,
  scope→capabilities merge) + `loadBatchQuote`-style DB adapter over the pure engine (mirrors CP-3.1).
- **MB-4 — builder UI.** Port `manufacturing-service-builder-prototype.html` 1:1 to
  `apps/partner/.../services/manufacturing/`, co-creation stepper chrome, live check on the real
  engine. Retire `ManufacturingEditor` + fold `ProductDefaultsForm` (division-of-labor migration).
- **MB-5 — wire the derived MOQ (shadow).** Routing reads the DERIVED MOQ (from batch configs) instead
  of the typed `capabilities.moqMin` (bridge them the way CP-5 bridged co-pack), and the overrun/billed-
  units feed the price behind the same `pricing:*` shadow discipline. Nothing charges differently until
  flipped.
- **MB-6 — the new-capability homes.** Self-fill ceiling + overflow (`COPACK_SELF_FILL_OVERFLOW_BRIEF`)
  and capacity reservation (`COPACK_CAPACITY_RESERVATION_BRIEF`) land in the builder, reusing CP-3/CP-6.

---

## §3 Print service builder plan (the UI vehicle for PRINT_PRICING_SPEC)

The print PRICING plan is `PRINT_PRICING_SPEC_2026-07-15.md` (PP-0 done; PP-1..PP-8 remaining). The
print SERVICE BUILDER (`print-service-builder-prototype.html`) is the UI HOME for those phases: the
per-process curve editor (PP-1), finishes (PP-2), floor + quote (PP-3), tooling/repeats (PP-6), and the
declaration-completeness fields (PP-7). Sequence:

- **PP-1 — the pure evaluator + curve UI.** `evaluatePrintPrice` (pure, `min()` over feasible curve
  segments, crossover EMERGENT), pinned against the prototype's 11,444 crossover. Then the print builder
  UI (port the prototype) carries the curve editor. Wire into charge + payout + summary; snapshot onto
  the dispatch. Deletes the hardcoded `8 +` anchor and the `0.08` payout.
- **PP-6 — tooling + repeats (rides with PP-1):** plate/die one-time costs + the repeat-waiver rule.
- **PP-2 finishes → PP-3 floor/quote/lattice → PP-4 surcharges → PP-7 declaration completeness →
  PP-8 award strategy (`LOWEST_COST`) → PP-5 admin hybrid.** All per `PRINT_PRICING_SPEC` §7.

The print builder UI port (the prototype → real 6-step builder) is the same job as CP-4/MB-4, and it is
what makes PP-1's curve editor reachable. Treat "port the print builder UI" as PP-1's UI half.

---

## §4 Consolidated checklist (staged, shadow-first throughout)

**Stage A — decide + pure cores (no db:push, verifiable now)**
- [ ] A1. Confirm the §1 manufacturing division of labor (Pavel).
- [ ] A2. MB-2: pure batch-economics engine + pins (prototype numbers to the cent).
- [ ] A3. PP-1a: pure `evaluatePrintPrice` evaluator + pins (11,444 crossover).

**Stage B — schema (one db:push per service)**
- [ ] B1. MB-1: `PartnerBatchConfig` + service columns (additive).
- [ ] B2. PP-1 schema check: PS-9-0 `PartnerOfferingPriceCurve` backfill status.

**Stage C — writers + builders (port the prototypes, co-creation stepper)**
- [ ] C1. MB-3 writer/loader; MB-4 manufacturing builder UI; retire `ManufacturingEditor` + fold defaults.
- [ ] C2. PP-1b print builder UI (curve editor) + PP-2/PP-3/PP-7 steps.

**Stage D — wiring (behind shadow flags)**
- [ ] D1. MB-5: derived MOQ into routing + overrun into price (shadow).
- [ ] D2. PP-1 wiring: evaluator into charge + payout + snapshot; delete the 8c anchor + 8% payout.

**Stage E — new-capability homes**
- [ ] E1. MB-6: self-fill/overflow + capacity in the manufacturing builder.
- [ ] E2. PP-6 tooling/repeats; PP-8 award strategy; PP-5 admin hybrid.

**Stage F — family consistency**
- [ ] F1. All three builders share the co-creation stepper + Review-and-standing chrome; one component kit.

---

## §5 Execution order (what to start now)

1. **A1 first (decision).** The division-of-labor table above IS the artifact; confirm or amend it.
2. **A2 + A3 in parallel (pure engines).** They are prisma-free, fully testable in the sandbox, and
   they are the hearts of both builders. This is the proven CP-2 pattern: land the engine and its pins
   before any schema or UI. Starting with A2 (manufacturing batch engine) now.
3. Then Stage B schema, Stage C builders, Stage D wiring, each shadow-first, each verified by
   `pnpm type-check` + the pinned suites, exactly as the co-pack arc ran.

**Non-negotiables carried from the co-pack arc:** additive schema only; pure engine + pins before
wiring; money paths behind an OFF flag with a delta report before any flip; charge === payout by
construction (one resolver both sides read); no em-dash in any output.
