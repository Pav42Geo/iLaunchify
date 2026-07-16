# Service symmetry + the Merit fix

**Status:** DECIDED 2026-07-15 (Pavel). Closes `FEE_MODEL_RECONCILIATION_SPEC_2026-07-09.md` §6.4,
the last open policy flag in that document.
**Prototypes:** all four service builders now exist in `design/`.

---

## §1 The decision that unlocks everything: **the instrument must match the selection model**

Pavel: *"I see a lot of confusion right now, ones Merit judging Manufacturers, Once judging Printers
and what to do with FC and Co-packers?"*

**The confusion is real, and it has a single cause: merit is the only quality instrument that got
built, so it looks like it ought to cover everything. It should not.**

Each service type is **chosen by a different rule**. The rule that picks a partner is what determines
the instrument that judges them. Once that is said out loud, the mess resolves completely:

| Service | How it is CHOSEN | Therefore judged by | Badge? |
|---|---|---|---|
| **MANUFACTURING** | **owner-pinned**: the creator picks it and it never moves | **MERIT** (badge + fee) | **YES** |
| **LABEL_PRINTING** | **rotated**: fair-share lottery over an interchangeable pool | **Bayesian rating** (top-N) | no, rating only |
| **WAREHOUSE** | **selected by fit**: temp class, hazmat, location, capacity, SLA | **fit filters + rating weight** | no |
| **COPACKING** | **auto-derived**: a CARTON/SHIPPER in the graph emits the leg | **nothing** | no |

**Why merit exists for manufacturers and nobody else.** Merit is what makes a *choice* informed and a
*reputation* priced. The creator chooses a manufacturer and pins them for the life of the product, so
standing must be visible (the badge) and must have consequences (the fee). A printer is not chosen, they
are rotated, and rating already decides who is in the top-N pool: a badge would add nothing. An FC is not
chosen either, it is matched on physics. **And a co-packer is not selected at all** (`dispatch-planner.ts:137-153`:
one leg per distinct live assembler, else the manufacturer self-assembles), so there is no decision for a
badge to inform.

**Pavel's ruling, recorded:** *"no merit on non-PRODUCT legs - Confirmed. We should not judged and
computed co-packer. Let's make Merit service-scoped for Products only."* and *"Should one org badge
price two crafts - I'd say no too!"*

**`FEE_MODEL_RECONCILIATION_SPEC` §6.4 is now CLOSED** after 6 days open: *"Merit only eats the
manufacturer leg, not printer/packer/FC - assumed from 'eats the manufacturer.' Confirm no merit on
non-PRODUCT legs."* **CONFIRMED.** The gate at `routing.ts:858` was right all along; it just had no
decision behind it. It does now.

**Ratings are NOT merit, and that distinction is the other half of the fix.** `PartnerRating` is
service-scoped and already covers all four roles (`schema.prisma:5423`: MANUFACTURER | PRINTER |
COPACKER | WAREHOUSE). Ratings are **universal**: they drive print rotation and FC scoring and surface
to admin. Merit is **manufacturing-only**: it drives a badge and a fee. Conflating the two is what
makes it feel like "merit judges printers." It does not, and it never did. Ratings do.

---

## §2 The actual mess, and it is one line of schema

**`Partner.tier` is ORG-level, one column, defaulted to VERIFIED** (`schema.prisma:1027`,
`tier PartnerTier @default(VERIFIED)`).

Three lies follow from that one column:

1. **A co-packer-only partner reads VERIFIED forever.** Not judged well, *never judged at all*: the
   sweep only scores `type: 'MANUFACTURING'` (`admin/src/lib/merit-worker.ts:90`) off PRODUCT
   dispatches (`orders/src/merit-signals.ts:45`). The badge is a default masquerading as an
   achievement.
2. **One badge prices two crafts.** A Premier manufacturer who also co-packs carries Premier on the
   co-packing service too, implying earned standing on work that was never examined. **Pavel: no.**
3. **The enum comment claims a reach it does not have.** `schema.prisma:853` said the ladder "applies
   to every PartnerService.type" while nothing outside manufacturing is ever computed. (Corrected
   2026-07-15 with a REALITY CHECK note.)

**The fix is to move the badge from the ORG to the MANUFACTURING SERVICE.** `PartnerMeritSnapshot` is
**already keyed by `partnerServiceId`** (`schema.prisma:1711`), so the snapshot layer has assumed
service-scoping from day one. Only the write target never caught up.

### The migration (additive, uuid, no drops)

**M-1.** Add `PartnerService.meritTier PartnerTier?` (**nullable, and the null is the whole point**:
null = *not judged*, which is honest, versus VERIFIED = *judged and passed*, which is a lie for a
service merit never examined). Only MANUFACTURING rows ever receive a value.

**M-2.** Point the sweep at it: `merit-worker.ts:186` currently updates `Partner.tier`; it writes
`PartnerService.meritTier` on the MANUFACTURING service instead. The sweep's `where: { type:
'MANUFACTURING' }` filter (`:90`) stays exactly as it is: **that filter is now the decision, not an
accident.**

**M-3.** Point the resolver at it: `production-fee-resolver.ts:45` reads
`partnerService.partner.tier`; it reads `partnerService.meritTier` directly (one less hop, and it stops
reading an org column for a service question). `resolveManufacturerMeritFeeBps` keeps its name, which
is now accurate rather than aspirational.

**M-4.** Backfill `PartnerService.meritTier = Partner.tier` for MANUFACTURING services only. **Leave
every other service NULL.** Then `Partner.tier` is deprecated for merit (keep the column: other
surfaces read it, and this repo does not drop).

**M-5.** UI: a service with `meritTier = null` shows **"Not rated"**, never a badge. The manufacturing
service shows its badge and its fee. The partner standing page (`standing/data.ts:126`) keeps its
MANUFACTURING filter, and its circular comment ("the sweep filters MANUFACTURING") gets replaced with
the actual reason: **merit judges the leg the creator pins.**

**M-6.** Do NOT delete `routing.ts:858` (`if (row.type !== 'PRODUCT')`). It is now load-bearing and
correct. Add a pin asserting non-PRODUCT legs carry zero merit **by decision**, citing this document, so
a future reader does not "fix" it.

**Explicitly NOT doing:** merit on co-pack legs (CP-8 is hereby closed as WONTFIX), per-service merit
for printers (rotation already ranks them), any merit for FC (fit selection already matches them).

---

## §3 FC: does "admin-contracted" contradict giving them an account?

Pavel: *"WAREHOUSE should not be NOT self-serve, the FC network is admin-contracted, but in a same time
we have onboarding process and they recieved dedicated account is this still okay if they are not
self-served?"*

**No contradiction, but the current implementation is genuinely incoherent, and the tension you felt is
the incoherence, not the decision.**

**The decision is right, because FC is a different business.** Manufacturing, print and co-pack are a
**supply-side marketplace**: the partner sets a price, the creator's order finds them, the platform
takes a fee. **FC is contracted infrastructure the platform resells**: the platform negotiates the rate
(that is what `LOGISTICS_AND_FULFILLMENT.md:463` L2 "Anchor 3PL: ShipBob" means) and marks it up via
`warehouseReferralFeeBps`. A 3PL does not self-publish a rate card into a marketplace; they sign an MSA.
So "admin-contracted" is correct and should stay.

**But that is an argument about RATES, not about ACCOUNTS.** It got implemented as "WAREHOUSE gets no
`/services` page at all" (`services/page.tsx:155` returns `['overview']`), which then orphaned a pile of
fields that are unambiguously the warehouse's own business. **Split by the NATURE of the field, not by
the service type:**

| **Admin-owned (contracted)** | **Partner-owned (operational, self-serve)** |
|---|---|
| `storageBillingUnit`, `storageRateCents` | `receivingSpecJson` (dock hours, appointments, pallet spec) |
| `storageMinMonthlyCents`, `storageFreeGraceDays` | `PartnerBlackoutDate` (capacity = 0 windows) |
| `pickFeeCents`, `packFeeCents` | `weeklyPalletCapacity` |
| `warehouseReferralFeeBps` | `storageClasses`, `hazmatAccepted` |
| `FcValueAddedService.feeCentsPerUnit` | `maxDwellDays`, `canShipParcel`, `facilityLat/Lng` |
| cert **verification** | cert **claims** (DRAFT until admin verifies) |

**That is exactly how a real 3PL relationship works: the rate card is in the contract, and the
warehouse manager still sets the dock hours.** The FC absolutely needs its account, because
`inbound` (confirm receipt, reconcile discrepancies), `outbound` (release FSM), `inventory` and
`billing` are all theirs and all already built. They self-serve their **operations**. They do not
self-serve their **price**. Both halves are true at once.

The precedent for the cert split already exists: `FcValueAddedService.status` is *"DRAFT until an ADMIN
verifies them (a false RELABEL claim is a platform loss)"* (`settings/labeling/actions.ts:10-11`).

**So the FC "builder" is two surfaces, not one:**
- **Admin**: the contract sheet (rates, bands, referral bps, cert verification). **This is FC-2, the
  door for the rate, and it is the one Pavel greenlit.**
- **Partner**: an FC skin on `/services` for the operational column above, replacing the
  `['overview']` stub and the two dead redirects.

---

## §4 The full picture

### Four builders, four different animals, one chassis

**Symmetry of STRUCTURE, not symmetry of MODEL.** Every builder is 6 steps in the same chrome:
basics -> **physics** -> hard-filter scope -> **money** -> live check -> review. What differs is what
each of those means, because the businesses genuinely differ:

| | **Manufacturing** | **Printing** | **Co-packing** | **Warehouse** |
|---|---|---|---|---|
| Sells | a **formula** | a **piece** | **operations** | **space + time** |
| Physics | the **batch** | the **press** | the **line** | the **facility** |
| MOQ falls out of | batch size (cannot make half a batch) | process (plates, make-ready) | changeover amortization | n/a (dwell, not MOQ) |
| Money shape | per **product** (defaults inherit) | price **curve** per process | **menu** per operation | **rate** x time + per-transaction |
| Priced by | partner | partner | partner | **admin (contracted)** |
| Judged by | **MERIT** | rating -> rotation | nothing (auto-derived) | fit + rating |
| Chosen by | creator, pinned | lottery | the graph | the scorer |
| Prototype | `design/manufacturing-service-builder-prototype.html` | `design/print-service-builder-prototype.html` | `design/copacker-service-builder-prototype.html` | FC-5 (admin-shaped) |

### The thread that runs through all four: **nobody types their MOQ**

This is the strongest thing the three prototypes found, and it was not designed in, it emerged:

- **Print**: MOQ is a property of the **process**, not the printer (`schema.prisma:6817` logs this as a
  fixed bug). Digital vs flexo **crossover falls out of two price curves**.
- **Co-pack**: MOQ is **changeover amortization**. Crossover at **6,171 units** falls out of two lines,
  and cost per unit swings **10x** from 300 to 90,000.
- **Manufacturing**: MOQ is the **batch**. You cannot make half a batch, so the floor is the smallest
  batch (100 units in the prototype) and the **order lattice** is its multiples.

**In every case the floor is derived from physics the partner already owns.** Ask a partner to type an
MOQ and they guess a round number, then lose the jobs just under it and lose money on the ones just
over. Derive it and it is correct by construction. **This is also why the co-pack 7% had to die**
(`COPACK_SERVICE_SPEC` §6 C1): a flat percentage of the creator's price cannot track a 10x cost swing,
so it starves exactly the short changeover-heavy runs the MOQ-decomposition moat depends on.

The manufacturing builder found the same shape a third time, and it has a name in the print spec
already: **the lattice**. `PartnerOfferingPriceCurve.incrementQty` is documented as *"the increment AND
the order lattice"* (CIP4 PrintTalk `@Amount`). A batch size is exactly that. **Routing should quote
the lattice quantity, not the asked quantity** (order 800, the kettle makes 1,000, and 200 units exist
that nobody ordered). The overrun policy decides who owns the remainder, and 100% (the creator buys the
batch) is the industry norm and the honest default: the manufacturer did not choose to make the extra.

### Where the money actually is, end to end

| Leg | Partner-set price? | In the creator fee base? | Reaches Stripe? | Platform take |
|---|---|---|---|---|
| Manufacturing | yes (per product) | yes | yes | creator tier fee + **merit withhold** |
| Print | yes (offering + curves) | yes | yes | creator tier fee |
| Co-pack | **no (CP-1..CP-3)** | **no** | **no** | creator tier fee, on a price that does not exist |
| FC labeling | yes (`FcValueAddedService`) | **yes** | **yes** | creator tier fee |
| FC storage / pick / pack | admin-contracted | **no** (accrual, not an order line) | **NO** | `warehouseReferralFeeBps` = **0** |

**Two structural facts fall out of that table.**

**First: the platform bills what enters the order, and merely accrues what does not.** FC labeling is
the single FC line that reaches Stripe, precisely because it is a per-unit fee on a **known quantity at
checkout**, which makes it structurally a production line. Storage is the only revenue that is not an
order line, and it is the only revenue that does not bill. That is not a coincidence, it is the shape of
the system.

**Second: the creator tier fee (15/12/8) is the primary take on every leg**, and merit is an
*additional* withhold that exists only on the manufacturing leg. So "co-pack and print fall through
both levers" is wrong: they contribute through the fee base. Once CP-3 lands, a co-pack price enters the
base and the platform earns on it immediately, with no merit needed. **That is the cleanest possible
answer to "should we leave co-packers alone?" Yes: they already pay, through the creator fee, and their
craft is not selected on, so there is nothing for a badge to do.**

### What is left, in priority order

1. **PP-0 flip** (in flight): PDP + configurator onto `computeOrderPricing`, then charge it.
2. **CP-1..CP-3**: give co-packing a price and put it in the fee base. **The largest revenue-correctness
   gap on the board.**
3. **FC-1**: restore the L9 rate bands lost when `settings/storage` was superseded. A live bug: a partner
   can save $500/pallet/month today.
4. **FC-2**: the door for the rate (admin contract sheet). Every FC agreement snapshots `rateCents: 0`
   until this exists.
5. **FC-4**: the charge executor. **The only item on this list that produces revenue that does not exist
   today.** L9 locked it; the half that bills was never written.
6. **M-1..M-6**: service-scoped merit.
7. **FC-3**: set `warehouseReferralFeeBps` above zero.
8. Partner-side FC operational skin (§3), replacing the `['overview']` stub and two dead redirects.

**The honest headline: three of the four services have a real price, and two of them bill. Co-pack has
no price. FC has a good price that is multiplied by zero three separate ways. Fix those two and the
cycle is closed for real, not just in the UI.**
