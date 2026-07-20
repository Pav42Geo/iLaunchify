# CP-3 (shadow price line) + CP-6 (payout) implementation plan

**Status:** PLAN. Written 2026-07-19 (Cowork). Prereqs CP-1..CP-5 built; CP-2 engine
(`@ilaunchify/orders/copack-quote`) + CP-4 builder (`/services/copacking`) + CP-5 writer
(`coPackerServiceId` auto-default + override) all landed. CP-3 PURE CORE landed: `'COPACKING'` is
in `PriceLine['kind']` and `order-pricing.test.ts` / `money-map.test.ts` pin it as fee-bearing
production.

**Companions:** `COPACK_SERVICE_SPEC_2026-07-15.md` (§5 phases, §7 merit), `FEE_MODEL_RECONCILIATION_SPEC_2026-07-09.md`,
`MULTI_COMPONENT_DISPATCH.md` (C1 decided). Memory: `ilaunchify-copack-builder`, `ilaunchify-one-pricer-pp0-flipped`,
`ilaunchify-merit-manufacturing-only`, `ilaunchify-money-path-proven`.

**Hard gate:** everything below references the CP-1 tables (`PartnerCopackLine` / `PartnerCopackOperation`
/ `PartnerCopackConfig`), so it only typechecks after `pnpm db:push && pnpm db:generate`. Do that first.

---

## §0 The shadow technique for iLaunchify (read before "shadow" confuses anyone)

The classic PP-0 shadow (compute the new price, log the delta against the live charge, flip when the
delta is understood) assumes live traffic. iLaunchify has **zero live orders** (pre-revenue, Stripe
behind verification). `scripts/pp0-delta-report.mjs` says this in its own header and replaces the
live-delta shadow with an **exhaustive synthetic matrix**: enumerate every cart shape, run both
expressions over all of them, diff. "Real data would be a sample; the matrix is exhaustive."

So "SHADOW-INERT behind a flag" for co-pack means two concrete things, not a per-order log:

1. **A flag** (`OrderSettings`/`LogisticsSetting`, default OFF) that keeps the co-pack line OUT of the
   charged `production` array. When OFF the price is byte-for-byte what it is today.
2. **A `copack-delta-report.mjs`** that enumerates cart shapes with and without the co-pack line and
   prints exactly what turning the flag ON changes (fee base, tier fee, total), so the flip is a
   reviewed decision, not a surprise.

There is deliberately no "log the delta on real orders" step. It would log nothing forever.

---

## §1 CP-3 — the co-pack price line, shadow-first

### 1.1 The quote loader (new, `@ilaunchify/orders`)

A thin DB adapter over the pure CP-2 engine. Pure engine stays pure; this is the I/O half.

```
// packages/orders/src/copack-quote-loader.ts  (NEW)
export async function loadCopackQuoteCents(args: {
  coPackerServiceId: string
  job: { qty: number; unitsPerPack?: number; unitsPerCase?: number }
}): Promise<{ cents: number; ok: boolean } | null>
```

- Loads `PartnerCopackLine[]` (status ACTIVE), `PartnerCopackOperation[]` (ACTIVE), `PartnerCopackConfig`
  for `coPackerServiceId`, maps them to the engine's plain inputs (the SAME mapping the builder's Live
  check already does in `CopackBuilder.tsx`), and calls `quoteCopack(...)`.
- Returns `null` when the service has no lines (nothing authored yet) so callers treat co-pack as $0.
- **`job.qty` is total units**, `unitsPerPack`/`unitsPerCase` come from the variety-pack matrix /
  packaging system (same source the Live check's `upp`/`upc` model).
- No merit, no clock, no snapshot here. Just cents.

Pin it with a loader test that seeds the prototype's two lines in a rolled-back tx (reuse the
`check-copack-schema.ts` pattern) and asserts the same numbers CP-2 already pins.

### 1.2 Where the co-pack line enters (the four PP-0 surfaces, all or none)

PP-0's law is quote===estimate===charge. The co-pack line must be composed identically at every
surface or the estimate and the charge diverge. Feed it via `composeProductionLines` (add an optional
`coPackingCents` input that emits a `{ kind: 'COPACKING', label: 'Co-packing', cents }` line) so all
four call sites get it from one composer:

| Surface | File:line | Role | Status |
|---|---|---|---|
| **Charge** | `apps/creator/.../checkout/cart-actions.ts:737` (compose) + `:805` (price) | `placeOrder` — the till | WIRED |
| Checkout estimate | `apps/creator/.../checkout/production-actions.ts:642` | shown pre-pay; must equal the charge | WIRED |
| PDP | `apps/marketing/src/components/ProductDetailConfigurator.tsx:472` | marketplace preview | **EXCLUDED — see below** |
| Sample | `apps/creator/.../checkout/sample-actions.ts:194` | pre-production sample | **N/A — never an assembly** |

**PDP correction (2026-07-19, on tracing it).** The PDP's live price is deliberately **goods + fee
only** — its production array is `[{ kind: 'PRODUCT', cents: unitGoodsCents * quantity }]` and it
carries NONE of the production add-ons (decoration, components, finishes), by explicit decision at
`ProductDetailConfigurator.tsx:443-467`: those are authored later (Studio) and priced at checkout. So
co-pack is an add-on of exactly that class and follows the same rule — it stays OFF the PDP. Wiring it
in would make co-pack the ONLY add-on on the PDP, and the PDP would disagree with checkout for a
reason unrelated to co-pack. **The parity that matters is estimate === charge (both include the add-ons,
both wired).** The PDP shows the headline goods price; the full production breakdown appears at checkout.
CP-3.2 is therefore COMPLETE with charge + estimate. Revisit only if Pavel decides the PDP should
preview all production add-ons (a separate, larger change touching decoration/components too).

**When co-pack applies:** the order has a pinned `coPackerServiceId` (CP-5) on the chosen packaging
config AND the config produces an assembly (a CARTON/SHIPPER component, i.e. variety/multipack). A
plain single unit with no assembly emits no co-pack line. This mirrors `deriveItemDispatch`'s existing
"assembly only for CARTON/SHIPPER" rule (`dispatch-planner.ts:168`).

Because `production` lines are `inFeeBase: true` by construction, adding the line automatically raises
`productionSubtotalCents` and the fee base and applies the tier fee. No other pricer change. (Already
pinned in `order-pricing.test.ts`.)

### 1.3 The flag + the report

- Add `OrderSettings.copackRealPriceEnabled` (Boolean, default false) OR a `LogisticsSetting`
  `pricing:copack_real_price` (matches the existing gate style, off by default via `getLogisticsSettings`).
  Prefer `LogisticsSetting` for consistency with the other admin gates.
- The composer receives `coPackingCents` only when the flag is ON; when OFF it is 0/absent, so the
  charge is unchanged. **This is the shadow.**
- `scripts/copack-delta-report.mjs` (mirror `pp0-delta-report.mjs`): enumerate cart shapes
  {single/variety} × {no co-packer / co-packer with N lines} × {qty buckets 300/2.4k/20k/90k} and print
  the fee-base and total delta of flipping the flag. This is the artifact that justifies the flip.

### 1.4 CP-3 acceptance

- Flag OFF: `pnpm pp0:delta`-style parity holds; every existing pricing test passes unchanged.
- Flag ON (in tests only): a variety-pack order's fee base rises by exactly the loader's cents; tier
  fee applies; estimate === charge across all four surfaces (extend `estimate-charge-parity.test.ts`).
- `costFloorBreach` (`cart-actions.ts:821`) still reports (never funds below partner cost); confirm the
  co-pack line does not trip a false breach.

---

## §2 CP-6 — route the assembly leg to the co-packer and net the real price

CP-3 makes the creator PAY for co-pack. CP-6 makes the co-packer GET it, replacing the interim 7%.

### 2.1 The seam: thread `coPackerServiceId` into `deriveItemDispatch`

Today the assembly (COPACKING) leg is derived from the **CARTON/SHIPPER component's** `partnerService`,
falling back to the manufacturer (`dispatch-planner.ts:168-182`). It never reads the CP-5 field. CP-6:

- Pass the pinned `coPackerServiceId` (from `ProductTemplatePackaging`, resolved in `routing.ts` where
  the plan is built) into `deriveItemDispatch` as `routing.coPackerServiceId`.
- When present and live, the assembly leg's `serviceId`/`userId` become the pinned co-packer's, instead
  of the manufacturer default. When absent, unchanged (manufacturer self-assembles, N=1).

### 2.2 Real leg cost, preserving the sum invariant

- Replace `estimateLegCosts`'s `coPackerCostCents: Math.floor(total * 0.07)` (`dispatch-planner.ts:110`)
  with the CP-3 loader's quoted cents for that co-pack leg.
- **INVARIANT (pinned, `dispatch-planner.test.ts:207`): `sum(leg.costCents) === productionCents`.**
  The manufacturer's PRODUCT leg must reduce by exactly the carved co-pack cost. The existing
  `isDistinct(userId)` carve-out logic (`:212-219`) already does this for distinct payees; point it at
  the real quote instead of the 7% estimate. For **N=1** (co-packer userId === manufacturer userId) it
  carves nothing and the whole production stays on the PRODUCT leg, exactly as today.
- Keep `deriveItemDispatch` pure and DB-agnostic: pass the quoted co-pack cents IN as a param (routing
  loads it), do not make the planner do I/O.

### 2.3 Snapshot + Transfer netting

- `OrderDispatch` already has `costCents` + nullable `meritFeeBps/meritFeeCents`. The co-pack dispatch
  row's `costCents` becomes the real quote. **Merit stays 0 on COPACKING** (CP-8 WONTFIX,
  `routing.ts:858` load-bearing, `routing-merit-snapshot.test.ts:45`). Do not change the merit gate.
- Transfer netting already reads dispatch `costCents` minus `meritFeeCents`. With merit 0 on co-pack,
  the co-packer is paid exactly `costCents` (the quote). No transfer-execute change beyond the leg cost
  now being real.

### 2.4 CP-6 acceptance

- `dispatch-planner.test.ts`: extend so a distinct co-packer leg is paid the QUOTED cents (not 7%), the
  manufacturer leg reduces by exactly that, and `sum === productionCents` still holds. N=1 case
  unchanged (co-pack leg folded into the band, 0 carve).
- Merit-snapshot test still shows 0 merit on the co-pack leg.
- A synthetic end-to-end (routing → dispatch → transfer) shows the co-packer's payout === the co-pack
  cents the creator was charged (charge===payout, the `money-path-proven` discipline).

---

## §3 Sequencing, gates, risk

1. `pnpm db:push && pnpm db:generate` (unblocks everything; CP-1 client).
2. CP-3.1 loader + test (pure-ish, low risk).
3. CP-3.2 composer `coPackingCents` input + the four call sites, flag OFF (no behavior change).
4. CP-3.3 flag + `copack-delta-report.mjs`; review the matrix; decide the flip WITH Pavel.
5. CP-6 only after CP-3 is real (a payout with no matching charge is the exact asymmetry the spec
   forbids). Thread the field, swap 7% for the quote, preserve the sum, keep merit 0.

**Risks to watch**
- **Parity drift:** the co-pack line must be composed at all four surfaces or estimate≠charge. Single
  composer input is the guard; `estimate-charge-parity.test.ts` is the alarm.
- **Sum invariant:** the carve-out must subtract the co-pack cents from the manufacturer leg to the
  cent. This is the one place rounding can bite; pin it.
- **N=1 vs N>1:** N=1 (own co-pack service, the current default from CP-5 auto-pin) must carve nothing
  and behave exactly as today. Only a DISTINCT co-packer payee changes the split. The `isDistinct` key
  is `userId`, not `serviceId` — keep it that way.
- **Flag discipline:** OFF is the shipped state until the delta report is reviewed. Do not default it ON.

**What stays inert / unchanged:** merit on co-pack (0, forever per CP-8), the FC/print legs, shipping
outside the fee base, the manufacturer owner-pin. Co-pack is the only leg this plan touches.
