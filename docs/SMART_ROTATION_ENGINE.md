# Smart Rotation Engine — audit + spec (2026-07-06)

Pavel's ask: absolute admin control over auto-rotation — top-N pool by rating, equal/random/
exact-percentage split, new-provider exposure share, location awareness, rating visibility,
unified UI absorbing /routing-preview. This doc is the audit of what exists and the spec for
the engine. Companion to PRINT_PROVIDER_SELECTION.md §5 (PS-4) — this SUPERSEDES §5's sketch.

## 1 · Audit — what rotation actually exists today

### 1.1 Manufacturer selection (`findRouting` → `scoring.ts`)
Hard gates (category fit, MOQ range, Stripe payouts, blackouts) → weighted score:
`capabilityWeightPct 40 / proximityWeightPct 35 / certWeightPct 25` (OrderSettings, admin UI at
/order-settings/routing) → best total wins, deterministic tie-break by serviceId.
**No rotation. No rating input.** (Mostly moot: a template's manufacturer is fixed by
ownership — the scorer only arbitrates multi-manufacturer templates.)

### 1.2 Print-provider selection (`findRouting` print leg) — THE GAP
Resolution order: ① creator's pinned pick (PS-3, hard-filter validated) → ② the offering the
product bound at configuration time → ③ legacy die-cut match, preferring the OWNING
manufacturer's print service, else **`eligiblePrinters[0]` — arbitrary DB row order** →
④ manufacturer self-label.
**No rating consultation (ratingBayesian sits on PartnerService, unused by routing). No
rotation. No location logic. No award log.** "Rating drives rotation" is aspiration (PS-4),
not code, today. Rotation-to-other-partners percentage: effectively 0% — path ③ is
deterministic and owner-preferring.

### 1.3 FC selection (`fc-selector` V1 + `fc-scorer` V1.5) — the most mature
Phase-1 eligibility → <3 eligible: nearest wins (distance IS implemented here, manufacturer→FC)
→ ≥3: weighted score (`fcCost 35 / fcDistance 15 / fcSla 15 (auto-drops, no data) /
fcCapacity 15 / fcRotation 10 / fcStorageMatch 10`, admin-tunable) → **rotation band**
(`fcRotationBandPct 5`): candidates within 5% of the best score form an indifference band and
the LEAST-RECENTLY-AWARDED wins. Every award logs to `FcAwardLog` with the full score JSON.
**No percentage control, no top-N control, no new-node exposure share — band tiebreak only.**

### 1.4 Admin surfaces
- `/order-settings/routing` — manufacturer match weights (edit).
- `/routing-preview` — MANUFACTURER preview only (product + qty + destination + market → ranked
  candidates with score breakdown). Works, read-only, real gates. **No printer preview, no FC
  preview, disconnected from the weights page.**
- FC weights live in OrderSettings rows; no preview, no award-history view.

### 1.5 Verdict
Ratings render on cards but steer ZERO routing. Printers have no rotation at all. FCs have a
good scorer with a primitive fairness tiebreak. Controls are scattered across two admin pages
and two settings blocks, with no analytics on where awards actually go.

## 2 · Spec — the Smart Rotation Engine (SR)

### 2.1 RotationPolicy — one typed policy row per service type
```prisma
model RotationPolicy {
  id            String  @id @default(uuid())
  serviceType   PartnerServiceType // LABEL_PRINTING | WAREHOUSE | MANUFACTURING
  enabled       Boolean @default(false) // OFF = today's behavior, no surprise flips
  poolSize      Int     @default(3) // rotate among top-N by ratingBayesian (3, 5, custom)
  mode          RotationMode @default(EQUAL) // EQUAL | RANDOM | WEIGHTED_EXACT | BEST_ONLY
  // WEIGHTED_EXACT — exact % per rank slot, MUST sum to 100 (validated):
  slotSharesPct Int[]   @default([]) // e.g. [50, 30, 20]
  // New-provider exposure ramp (providers below MIN_RATINGS_FOR_DISPLAY):
  newProviderSharePct  Int @default(10) // % of eligible orders diverted to unrated providers
  newProviderMaxOpen   Int @default(2)  // concurrent unrated awards per provider (quality risk cap)
  // Pool entry/exit:
  ratingFloor   Decimal? @db.Decimal(4,3) // Bayesian floor; below → out of auto-pool (manual pick still allowed)
  locationBiasPct Int @default(0) // 0–100: distance damping printer→manufacturer (label-hop freight, PS-3d)
  stickyReorders Boolean @default(true) // reorders of the same product keep the SAME printer (color consistency)
  updatedAt / updatedById
}
```
All knobs admin-gated, one row per serviceType, audited on every change (AuditLog).

### 2.2 Selection algorithm (printer leg; FC analogous)
1. **Hard filters first, always** — §7 capability + ops gates (ACTIVE, Stripe, blackout,
   offering). Rotation NEVER rescues a failed filter. Pinned picks (PS-3) and configuration-time
   bindings bypass rotation entirely — a manual pick is never rotated away.
2. **Sticky reorder check** — same creator + same product previously produced by printer X and
   X still passes filters → X wins (`stickyReorders`, print color consistency; the industry
   reason Printify locks a listing to one provider).
3. **New-provider diversion** — with probability `newProviderSharePct`%, and if an unrated
   provider passes filters with < `newProviderMaxOpen` open awards → award it (exposure ramp
   solves cold-start; the Bayesian prior does the rest as ratings arrive).
4. **Pool** — rank remaining by `ratingBayesian` (per-role prior, C=10), apply `ratingFloor`,
   optional `locationBiasPct` distance damping, take top `poolSize`.
5. **Split** by `mode`:
   - EQUAL — least-recently-awarded in pool (perfect round-robin over time)
   - RANDOM — uniform random over pool
   - WEIGHTED_EXACT — weighted random by `slotSharesPct` (rank 1 gets 50%, …)
   - BEST_ONLY — pool[0] always (rating winner-take-all)
6. **PrintAwardLog** — mirror of FcAwardLog: every auto-award writes candidates + ratings +
   pool + mode + roll + winner. This is what makes "what % rotates away from #1" MEASURABLE.

### 2.3 Unified admin UI — Admin → Orders → **Routing & Rotation** (v2 surface)
One page, three tabs (Print providers / Fulfillment centers / Manufacturers); retire
`/routing-preview` and fold `/order-settings/routing` weights in.
Each tab: **[Policy]** the RotationPolicy knobs (+ FC weights / mfr match weights where they
apply) · **[Preview]** dry-run — pick product + qty (+ destination): see the filtered-out list
with reasons, the pool WITH RATINGS (mean, count, Bayesian, "New" badges), and 100-run split
simulation ("next 100 orders: A 52 / B 29 / C 19") · **[Awards]** last-90-day actual share per
provider vs configured target, rotation-applied rate, new-provider share actual, deep-links to
orders. KPI strip: pool depth · awards 30d · new-provider share · top-1 concentration.

### 2.6 The sample verdict loop (SR-2.2, Pavel 2026-07-06)
The sample is where rotation SHOULD happen; production is where it should stop. Samples decide
the chain: the creator judges PRODUCT (manufacturer's craft) and PRINT/PACKAGING (printer's
craft) SEPARATELY on delivery.
- **Approve print** → the sample's printer becomes the pinned ProductPrintSelection (locked
  chain — what the sample was for). Any prior rejection of that printer is superseded.
- **Reject print** → ProductPrintExclusion (per creator+product, consumed by findRouting, the
  sticky lookup, AND the sample resolver — never auto-routed again), any stale pin at that
  printer clears, and the switch list offers sampleCapable alternatives → one click re-pins →
  re-sample. No lock ever forms from a rejected sample.
- **Sticky follows APPROVED chains only**: PRODUCTION orders imply approval; SAMPLE orders
  stick only with an APPROVED print verdict.
- **Sample print leg**: BRANDED samples of externally-printed products resolve a real printer
  (pin → SAMPLE-context rotation among sampleCapable + exclusions applied); binding + award
  log ship now, the physical 1-unit dispatch is ops-manual in V1 (noted in internalNotes).
- **Contexts**: RotationPolicy is (serviceType, context)-scoped — DEFAULT (bulk) / SAMPLE /
  REPLENISHMENT; context row wins, falls back to DEFAULT. Samples typically run a HIGHER
  newProviderSharePct (cheapest failure in the system); replenishment runs sticky+BEST_ONLY.
- **In-house manufacturers**: nothing to swap — the card says so honestly; notes reach the
  manufacturer conversation.
- Verdicts editable until a production order books; then locked (legal reproducibility).

### 2.4 Extra controls Pavel didn't list (recommended, cheap on this architecture)
- **Per-provider kill switch** — `excludeFromAutoRotation` flag on PartnerService: out of the
  auto pool WITHOUT deactivating (manual/pinned still works). Ops pressure valve.
- **Capacity damping** — skip providers near monthly capacity (capacity-ledger tie-in) instead
  of overloading the top-rated shop.
- **Measured-SLA factor** — we already compute measured production days (PS-2 cards); expose as
  an optional pool-ranking tiebreak ahead of quoted lead time.
- **Strike integration** — partner strikes (cancellation policy) temporarily drop a provider's
  pool eligibility; auto-restores.
- **Scoped overrides later** — per-category/market RotationPolicy rows (the OrderSettings
  override pattern exists); V1 ships global per-serviceType.

## 3 · Execution checklist

### SR-1 — schema + pure engine — **BUILT 2026-07-06 (CW)**
- [x] Schema: `RotationMode` enum (EQUAL/RANDOM/WEIGHTED_EXACT/BEST_ONLY), `RotationPolicy`
  (one row per ServiceType, `enabled=false` default — no behavior change until admin flips),
  `PrintAwardLog` (FcAwardLog mirror w/ full decisionJson), `PartnerService.excludeFromAutoRotation`
  kill switch + `printAwards` back-relation; `RotationPolicy` audit entity type
- [x] Pure engine `packages/orders/src/rotation.ts` — `selectRotatingProvider()`: disabled
  passthrough (exact pre-SR behavior) → sticky reorder → new-provider diversion (share % +
  open-award cap, least-exposed first) → rating pool (Bayesian rank, floor never kills unrated
  — the ramp caps them, median-ranked otherwise; location damping 0–100%; top-N) → split
  (EQUAL least-recently-awarded / RANDOM / WEIGHTED_EXACT with renormalization on short pools /
  BEST_ONLY). Kill-switch fallback never strands an order. Injectable rolls = deterministic
  tests + the preview simulator reuses the SAME function
- [x] `validateRotationPolicy` (pool 1–25, shares sum EXACTLY 100, slots ≤ pool, ranges) +
  `buildRotationAwardPayload` for PrintAwardLog
- [x] Tests: vitest matrix (15 cases) + compiled-node verification 15/15 incl. 10k-roll
  statistical check → exactly 5000/3000/2000 on 50/30/20
- [ ] **[PAVEL]** migrate: `pnpm db:push && pnpm db:generate && rm -rf apps/*/.next`

### SR-2 — routing wiring — **BUILT 2026-07-06 (CW)**
- [x] findRouting print leg: `eligiblePrinters[0]` replaced by `rotatePrintShop()` — loads the
  LABEL_PRINTING RotationPolicy (no row / disabled → legacy first-candidate, zero extra queries
  on the hot path), enriches survivors with ratingBayesian/ratingCount/isNew(<3)/kill-switch/
  lastAwardedAt/openAwardCount(30d window proxy), runs `selectRotatingProvider`. Deliberate
  bindings untouched: pinned (PS-3), config-bound offering, D3 owner-print preference all
  bypass rotation. `distanceMiles=null` until SR-2.1 geo enrichment (bias dimension drops)
- [x] `RoutingResult.printAwardDecision` — decision payload returned to the caller; cart-actions
  persists PrintAwardLog with orderId POST-order-create (best-effort, never aborts an order)
- [x] Sticky-reorder lookup — creator's last Order with this product's printProviderServiceId,
  passed as `previousProviderServiceId`; `creatorUserId` param wired from checkout

### SR-2.2 — sample verdict loop — **BUILT 2026-07-06 (CW; migrated)**
- [x] Schema: `SampleVerdict` (one per sample order, product+print verdicts, notes),
  `ProductPrintExclusion` (creator+product+service unique, reason, sourceOrder),
  `PartnerService.sampleCapable` (default true), `RotationPolicy.context`
  (DEFAULT/SAMPLE/REPLENISHMENT, unique serviceType+context) + audit entity types
- [x] `resolveSamplePrintLeg` (packages/orders/sample-print.ts): pin → SAMPLE-context rotation
  among sampleCapable ACTIVE printers, exclusions applied, no sticky (the sample IS the
  rotation moment), policy.enabled stays authoritative; award payload returned
- [x] `createSampleOrder` wires the print leg for BRANDED samples of externally-printed
  products: `printProviderServiceId` set, PrintAwardLog written, internalNotes records
  pin-vs-rotation + the V1 ops-manual note; IN_HOUSE/unbranded unchanged
- [x] findRouting consumes persistent exclusions (merged pre-pinned-validation — a stale pin
  at an excluded printer surfaces pinnedPrintUnavailable, never binds); sticky follows
  APPROVED chains only (SAMPLE orders need an APPROVED print verdict)
- [x] `loadRotationPolicy(serviceType, context)` + `policyInputOf` exported (SR-3 UI reuses)
- [x] Creator verdict card on delivered sample orders: separate product/print judgments,
  approve→pin toast, reject→exclusion + alternatives list (Bayesian-ordered, "New" labeled)
  → switch pins + "Order a re-sample" CTA; in-house copy when nothing is swappable; verdict
  locks once production books; all actions audited (SAMPLE_VERDICT_*, PRINT_PROVIDER_PINNED_
  BY_SAMPLE_APPROVAL, PRINT_PROVIDER_EXCLUDED_BY_SAMPLE_REJECTION, PRINT_PROVIDER_SWITCHED_
  AFTER_SAMPLE)
- [x] Partner toggle: "We can print 1-unit pre-production samples" on /settings/labeling for
  LABEL_PRINTING services (audited SAMPLE_CAPABILITY_CHANGED)
- [x] Verdict email (sprint closeout 2026-07-06): `CREATOR_SAMPLE_VERDICT` event (reminders
  category, tokens orderId/productName/printPartnerName/reminder, print-aware copy) +
  `/api/cron/sample-verdict` (delivered+1d ask, +7d single reminder, Notification-row ledger,
  verdict = closed = no nudge) + vercel.json cron entries (also added the missing
  rate-partners schedule)
- [x] REPLENISHMENT detection (sprint closeout 2026-07-06): `rotatePrintShop` counts prior
  booked PRODUCTION orders for (creator, product) → loads the REPLENISHMENT policy row
  (falls back to DEFAULT); first-time buyers rotate, repeat buyers get consistency-tuned
  policy
- [ ] Follow-up: sample print DISPATCH mechanics (ops-manual V1)

### SR-3 — Routing & Rotation admin surface — **BUILT 2026-07-06 (CW)**
- [x] `/routing-rotation` (sidebar: Settings → Order Settings → Routing & Rotation), 3 tabs:
  **Print providers** — context-scoped policy editor (DEFAULT/SAMPLE/REPLENISHMENT sub-tabs:
  enable switch, Top-3/Top-5/custom pool, EQUAL/RANDOM/WEIGHTED_EXACT/BEST_ONLY w/ exact-%
  input validated to sum 100, new-provider share + open-award cap, rating floor, location
  bias, sticky toggle; saves audited ROTATION_POLICY_SAVED) · dry-run preview (product + qty +
  context → the EXACT production engine over 100 evenly-spaced rolls, deterministic; shows
  ratings, pool membership, share bars; honestly reports CONFIG_BOUND / NO_DIE_CUT /
  OWNER_SELF_LABEL bindings + engine-off legacy pick) · providers table (rating, 90d awards +
  actual share, sampleCapable, per-provider kill switch audited AUTO_ROTATION_EXCLUDED/
  REINSTATED). **FCs** — live scorer weights + band read panel (edit stays at Order settings;
  SR-4 stub notes the WAREHOUSE policy row state). **Manufacturers** — match-weights pointer +
  the absorbed routing preview
- [x] KPI strip: active printers · auto-awards 90d · top-1 concentration · new-provider share ·
  excluded count
- [x] /routing-preview retired → redirect (form + action files stay; /routing-rotation imports
  them); sidebar entry swapped
- [x] **Partner Routing page retired → merged (2026-07-06, CW).** `/order-settings/routing`
  now redirects to `/routing-rotation`; sidebar entry removed. The center is the single source
  of truth: **Manufacturers tab** gained an editable match-weights form (capability/proximity/
  cert → `saveManufacturerWeights`), and a new **Dispatch lifecycle tab** holds the
  post-assignment timers (accept window · max reroutes · auto-cancel · changeover days →
  `saveDispatchLifecycle`). Both forward to the same `saveOrderSettings` writer every engine
  consumer already reads — no config forked. `maxReroutes` is now settings-driven at its single
  definition point (`resolveMaxReroutes`/`rerouteBudgetRemaining`/`canReroute` in dispatch-fsm,
  6 tests) instead of a hardcoded literal; **live reroute enforcement is still pending the
  Week-8 `transitionDispatch` implementation** (V1 reroute is manual — the knob is stored + the
  cap is resolved, but nothing increments/blocks on it in production yet).
- [ ] SR-3 polish backlog: filtered-out-with-reasons list in preview (needs §7 job facts) ·
  awards deep-link to orders · configured-vs-actual variance alert · retire the now-unused
  `RoutingForm` export in OrderSettingsForms.tsx (harmless, left in place)

### SR-4 — FC adoption (pending)
- [ ] FC tab: poolSize/mode/new-node share layered on the existing scorer band

### Later
- [ ] Capacity damping (capacity-ledger tie-in) · measured-SLA factor · strike integration ·
  scoped per-category/market policy overrides
