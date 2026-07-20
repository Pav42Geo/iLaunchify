# Design brief: co-pack capacity reservation (holding a slice of the lines for the platform)

**Status:** BRIEF. Written 2026-07-19 (Cowork) from Pavel's question: a co-packer's machines are not
free all the time, so they want to give iLaunchify only 30 to 50 percent of a line's capacity, and once
that slice is full, the platform must stop routing them work.

**Companions:** `COPACK_SERVICE_SPEC_2026-07-15.md`, `RISK_MANAGEMENT_CENTER.md` (§4, capacity
overcommit M1), `SMART_ROTATION_ENGINE.md`. Depends on CP-1..CP-6 (the co-pack engine + builder).

---

## §0 The core reframe

The number a co-packer gives us is their **allocation to iLaunchify**, not their physical plant
maximum. "I will give you 40 percent of Line 2" is a slice they reserve. The platform's job is four
verbs: let them **declare** the slice, **debit** it as jobs book, **gate** them out of routing once the
slice is full for a window, and let them **adjust** it (raise, lower, pause, blackout).

Two things make this honest instead of naive:

1. **The unit is TIME, not units.** A variety pack on the hand line at 900/hour consumes four times the
   line-time per unit that the auger at 3,600/hour does, so a flat "units per week" ceiling lies about
   what is actually scarce. The CP-2 engine already computes each job's line-hours: `changeoverMinutes/60
   + qty/runSpeedUnitsPerHour` (`copack-quote.ts copackLineCostCents`). Capacity should be a
   **line-hours-per-week budget per line**, and each booked job debits its computed hours. Expressing
   "30 to 50 percent" is then just `allocationHours = pct × line operating hours per week`.

2. **Enforcement needs a reservation LEDGER plus a hard gate, and the substrate already exists.** There
   is a manufacturing capacity ledger and overcommit detector today (`capacity-ledger.ts`
   `loadCapacityMonths`/`monthKey`, `@ilaunchify/risk evaluateCapacityOvercommit`, the checkout hook
   `evaluateCapacityGateForCheckout`) running in MONITOR / WARN / GATE modes, best-effort, never
   auto-rerouting. Co-pack should ride the SAME substrate rather than inventing a parallel one.

---

## §1 What exists to build on (do not reinvent)

- **`PartnerCopackConfig.weeklyCapacityUnits`** (CP-1): captured in the CP-4 builder, but **read
  nowhere** today. It is the naive proxy for the allocation. Keep it as the small-producer floor (§4).
- **`PartnerCopackLine`** (CP-1): `runSpeedUnitsPerHour`, `changeoverMinutes`, `minRunUnits`,
  `maxRunUnits`. The physics needed to turn a job into line-hours is already here.
- **The line-hours function** already lives in `copack-quote.ts` (the run-time portion of
  `copackLineCostCents`). Expose a tiny `copackLineHours(line, qty)` so the ledger and the price share
  one source.
- **Risk M1 capacity substrate**: the ledger + overcommit detector + checkout gate + the admin
  MONITOR/WARN/GATE modes. This is where a co-pack ledger and gate should plug in, so ops gets one
  capacity console, not two.
- **`selectCopackLine`** (CP-2): the routing chooser. Over-allocated lines must be **hard-filtered out**
  of its candidate set, exactly like temp-class and format (the platform's "hard filters, never
  weights" rule).

---

## §2 The model

**Declaration (per line, in the CP-4 builder).** Add to `PartnerCopackLine`:
- `operatingHoursPerWeek` (Int) — the line's real weekly running hours (e.g. 40, or 80 on two shifts).
- `platformAllocationPct` (Int bps or 0..100) OR `platformAllocationHoursPerWeek` (Int) — the slice
  reserved for iLaunchify. The builder shows both and derives one from the other, so a co-packer can
  say "40 percent" or "16 hours/week", whichever they think in.
- `pausedUntil` (DateTime?, nullable) — a hard per-line pause for a surge or maintenance (instant zero
  availability until the date).

**Blackout windows.** A `CopackBlackout` child (partnerServiceId, lineId?, startsAt, endsAt, reason) or
reuse whatever the FC blackout concept uses. A line is unavailable inside a blackout regardless of its
allocation.

**The ledger (the load-bearing new piece).** A `CopackCapacityCommitment` row per booked job:
`partnerServiceId`, `lineId`, `weekStart` (the ISO week the run lands in), `committedHours`,
`orderDispatchId`, `status`. Debit `committedHours` when a co-pack dispatch is ACCEPTED (or at booking,
policy choice); credit it back on cancel/decline. Sum by `(lineId, weekStart)` gives committed hours per
window. This mirrors `capacity-ledger.ts` for manufacturing months, but keyed by line and week.

**The gate.** At routing (`selectCopackLine`) and at the checkout capacity hook: for the target delivery
window, `remaining = allocationHours − committedHours(line, weekStart)`. If `thisJobHours > remaining`,
the line is unavailable. Behavior follows the Risk M1 mode:
- MONITOR: allow, log the overcommit (shadow, current default).
- WARN: allow, surface an "at capacity, extended ETA" note.
- GATE: drop the line from candidates; routing tries another line/co-packer, or the job routes to a
  different partner, or (co-pack) the manufacturer self-assembles.

**Rolling horizon.** Allocation and the ledger are per forward WEEK, not one lifetime number. A booking
for three weeks out debits that week. The builder shows the next N weeks (say 8) as a simple availability
strip so the co-packer sees where they are full and can lift the allocation for a hungry week.

---

## §3 Enforcement points (where the number actually bites)

1. **Routing** (`selectCopackLine` / the co-pack resolver in `copack-order-pricing.ts`): a line with
   `remaining < thisJobHours` for the window, or `pausedUntil > now`, or inside a blackout, is filtered
   OUT of the candidate set. Hard filter, never a weight.
2. **Checkout capacity gate** (`evaluateCapacityGateForCheckout`, extended for co-pack): the same math,
   surfaced to the creator as an ETA extension in WARN, a block in GATE.
3. **Builder UI** (CP-4 step 1/2): show each line's allocation, this week's committed hours, and the
   forward strip, so the co-packer manages it like a calendar, not a guess.
4. **Dispatch accept**: writing the commitment row is the debit; the accept action is the natural hook.

---

## §4 The small-producer floor (do not force line-hour math on the garage)

The same model must serve the one-person honey operation AND the industrial co-packer. Line-hours is the
honest, sophisticated layer; it must not become a barrier for someone who thinks in "I can do 500 jars a
week and then I am done." So:

- **`weeklyCapacityUnits` stays as the simple ceiling.** A small producer sets "max N units per week"
  and the gate debits UNITS (not hours) against it. No lines, no changeover math, no percentages.
- **Line-hours is opt-in, and only meaningful when a partner declares real lines.** A co-packer who
  authored lines (CP-4) gets the line-hour allocation; a producer who did not gets the units ceiling.
- The gate reads whichever the partner declared: `if (line hours declared) debit hours else if
  (weeklyCapacityUnits) debit units else no cap`.

This keeps the garage on a one-field ceiling and gives the plant the calendar, from the same code path.

---

## §5 Phasing

- **Cap-0 (units ceiling + ledger + gate).** Enforce the EXISTING `weeklyCapacityUnits` (today captured,
  never read): a booking ledger in units per week, a gate at routing + checkout. Ships value to every
  co-packer immediately and covers the small-producer case fully. Small, no new physics.
- **Cap-1 (line-hours + allocation + pause + blackout).** Add `operatingHoursPerWeek` +
  `platformAllocation*` + `pausedUntil` + blackout to `PartnerCopackLine`; expose `copackLineHours`;
  ledger and gate switch to hours when lines are declared. The honest model.
- **Cap-2 (rolling horizon UI).** The forward availability strip in the builder + per-week booking
  visibility.

Each phase is additive (uuid, no drops) and gated: the gate runs in MONITOR first (shadow, logs only),
then WARN, then GATE, using the Risk M1 modes, so nothing blocks an order until ops has watched the
numbers, exactly as the merit and PP-0 rollouts did.

## §6 Open decisions for Pavel

1. **Debit at booking or at accept?** Booking reserves earlier (no overselling) but holds capacity for
   unaccepted jobs; accept is cleaner but can oversell in the accept window. Recommend: soft-hold at
   booking, hard-commit at accept.
2. **Percent or hours as the primary input?** Recommend showing both, storing hours (a percent of a
   changing operating-hours number drifts).
3. **What happens when every co-packer is full?** Same fork as any routing miss: extend ETA, route to
   another partner, or the manufacturer self-assembles. Recommend surfacing "next available week" so the
   creator can choose to wait.
4. **Merit interaction:** none. Capacity is a hard availability filter, not a quality signal; it does not
   touch the merit engine (which stays manufacturing-only anyway).
