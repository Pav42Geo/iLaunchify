# FC / Warehouse Public Rotation — Decision Brief (2026-07-09)

**Status: OPEN — needs Pavel's decision.** Companion to the LOCKED print-pool rule
(`isPublicPrintPoolEligible`; SMART_ROTATION_ENGINE.md §2.2 step 0). That rule settled printing:
the public pool is only for pure Print Providers. This brief asks the parallel question for
**fulfillment / warehousing** — and argues it is *not* a clean copy-paste of the print rule.

---

## 1. The question

Pavel's model (2026-07-09): "Manufacturers and Co-packers and their services (printing,
fulfilment, warehousing) don't go in the rotation pool." For **print** we enforced that as a hard
gate. Does the same apply to **warehouse/FC** — i.e. should a manufacturer's or co-packer's
`WAREHOUSE` service be barred from the public FC selection pool that serves *other* partners'
products?

The answer hinges on a distinction that doesn't exist in the print world: **holding your own
goods vs. fulfilling other people's.**

## 2. How fulfillment works today (grounded in code)

Four ship-to types (`docs/LOGISTICS_AND_FULFILLMENT.md §2`, `destination-options.ts`):
`FC_NETWORK`, `CREATOR_DIRECT`, `HOLD_AT_MANUFACTURER`, `CHANNEL_INBOUND`.

- **`HOLD_AT_MANUFACTURER`** — the producing partner stores and ships **its own** produced goods
  (`offersStorage=true`, storage-class ⊆ its capabilities). This is a producer closing its own
  cycle — the fulfillment analogue of the print "owner-self label bind." It is **not** public
  rotation and must stay regardless of what we decide below.
- **`FC_NETWORK`** — the platform's onboarded FC network. Selection = the 3-phase pattern (hard
  eligibility → weighted `fc-scorer` → rotation band / SR-4 `RotationPolicy`). The FCs are
  envisioned as a *small set of admin-onboarded 3PLs* (ShipBob-class), not "anyone with a shelf"
  (LOGISTICS §3.1–3.2). This is the "public FC pool."

**The gap:** the checkout FC candidate query
(`fulfillment-actions.ts listFulfillmentOptions`, and the same shape in `cart-actions.ts`) is:

```ts
prisma.partnerService.findMany({ where: { type: 'WAREHOUSE', status: 'ACTIVE' } })
```

No `participationMode` filter, no role filter. So **any** active warehouse service — including a
manufacturer's or co-packer's — is already selectable as a public FC for **any** creator's
product. Unlike print, this pool isn't even gated to `PUBLIC`.

## 3. Why fulfillment is NOT a clean copy of the print rule

1. **FCs are a deliberately curated partner type,** not an emergent side-service. The intended
   public pool is a handful of vetted 3PLs, so the "who's in the pool" problem is smaller and
   more admin-controlled than print.
2. **A producer holding its own goods is legitimate and central** (`HOLD_AT_MANUFACTURER`). Any
   rule must never touch that path — the risk of a naive "exclude producers' warehouses" filter
   is breaking a manufacturer's own ship-on-demand.
3. **A producer offering genuine 3PL to others is a real business** (excess-capacity co-man
   warehousing exists in the market). Print didn't have this ambiguity — a manufacturer printing
   its own labels is clearly cycle-closing; a manufacturer warehousing *other people's* finished
   goods is a real, separable service some may want to offer.

So the print rule's binary "pure role or nothing" is too blunt here. The cleaner axis is
**intent**, not role: is this warehouse serving *its own* cycle or *the public network*?

## 4. Options

**Option A — Mirror print (strict).** Public FC pool = pure FC partners only (`WAREHOUSE`, no
`MANUFACTURING`/`COPACKING`). A producer's warehouse can only ever be `HOLD_AT_MANUFACTURER`
(own goods). Simplest, consistent with print, matches Pavel's literal statement. *Cost:* forecloses
producer-as-3PL, which some partners may legitimately want.

**Option B — Status quo (permissive).** Any active warehouse is a public FC. *Cost:* violates the
stated model; a manufacturer silently competes in others' fulfillment pool with no opt-in.

**Option C — Explicit opt-in flag (recommended).** Decouple the two intents with a
`PartnerService` flag, e.g. `offersPublicFulfillment` (default **false**). A producer's warehouse
serves `HOLD_AT_MANUFACTURER` (own goods) by default and enters the **public FC pool only if it
opts in**. Pure FC partners default the flag on. This honors the model (nobody is silently pooled),
preserves own-cycle fulfillment, and leaves room for a producer to deliberately offer 3PL.
*Cost:* one additive column + an onboarding/settings toggle + gating the candidate query on it.

## 5. Recommendation

**Option C, with the default set so today's behavior is the model-correct one:** gate the public
FC candidate query on `offersPublicFulfillment = true`, seed it `true` for pure-FC partners and
`false` for any partner that also runs `MANUFACTURING`/`COPACKING`. That reproduces Option A's
behavior on day one (producers out of the public pool) while leaving a clean, admin-visible lever
to let a specific producer opt in later — instead of hard-coding a "producers can never" rule we'd
have to unwind. `HOLD_AT_MANUFACTURER` is untouched in every option.

If you'd rather not add a column now: **Option A** is the zero-schema choice — add the same
`services: { none: { type: { in: ['MANUFACTURING','COPACKING'] } } }` predicate used for print to
the FC candidate query (and mirror it into `fc-scorer` eligibility). Fully reversible later.

## 6. Open questions for Pavel

1. Do we ever want a manufacturer/co-packer to offer **public** 3PL to other creators, or is
   fulfillment-for-others strictly a pure-FC business? (Picks C vs A.)
2. Should the public FC pool also require `participationMode = PUBLIC` (print does; the FC query
   currently doesn't)? Likely yes for consistency.
3. Confirm `HOLD_AT_MANUFACTURER` is explicitly out of scope of any pool rule (it should be — own
   goods, own cycle).

## 7. Implementation sketch (once decided)

Small, mirrors the print change — the pool is query-gated, the scorer is pure:
- **Option A:** add the exclusion predicate to the FC candidate queries
  (`fulfillment-actions.ts`, `cart-actions.ts`) + a pure `isPublicFcPoolEligible` in `fc-scorer.ts`
  with tests (parallel to `isPublicPrintPoolEligible`).
- **Option C:** additive `PartnerService.offersPublicFulfillment Boolean @default(false)`
  (CockroachDB-safe, no `@db.Text`), seed by role, expose in activation/settings, gate the same
  queries on it. `db:push` + `db:generate` + `.next` clear per the stale-client gotcha.

No code changed by this brief.
