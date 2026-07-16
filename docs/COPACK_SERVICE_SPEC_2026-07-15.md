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

---

## §6 Open decisions for Pavel

1. **C1: real co-pack pricing, or keep the 7%?** (blocking everything)
2. **Operation menu vs single blended rate.** The menu is honest and quotes accurately; a single
   `feeCentsPerUnit` is one column and ships in a day. The menu is recommended, because a variety pack
   and a single-flavour fill are not the same job and one number cannot price both.
3. **Does the creator see a co-pack line, or is it folded into one "Production" number?**
   `PRODUCTION_ORCHESTRATION.md:354` forbids operational nouns in creator copy ("MOQ", "co-packer",
   "supplier"), and :458 forbids disclosing any graph node's identity. **Recommendation: fold it into
   Production in the UI, keep it a distinct line in the data.** The fee base needs it itemized; the
   creator does not need the word "co-packer".
4. **Changeover: derived or typed?** Prototype derives it from line rate x changeover hours and lets
   the partner override. Deriving teaches them their own economics; overriding respects that they know
   their business.
5. **`ServiceType.ACCESSORY` does not exist** but `schema.prisma:854` claims it does. Fix the comment
   or add the type.
