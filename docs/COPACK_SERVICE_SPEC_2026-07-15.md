# Co-packer Service Builder + co-pack monetization

**Status:** SPEC. Prototype BUILT (`design/copacker-service-builder-prototype.html`). Nothing wired.
**Origin:** Pavel 2026-07-15, "same service builder prototype as the Print service builder, for
Co-packers (keeping in mind they also could be Manufacturing and Printing)".
**Companion:** `PRINT_PRICING_SPEC_2026-07-15.md` (the print analogue, same shape), 
`MULTI_COMPONENT_DISPATCH.md` (decision C1, which this forces), `PARTNER_ROLE_ACCOUNTS.md` §3.2.

---

## §0 Start here: the finding that makes this urgent

**A co-packer cannot currently be paid what they charge, because co-packing has no price at all.**

- There is **no co-pack offering model** in the schema. Zero tables, zero price columns. `grep -ni
  "copack" schema.prisma` returns enum values, comments, and one FK.
- **`computeOrderPricing` has no co-pack line.** `PriceLine.kind` (`packages/plans/src/order-pricing.ts`)
  is `PRODUCT | DECORATION | COMPONENTS | PACKAGING | PRINTING | FINISHES | SETUP | FC_LABELING |
  PLATFORM_FEE | SHIPPING | TAX`. Co-packing is **invisible to the creator's price and to the fee base**.
- A co-pack leg is paid `Math.floor(total * 0.07)`, split evenly across legs
  (`packages/orders/src/dispatch-planner.ts:97,161`). That is 7% of *the creator's unit price*, which
  has no relationship to the labour the job actually consumes. A 300-unit variety pack and a
  90,000-unit single-flavour run are paid on the same rule.
- `ProductTemplatePackaging.coPackerServiceId` exists and is **read** by `routing.ts` and
  `template-graph.ts`, but **nothing writes it**. The two creators of that row
  (`products/[id]/edit/card-actions.ts:628`, `products/actions.ts:224`) never set it. The assignment
  path is dead in practice.

**The fee-base consequence (LOCKED rule, CLAUDE.md).** A co-pack fee is partner-set and creator-paid,
so it belongs in `productionSubtotal` and therefore in the platform-fee base. `order-pricing.ts:31-34`
states the constraint directly: any new partner-priced, creator-paid line added OUTSIDE
`productionSubtotal` is a fee-arbitrage vector. So co-pack money **must** enter via
`PricingInput.production`, never as a sibling of it.

**This spec forces `MULTI_COMPONENT_DISPATCH.md` decision C1** ("keep the naive %-of-unit-price per
leg, or derive each leg's cost from its component's offering price?"). That doc's own answer was
"naive % for Phase 1; **real per-component pricing in Phase 2 when co-pack lands**." Co-pack is landing.
That doc also says: **"No `createDispatches` changes until C1-C3 are decided."** Respect that gate.

---

## §1 What a co-packer sells, and why print's model does not transfer

A printer sells a **thing** (a printed piece). A co-packer sells **operations performed on someone
else's things**. That single difference drives the whole model:

| | Printer | Co-packer |
|---|---|---|
| Unit of pricing | the piece | varies PER OPERATION: unit, pack, case, pallet, run, hour |
| Cost driver | press + plates + substrate | **changeover**, then line-hours |
| Physics lives on | the press | **the line** |
| MOQ comes from | the process (plates, make-ready) | **changeover amortization** |
| Creator sees | a printed label | nothing (co-packer is never named to the creator) |

**Changeover is the co-pack equivalent of the print crossover, and it is the whole MOQ argument.**
From the prototype's own maths (two real-shaped lines: auger 3,600/h, 4h changeover, $165/h; hand
900/h, 1h changeover, $120/h):

| Qty | Auger line | Hand line | Winner | Cost / unit |
|---|---|---|---|---|
| 300 | below its 1,500 min | $160.00 | hand | $0.5333 |
| 2,400 | $770.00 | $440.00 | **hand** | $0.1833 |
| 20,000 | $1,576.67 | $2,786.67 | auger | $0.0788 |
| 90,000 | $4,785.00 | above its 25,000 ceiling | auger | $0.0532 |

Two things fall out that nobody typed in: the **crossover at 6,171 units** (below it the *slower* hand
line wins, because the auger's 4h changeover cannot amortize), and a **10x per-unit swing** from 300 to
90,000 units. That swing IS the minimum-order conversation, made arithmetic.

**Design rule:** capture speed + changeover + line rate, and DERIVE the floor. Do not ask a co-packer
to type an MOQ. That repeats the mistake `schema.prisma:6817-6832` logs against the print offering
("MOQ is a property of the PRINT PROCESS, not the printer").

---

## §2 The prototype (BUILT)

`design/copacker-service-builder-prototype.html`, 6 steps, chrome lifted verbatim from the print
builder so the two are visually identical:

1. **Service basics** - identity, facility, base lead time, `minOrderValueCents`, weekly capacity,
   rush uplift (partner-set + creator-paid, so it is in the fee base).
2. **Your lines** - the co-pack analogue of "Your presses". Per line: run speed, changeover hours,
   line rate, min/max run, allergen class. **This is where the physics lives.**
3. **What you run** - container formats, fill types, pack styles, **supply model** (fill-only vs
   supplies-container), **appliesLabels**, certifications. All HARD filters.
4. **Operations** - the menu, each with its own switch, its own unit, its own price: fill & close,
   label application, variety/kit assembly, insert placement, shrink/bundle, case pack & palletize,
   QC hold & COA, rework.
5. **Pricing** - changeover/setup, minimum run charge, repeat-run discount, plus a **Live check**
   running the engine's own maths (line selection, changeover amortization, crossover, order-value
   floor) and a **fee-base bar** showing exactly where the co-pack fee sits in the creator's bill.
6. **Review & publish** - completeness, **"You also run"** service composition, what this unlocks, and
   an honest statement of the gap.

**Two moments the prototype exists to create.** The Live check shows a co-packer their own crossover,
which they have never seen written down. The fee bar shows them the platform fee comes off the
*creator*, not out of their payout, and that shipping sits outside the base so nobody can shift a
production price into freight.

---

## §3 Multi-service partners (Pavel's parenthetical, and it is already law)

`PartnerService` is keyed `@@unique([partnerId, type])` (`schema.prisma:1441`), so **one partner may
hold MANUFACTURING + COPACKING + LABEL_PRINTING + WAREHOUSE simultaneously**, one row each. This is
deliberate: `docs/USER_ROLES.md:19` ("One Partner can offer one service or many. The order engine
routes to Services, not to Partners") and `:52` rejected a `UserRole = COPACKER` enum precisely
because "a real-world co-packer that also prints labels has to maintain two logins. Don't do this."

What the mix does and does not unlock, all of it already decided elsewhere:

- **Manufacturing** is OWNER-PINNED to `ProductTemplate.manufacturerServiceId`. Never rotated.
- **Co-packing** legs are auto-derived from CARTON/SHIPPER components. **Not rotated**, and
  `PRINT_PROVIDER_SELECTION.md:122-133` explicitly defers co-pack public cards: "Co-pack legs stay
  auto-derived, no public cards until a selection UX exists."
- **Label printing, when held by a co-packer, is EXCLUDED from the public print pool.**
  `packages/orders/src/rotation.ts:296-304` `isPublicPrintPoolEligible` gates out any partner who also
  runs MANUFACTURING or COPACKING (the "main-role gate"), per memory
  `ilaunchify-print-pool-pure-printers-only`. Their press still prints their own routed jobs and can
  be nominated by a co-partner. **The prototype states this to the partner as a protection, not a
  demotion**, and that framing should survive to the real UI.
- **Front Face:** co-packers and manufacturers are nameable and can have one (PUBLIC participation +
  admin lever). Printers and warehouses never do. So a co-packer's Front Face is legitimate.
- **`appliesLabels`** defaults true on COPACKING because "application is their core trade"
  (`schema.prisma:1407`). This is the **honey problem** / MOQ-decomposition play
  (`PRODUCTION_ORCHESTRATION.md:131`): a 500-unit run becomes blank stock + digitally printed labels
  applied at the co-packer's fill step, so the printer's 10,000-piece minimum never binds.

---

## §4 What exists to build on (do not reinvent)

- **`FcValueAddedService`** (`schema.prisma:1465-1483`) is the **best precedent in the repo**: it is
  the only model where a partner prices an *operation* rather than a *good*. `jobType` (RELABEL /
  KITTING / LIGHT_ASSEMBLY / BAGGING_BUNDLING / DISPLAY_BUILDS / REWORK) + `feeCentsPerUnit` +
  `minUnits` + `leadTimeDays` + `@@unique([partnerServiceId, jobType])`. The co-pack operation menu is
  this shape, widened with a pricing UNIT.
- **`PartnerFinish`** (`schema.prisma:2475-2517`) is the precedent for a **pricing-mode discriminated
  fee**: `pricingMode` + setup + per-unit + per-area + per-object + per-color + tiers. Its per-product
  allow-list `ProductTemplateFinish` is the precedent for "which of my offerings apply to THIS product".
- **`PartnerOfferingPriceCurve`** (`schema.prisma:6844-6870`, CIP4 PrintTalk 2.2 §4.1) is the
  volume-curve shape: `baseQty` / `basePriceCents` / `incrementQty` / `incrementPriceCents`, unit price
  DERIVED never stored. Reusable in spirit; it is currently keyed on `printProcess`, so co-pack needs
  its own child table rather than a widened key.
- **Editor precedent:** `apps/partner/src/app/(dashboard)/packaging/offerings/OfferingForm.tsx` (610
  lines) and `services/ServiceEditors.tsx:370-470` (`CopackEditor`, capability-only today).
- **Zod capability shape:** `packages/types/src/service-capabilities.ts:19-28`
  `CopackingCapabilitiesSchema`. Note the live editor already writes three keys this schema does not
  declare (`suppliesContainer`, `fillingLines`, `changeoverDays`). Fix that drift when formalizing.

**Do NOT repeat the print offering's logged mistake** (`schema.prisma:6817-6832`): do not widen a
unique key with nullable columns, because CockroachDB admits duplicate NULL rows. Segment
run-and-price into a child table.

---

## §5 Phases

**CP-0 - Decide C1 (Pavel, blocking).** Does a co-pack leg get paid from a real partner-authored
price, or stay on the naive 7%? Everything below assumes "real". Until C1 lands, no
`createDispatches` changes (`MULTI_COMPONENT_DISPATCH.md:110`).

**CP-1 - Schema (additive, uuid, no drops).**
- `PartnerCopackLine` - the physics: `partnerServiceId`, `name`, `runSpeedUnitsPerHour`,
  `changeoverHours`, `lineRateCentsPerHour`, `minRunUnits`, `maxRunUnits`, `allergenClass`,
  `containerFormats[]`, `fillTypes[]`, `status`.
- `PartnerCopackOperation` - the menu: `partnerServiceId`, `opType` (FILL_CLOSE / LABEL_APPLY /
  KIT_ASSEMBLY / INSERT / SHRINK_BUNDLE / CASE_PACK / QC_COA / REWORK), `pricingUnit` (PER_UNIT /
  PER_PACK / PER_CASE / PER_PALLET / PER_RUN / PER_HOUR), `priceCents`, `minUnits`, `status`,
  `@@unique([partnerServiceId, opType])`.
- `PartnerCopackRunCharge` or columns on the service: `changeoverFeeCents`, `minRunChargeCents`,
  `repeatRunDiscountBps`, `rushUpliftBps`, `rushLeadTimeDays`.
- Optional `PartnerCopackPriceCurve` child (per line, per operation) if flat + tiers prove too thin.

**CP-2 - Pure engine, no I/O.** `packages/orders` or a new `packages/copack`:
`selectCopackLine(lines, job)` (hard filters then cost), `quoteCopack(line, ops, runCharges, job)`
returning a `PricedCopack`. Pin the crossover, the amortization curve, the min-run floor, the
order-value floor, and every hard filter. Same throw-based convention as the plans pins.

**CP-3 - The price line.** Add `COPACKING` to `PriceLine.kind` and feed the quote into
`PricingInput.production` (never a sibling: `order-pricing.ts:31-34`). Pin that co-pack raises the fee
base and that the tier fee applies to it. **Do this behind the PP-0 shadow first**: compute, log the
delta, charge unchanged, exactly as PP-0 did.

**CP-4 - The builder UI.** Port the prototype to `apps/partner/src/app/(dashboard)/services/copacking/`
(or `/copacking`), following `OfferingForm.tsx` conventions: real data only, no invented defaults,
explicit Save per card, merge into capabilities.

**CP-5 - Assignment.** Give `ProductTemplatePackaging.coPackerServiceId` a writer, or replace it with
a real selection surface. Today routing reads a field nothing sets.

**CP-6 - Payout.** Net the quoted co-pack price into `OrderDispatch` / `Transfer` in place of the 7%.
Note merit fee is deliberately ZERO on COPACKING legs (`routing-merit-snapshot.test.ts:45`); keep it so
unless Pavel says otherwise.

**CP-7 (deferred) - Role skin.** Work-order view, component readiness, lot/COA, quality hold, yield
(`PARTNER_ROLE_ACCOUNTS.md:44,111-120,219`). D6 put co-pack skins in P2.

**CP-8 - Merit on the co-pack leg. WONTFIX (Pavel 2026-07-15).** A co-pack leg is auto-derived, not chosen, so there is no decision for a badge to inform. See §7.

---

## §6 Decisions (ALL DECIDED 2026-07-15, Pavel)

1. **C1: REAL co-pack pricing.** DECIDED: real, partner-authored. The 7% is a percentage of the
   *creator's unit price*, which has no relationship to the labour consumed. The prototype's own maths
   shows why it cannot work: true cost per unit swings **10x** (300 units $0.5333, 90,000 units
   $0.0532) while a flat 7% of the creator's price tracks none of it. It overpays long runs and starves
   short ones. Worse, it **fights the orchestration thesis**: the MOQ-decomposition play
   (`PRODUCTION_ORCHESTRATION.md:131`) needs co-packers to accept exactly the short, changeover-heavy
   variety runs that 7% of a small order cannot fund, so a rational co-packer declines them. And
   because it is not a real price, nothing downstream can exist: no merit withhold (you cannot withhold
   a percentage of a fiction), no fee-base line, no quote. This closes `MULTI_COMPONENT_DISPATCH.md` C1.
2. **Operation menu, not a single blended rate.** DECIDED. A variety pack and a single-flavour fill are
   not the same job; one number cannot price both.
3. **Fold into "Production" in the UI, distinct line in the data.** DECIDED.
   `PRODUCTION_ORCHESTRATION.md:354` forbids operational nouns in creator copy, `:458` forbids
   disclosing any graph node. The fee base needs it itemized; the creator never needs the word
   "co-packer". So `PriceLine.kind = 'COPACKING'` exists in `PricingInput.production` and is SUMMED
   into the Production row for display.
4. **Changeover: derived, with override.** DECIDED. Derive from line rate x changeover hours, let the
   partner override. Deriving teaches them their own economics; the override respects that they know
   their business.
5. **`ServiceType.ACCESSORY`: fix the comment.** DECIDED (comment, not a new type). Accessories already
   hang off an existing service via `AccessoryOffering.partnerServiceId`; adding a 5th ServiceType
   would break `@@unique([partnerId, type])` semantics for no gain. FIXED at `schema.prisma:854`.

## §7 Merit on the co-pack leg (Pavel 2026-07-15)

**The gate is an unconfirmed assumption, not a decision.** `FEE_MODEL_RECONCILIATION_SPEC_2026-07-09.md`
§6.4, under "Open policy flags (confirm before/while building)": *"Merit only eats the manufacturer
leg, not printer/packer/FC - **assumed** from 'eats the manufacturer.' **Confirm** no merit on
non-PRODUCT legs."* Flags #1 (the fee base), #2 and #3 are closed. **#4 was never closed.** The gate at
`routing.ts:858` (`if (row.type !== 'PRODUCT') return { ...row, meritFeeBps: 0, meritFeeCents: 0 }`) is
that assumption, coded.

**Nothing structural enforces manufacturer-only.** Verified:
- `manufacturer-merit-fee.ts:28` takes a bare `serviceId: string | null`. **No type check.** Pass it a
  COPACKING service id and it resolves that partner's badge.
- `production-fee-resolver.ts:45` reads `Partner.tier`, which every partner org has. No type filter.
- `MeritPolicy` (`schema.prisma:1636`) is a **singleton with no service-type scoping**. Fees are keyed
  by BADGE, and badge is a property of `Partner`, not of a service.
- `OrderDispatch.meritFeeBps/meritFeeCents` are **per-leg columns that already exist on COPACKING
  rows** and are simply written 0. `Transfer.meritFeeCents` + `transfer-execute.ts:141` are type-blind.
- `merit.ts` / `merit-fee.ts` contain **zero** references to MANUFACTURING. Every `MeritSignals` input
  (rating, on-time, accept rate, defects, orders, months, units, GMV) is meaningful for a co-packer.
- `PartnerRating.role` already includes `COPACKER` (`schema.prisma:5423`) and feeds the same
  `ratingBayesian` the craft pillar reads. **The badge's input signal already exists for co-packers.**

**The real reason it was zeroed: there was nothing real to withhold from.** A co-pack leg's cost is
`Math.floor(total * 0.07)`, a fiction. Withholding 4.5% of a made-up number is meaningless. **That is a
perfectly good reason in 2026-07 and no reason at all once CP-3 lands a real price.**

**DECIDED 2026-07-15 (Pavel): NO. Merit does NOT apply to the co-pack leg. CP-8 is WONTFIX.**
The analysis below is retained because it is what produced the decision, and because it records why
the structural argument ("nothing blocks it") is not the same as a reason to do it.

**The reason, which is now the general rule:** the instrument must match the SELECTION model. Merit
prices a *choice*, and a co-pack leg is not chosen: it is auto-derived from a CARTON/SHIPPER in the
graph (`dispatch-planner.ts:137-153`). There is no decision for a badge to inform, so there is nothing
for merit to do. Co-packers still pay the platform through the creator tier fee once CP-3 puts their
price in the fee base. See `docs/SERVICE_SYMMETRY_AND_MERIT_2026-07-15.md` §1.

**(Superseded analysis follows.)** Merit COULD apply structurally, but was BLOCKED on service-scoped
standing:

`Partner.tier` is **ORG-level, one column** (`schema.prisma:1027`), shared across all four of that
org's services. And the merit sweep only ever scores manufacturing:
- `apps/admin/src/lib/merit-worker.ts:90` sweeps `where: { type: 'MANUFACTURING' }` and writes
  org-level (`:186` updates `Partner.tier`).
- `packages/orders/src/merit-signals.ts:45` counts `type: 'PRODUCT'` dispatches only.
- `apps/partner/.../standing/data.ts:126` filters `type: 'MANUFACTURING'`, justified by the comment
  "the sweep filters MANUFACTURING" - **the code cites the other code. Nobody cites a decision.**

So today a co-packer-only partner reads `VERIFIED` forever: not judged, never computed. **Un-gating
`routing.ts:858` right now would charge co-packers 4.5% on a badge earned entirely on manufacturing
work (or on no work at all).** That is the actual blocker, and it is a good one.

**Good news:** `PartnerMeritSnapshot` is **already keyed by `partnerServiceId`** (`schema.prisma:1711`;
its "soft FK -> MANUFACTURING" is a comment, not a constraint). The snapshot layer can already express
per-service standing. Only the assignment target (`Partner.tier`) cannot.

**Sequence (CP-8, after CP-3):**
1. CP-3 lands a real co-pack price (nothing below is meaningful before this).
2. Merit sweep scores COPACKING dispatches: widen `merit-worker.ts:90` and `merit-signals.ts:45`.
3. Service-scoped standing: the badge must live per-service, not per-org. `PartnerMeritSnapshot`
   already is; the write target is not. **This is the one schema decision.**
4. THEN delete `if (row.type !== 'PRODUCT')` (one line) and let the resolver run on
   `row.partnerServiceId`. It already accepts any service id.
5. Rename the surfaces: "Manufacturer standing" (`merit/page.tsx:15`) becomes partner standing.

**The open product question, which is Pavel's, not architecture's:** should ONE org-level badge price
TWO crafts? A Premier manufacturer who is a mediocre co-packer would get 0% on both. Recommendation:
**per-service standing.** Craft is service-specific, the snapshot table already assumes it, and a
partner running all four services is exactly the case the tier model must not smear.

Note the ladder itself (4.5/2.5/0) was tuned to manufacturer economics
(`MANUFACTURER_MERIT_ENGINE.md:249` benchmarks Printify). Whether it is right for a fill-and-close
operation is untested and should be a separate `MeritPolicy` band, which the singleton cannot express
today.
