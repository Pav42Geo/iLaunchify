# On-demand = manufacturer-only, full-service. The gate that enforces it.

**Status:** DECIDED (Pavel, 2026-07-20). **Predicate + gates 1-3 + SellChannels UI BUILT 2026-07-20**
(`packages/orders/src/on-demand-eligibility.ts` + tests; schema-free, dark-safe). Remaining: gate 4
(ingest readiness fold-in + C2.2 router `assertSinglePartnerPlan`) and the `check:invariants` rule.
**Scope:** ChannelListingMode.ON_DEMAND, meaning **A2** of `ON_DEMAND_DISAMBIGUATION_2026-07-16.md`.
**Origin:** bulk-vs-on-demand audit 2026-07-20. Line refs are as of that date.

---

## §0 The decision

> **An ON_DEMAND channel order is executed by ONE partner: the pinned manufacturer.**
> The manufacturer covers the whole process in-house: manufacturing, printing/decoration,
> packing, and parcel shipping. On-demand orders NEVER route to the print rotation,
> never spawn an external LABEL_PRINTING dispatch, and never involve a co-pack leg.
> "At least for now": the rule lives in one predicate, so relaxing it later
> (e.g. allowing a nominated co-partner press) is a one-site change.

Why this fits existing doctrine: N=1 full-service-manufacturer-first
(`.claude/memory/ilaunchify-n1-full-service-first.md`), print pool restricted to pure
printers (`isPublicPrintPoolEligible`, rotation.ts:299), and merit judging only the
manufacturing leg (an on-demand order is 100% that leg,
`SERVICE_SYMMETRY_AND_MERIT_2026-07-15.md`).

## §1 Why a gate is needed (the audit findings)

Today's `findRouting` usually lands on the manufacturer self-labeling, but **by default,
not by law** (`routing.ts:376` is the fallthrough, not a rule). Four leak paths would
break the decision the moment C2.2 (READY -> production router) ships:

1. **Pinned print pick** (`pinnedPrintServiceId`, routing.ts:311-337) spawns an external print dispatch.
2. **Selection-bound print offering** (decorated component carrying a `LABEL_PRINTING` `partnerOfferingId`, routing.ts:344-365) does the same.
3. **Die-cut fallback** (`dieCutTemplateId`, routing.ts:367-461) can reach the SR-2 rotation engine (`rotatePrintShop`, routing.ts:545) when a qualifying pure printer exists.
4. **Nomination** (routing.ts:276-303, dark today) would direct print to a co-partner.

And nothing upstream compensates: `OnDemandEnablement` is **branding consent only**
(status + snapshot + capacityPerDay; schema.prisma:6087-6103). Neither
`requestOnDemandEnablement`, `decideOnDemandEnablement`, `pushListing`, nor ingest
checks print, pack, or parcel capability. Meaning **B** (`PartnerService.onDemandEnabled`
+ `canShipParcel`, ship-from-stock) never intersects the channel path, so today nothing
even verifies the manufacturer can ship a consumer parcel.

Also confirmed: `RotationOrderContext` has no ON_DEMAND value. **Do not add one.**
When the invariant holds, rotation is unreachable; an ON_DEMAND rotation context would
imply the opposite.

## §2 The predicate (SSOT)

New file: `packages/orders/src/on-demand-eligibility.ts`. Two layers, both exported:

**Layer 1: static eligibility (fast, explainable, used by all upstream gates).**

```ts
type OnDemandIneligibleReason =
  | 'NO_PINNED_MANUFACTURER'          // template.manufacturerServiceId null (or stale: service gone/inactive)
  | 'EXTERNAL_PRINT_REQUIRED'         // effectivePrintSourcing(...) === 'EXTERNAL_REQUIRED' (self-label forbidden).
                                      // NOTE: EXTERNAL_ALLOWED alone stays eligible (routing self-labels when
                                      // nothing external is selected; the schema DEFAULT is EXTERNAL_ALLOWED,
                                      // so requiring strict IN_HOUSE would block nearly every real service).
                                      // The concrete external artifacts below are what disqualify.
  | 'EXTERNAL_PRINT_PIN'              // pinnedPrintServiceId set and != mfr service
  | 'EXTERNAL_PRINT_OFFERING'         // any decorated component's LABEL_PRINTING offering belongs to another partner
  | 'ACTIVE_PRINT_NOMINATION'         // getActiveNominatedServiceId('LABEL_PRINTING') resolves to != mfr
  | 'DIE_CUT_WITHOUT_OWN_PRESS'       // dieCutTemplateId set and owner has no own print service (would rotate)
  | 'COPACK_LEG_PRESENT'              // plan would include a COPACKING dispatch
  | 'MANUFACTURER_CANNOT_SHIP_PARCEL' // mfr service canShipParcel !== true

function isOnDemandEligible(productId: string): Promise<
  { eligible: true; manufacturerServiceId: string }
  | { eligible: false; reasons: OnDemandIneligibleReason[] }
>
```

Notes:
- **Parcel capability is required** (`canShipParcel` on the manufacturer's service).
  This is the ONE sanctioned crossing of meaning B into the A2 path: made-to-order
  means each consumer order ends in a parcel the manufacturer ships. Document the
  crossing at the read site; do not conflate the enums.
- **Storage is NOT required in V1** (goods ship on completion). It becomes required
  when V2 buffer inventory lands; add a reason then.
- Reuse `effectivePrintSourcing()` (`packages/orders/src/print-sourcing.ts:26`) as the
  print signal. Do not re-derive labelingMode logic.
- Return ALL failing reasons, not the first: the creator-facing UI needs the full list.

**Layer 2: plan assertion (authoritative, used by the router).**

```ts
function assertSinglePartnerPlan(routing: RoutingResult): void
// throws unless every resolved leg (manufacturing, label, pack, ship-origin)
// belongs to the pinned manufacturer's partner. No dispatch fan-out.
```

Layer 1 predicts; Layer 2 verifies what `findRouting` actually resolved. Belt and
suspenders, because upstream state can change between publish and ingest and routing.
Never call `findRouting` speculatively for Layer 1 (rotation writes `PrintAwardLog`;
no dry-run side effects).

## §3 The four patch points (all fail-closed)

| # | Site | Change |
|---|---|---|
| 1 | `requestOnDemandEnablement` (apps/creator publish/actions.ts:332; existing no-pinned-mfr guard :339-340) | Pre-flight `isOnDemandEligible`. Refuse the request with the reason list; creator fixes the product (unpin external printer, etc.) before the manufacturer ever sees it. |
| 2 | `decideOnDemandEnablement` (apps/partner on-demand/actions.ts:107) | Server re-check before writing ENABLED. Approval of an ineligible product is refused even if the request predates a product change. Surface the capability summary in the queue UI. |
| 3 | `pushListing` ON_DEMAND branch (apps/creator publish/actions.ts:489-506, currently only `status==='ENABLED'`) | Go-live requires enablement AND `isOnDemandEligible`. Failing leaves the listing at PUSHED with the reason, same pattern as the bulk pool gate. |
| 4 | Ingest per-line readiness (channels/orders/ingest.ts:179-202) + **future C2.2 router entry** | Ingest: eligibility folded into `evaluateReadiness` (catches post-go-live product changes; order parks, never mis-routes). Router: `assertSinglePartnerPlan` on the `findRouting` output before creating dispatches. This is the line that makes rotation unreachable regardless of upstream state. |

UI companion: `SellChannels` mode toggle (publish/SellChannels.tsx:164-172) disables
the On-demand option with the human-readable reasons when ineligible.

Guard: add a `check:invariants` rule "ON_DEMAND go-live and C2.2 routing call
on-demand-eligibility" (grep-level, same rationale as the enablement-scoping rule:
the channel sites are cast-guarded, TypeScript cannot protect them).

## §4 Creator journey: on-demand ends at PUBLISH, not checkout (RECOMMENDED, pending Pavel confirm)

The Printify/Printful shape is the right one, and the platform is already built for it:

- **No upfront payment, no checkout.** The creator configures the product (PDP +
  Studio, per the checkout-is-confirm-only doctrine), launches it as a creator
  Product (draft/unpublished), requests enablement, and publishes the listing.
  Money exists only per consumer order: the LOCKED C2.2 model already says
  per-consumer-order auto-charge of the saved method, daily cap, ON_HOLD on breach
  (`CHANNEL_MANAGEMENT_SPEC.md`). Nothing about that needs a checkout pass.
- **Checkout remains exactly what it is today:** the confirm screen for orders that
  buy production NOW (bulk runs, samples, hold-at-manufacturer). Do not thread
  on-demand through it; the two flows share the pricer, not the funnel.
- **One NEW go-live requirement:** a chargeable saved payment method on file before an
  ON_DEMAND listing goes LIVE (add `PAYMENT_METHOD_MISSING` to the pushListing gate,
  same PUSHED-with-reason pattern). Without it the first consumer order lands ON_HOLD,
  which is a support ticket, not a flow.
- **Samples are unchanged:** a creator who wants one in hand before publishing buys it
  through regular checkout at the normal tier rate (PP-0d: a sample is just a small
  order). Recommended in the publish UI, never required.
- **Pricing when C2.2 bills:** the spawned production order must price off the
  manufacturer's **ON_DEMAND bands** (`fulfillmentMode` on
  `ProductTemplatePricingTier`), which exist and are authorable today but are unread.
  Mode-aware band selection in `computeOrderPricing` is the prerequisite work item
  BEFORE C2.2, per the 2026-07-20 audit. Publishing without upfront payment is safe
  only if the per-order bill is the right one.

## §5 Sequencing

1. Predicate + patch points 1-3 + UI reasons (schema-free, buildable now, all dark-safe).
2. Mode-aware pricing: `resolveGoods`/`computeOrderPricing` select bands by
   `fulfillmentMode`; fix the PDP interleaving bug (tier-pricing.ts:22-33) on the way.
3. C2.2 router with `assertSinglePartnerPlan` + payment-method gate + auto-billing.
4. Later, if ever: relax the predicate for nominated co-partner print (one site).
