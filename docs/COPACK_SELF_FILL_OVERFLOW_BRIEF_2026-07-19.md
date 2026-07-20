# Design brief: self-fill ceiling with overflow to a co-packer

**Status:** BRIEF. Written 2026-07-19 (Cowork) from Pavel's question: a manufacturer fills and packs
its own product up to some volume (say 15,000 units), but for a larger order (50,000+) it wants to
outsource the fill/pack to a co-packer. How does the manufacturer express that, and how does the
platform route the order?

**Companions:** `COPACK_SERVICE_SPEC_2026-07-15.md`, `COPACK_CP3_SHADOW_AND_CP6_PLAN_2026-07-19.md`
(CP-3 price + CP-6 payout, both built), `COPACK_CAPACITY_RESERVATION_BRIEF_2026-07-19.md` (shares the
overflow concept). Depends on CP-3 + CP-6, which already exist.

---

## §0 The reframe: the manufacturer always MAKES; only the fill leg overflows

Two steps, kept separate. The manufacturer always **makes** the bulk product (owner-pinned to
`ProductTemplate.manufacturerServiceId`, never routed, never shopped). **Fill-and-pack** is a distinct
leg, and it is the only thing that conditionally moves. So a 50,000-piece order is: the manufacturer
makes 50,000 units of bulk, then either fills-and-packs it themselves (order within their self-fill
volume) or hands the fill leg to a co-packer (order over it). The creator still sees one product, one
price, one timeline; the decomposition is hidden (`PRODUCTION_ORCHESTRATION.md`).

This is the **bridge from N=1 to N>1.** N=1 (self-fill, the current default) is small orders; the
overflow to a co-packer is big orders. It is the honey-problem in reverse: instead of a print MOQ the
manufacturer cannot meet, it is a fill volume they cannot absorb, and the platform quietly brings in a
co-packer to unlock the run.

---

## §1 What the manufacturer declares

Two fields on their manufacturing profile (per service, optionally overridable per product):

1. **Self-fill ceiling** — `selfFillMaxUnits` (Int, per order). "I fill and pack up to 15,000 units
   myself." One number. It is a capacity statement in the same family as the co-pack capacity brief,
   applied to the manufacturer's OWN fill step.
2. **Overflow policy** — who fills when an order crosses the ceiling. Three sources (§4), the simplest
   being a pinned co-packer they already use for big runs.

Null ceiling = they always self-fill (today's behavior; nothing overflows). This is additive and
backward-compatible: existing manufacturers are unaffected until they set a number.

---

## §2 How the platform routes it (a small extension of CP-3/CP-6)

Today `resolveOrderCoPackerServiceId(productTemplateId)` (`copack-order-pricing.ts`) returns ONE static
co-packer regardless of quantity. It becomes **quantity-aware**:

```
resolveOrderCoPackerServiceId(productTemplateId, totalUnits):
  if selfFillMaxUnits == null            -> null      // always self-fill (today)
  if totalUnits <= selfFillMaxUnits      -> null      // self-fill: no co-pack leg, whole band to mfr
  else                                   -> the overflow co-packer (pinned or fit-selected)
```

That is the entire mechanic. Both call sites already have the quantity in hand:
- **Charge (CP-3):** `resolveOrderCopackCents` already computes `totalUnits` and calls the resolver;
  pass the quantity through.
- **Payout (CP-6):** `routing.ts createDispatches` already reconstructs `totalUnits` from the OrderItem
  pack snapshot; pass it through.

Because the resolver is the single source both CP-3 and CP-6 read, charge and payout stay identical by
construction, and the whole downstream (the COPACKING price line, the carved dispatch leg, the sum
invariant, merit staying 0) is unchanged. **Nothing in the money or dispatch path changes; one resolver
learns to read the quantity.**

**Owner declares, platform executes.** The manufacturer sets the policy (ceiling + overflow source);
the platform runs the routing per order. Same division as owner-pinning everywhere else.

---

## §3 The one real decision: whole-order handoff vs split

When a 50,000 order crosses a 15,000 ceiling:

- **Option A — whole-order handoff (RECOMMENDED for V1).** Over the ceiling, the co-packer fills ALL
  50,000: one leg, one lot, one payout. The ceiling is a "when do I hand off entirely" trigger. Trivial
  to build (the resolver returns the overflow co-packer; CP-6 routes the whole fill leg to them).
- **Option B — true split (15,000 self + 35,000 co-packer).** A real capability but heavy: two fill
  legs, two production lots, two quality/COA records, two payouts, and reconciliation that they sum to
  the order. This is a V2 sophistication. Do NOT build it until partners ask.

Recommendation: ship A, revisit B only on real demand. The rest of this brief assumes A.

---

## §4 Where the overflow co-packer comes from (three sources, offer all)

1. **Pinned co-packer** — the manufacturer names a co-partner they already use for big runs (the
   nomination model, `PartnerNomination`, currently dark behind D7). Simplest, matches how manufacturers
   actually operate. `overflowCoPackerServiceId` on the manufacturing service/product.
2. **Platform fit-selection** — the platform picks a co-packer by fit (format, fill type, capacity,
   location, cost), the way the FC selector picks a warehouse. Reuses `selectCopackLine` + capacity.
   Best when the manufacturer has no preferred partner.
3. **Their own second site** — a manufacturer who ALSO runs a COPACKING service at a bigger facility
   points overflow at their own service (N=1 across two sites; still their org, still their payout).

V1: support (1) and (3) (both are a pinned `overflowCoPackerServiceId`); add (2) when the fit-selector
across co-packers exists.

---

## §5 Edge cases

- **Make capacity is a SEPARATE ceiling from fill capacity.** A 50,000 order can exceed self-fill (so a
  co-packer fills) while still within the manufacturer's make capacity (they still make the bulk). If it
  also exceeds their MAKE capacity (`capabilities.moqMax` / monthly capacity), that is a different
  problem (splitting production across manufacturers) and OUT of scope here.
- **No overflow co-packer available or in range:** same fork as any routing miss (extend ETA, or hold
  for admin), never silently drop.
- **The creator never sees any of this:** one product, one price (the co-pack line folds into
  Production), one timeline. The word "co-packer" never reaches creator copy.

---

## §6 What to build

Additive and small, reusing CP-3 + CP-6 wholesale:
1. **Schema:** `selfFillMaxUnits Int?` + `overflowCoPackerServiceId String?` on the manufacturing
   service (or `ProductTemplate` for per-product control). Nullable, additive, uuid FKs.
2. **Resolver:** make `resolveOrderCoPackerServiceId` take `totalUnits` and apply the §2 logic; thread
   the quantity from the two existing call sites (both already have it).
3. **Builder UI:** two fields in the manufacturing capabilities editor ("I self-fill up to N units per
   order" + "Above that, fill via [co-packer]").
4. **Pins:** the resolver is pure logic over (ceiling, totalUnits, overflow id) once the rows are
   loaded, so pin it like the co-pack engine: below ceiling -> null, above -> overflow, null ceiling ->
   null. Shadow-safe: it only ever activates under the same `pricing:copack_real_price` flag CP-3/CP-6
   already gate on.

No change to `computeOrderPricing`, `deriveItemDispatch`, the merit gate, or the sum invariant.

---

## §7 Composes with the capacity brief

The self-fill ceiling and the co-pack capacity allocation are the same idea at two ends of one order.
Once the capacity ledger (Cap-0/Cap-1) lands, `selfFillMaxUnits` can become per-week and ledgered the
same way, so "I self-fill up to 15,000 per order, but only 40,000 a week" both hold, and the overflow
co-packer's own weekly allocation gates whether it can absorb the handoff. Build the per-order ceiling
first (this brief); fold in the per-week ledger when capacity lands.

---

## §8 Open decisions for Pavel

1. **A or B** (whole-order handoff vs true split). Recommend A for V1.
2. **Ceiling per order or per week?** Recommend per-order now, per-week when the capacity ledger lands.
3. **Ceiling on the service or per product?** Recommend the service (one policy), with an optional
   per-product override later.
4. **Overflow source for V1:** pinned co-packer + own-second-site (both just an id) now; platform
   fit-selection when the cross-co-packer selector exists.
