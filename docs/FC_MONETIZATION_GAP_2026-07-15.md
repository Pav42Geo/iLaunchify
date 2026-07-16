# FC / WAREHOUSE monetization: the gap is NOT a builder

**Status:** FINDINGS. Written 2026-07-15 when Pavel asked whether an FC service builder would close
the service cycle after the Print and Co-packer builders.
**Answer: it would close the UI cycle, and it would not make FC bill a cent.** FC's problem is the
opposite of co-pack's, and a prototype is the smallest part of it.

---

## §0 The one-line summary

**Co-pack has no price model. FC has a good one, multiplied by zero at three independent points.**

Fix any one of the three and FC still bills $0. Fix all three and FC monetization is live **without a
single new schema field**.

| | **Co-packing** | **FC / WAREHOUSE** |
|---|---|---|
| Price columns | **zero** | **10** (billing unit, rate, min monthly, grace, pick, pack, dwell, + VAS fee/min/lead) |
| Billing math | `Math.floor(total * 0.07)` | `computeStorageAccrual`, pure, **unit-tested** |
| Frozen snapshot | none | `StorageAgreement.feeSnapshotJson`, legally reproducible |
| Platform take | none | `warehouseReferralFeeBps` + admin UI + override scopes |
| Locked decision | **was open (C1)** | **L9, locked 2026-07-02** |
| Creator price line | none | `PriceLine.kind = 'FC_LABELING'` |
| Reaches Stripe | nothing | **FC labeling only** |
| **The gap** | **monetization** | **plumbing** |

---

## §1 The three zeros

### Zero 1: the rate has no door

**`storageRateCents` has NO writer for a WAREHOUSE service, anywhere in the repo.** Its only writers:

- `apps/partner/.../settings/storage/actions.ts:159` - gated `PRODUCING_TYPES = ['MANUFACTURING', 'COPACKING']`
- `apps/partner/.../services/actions.ts:164` - gated: `if (service.type === 'WAREHOUSE') return { ok: false, ... }`
- `packages/db/prisma/seed-fc-dryrun.ts:86` - a **seed script**

`grep storageRateCents apps/admin` returns **zero hits**. Admin `/logistics/fulfillment-centers` is a
list page with no rate editor.

**And the two partner doors form a literal loop:**

1. `services/actions.ts:148` tells an FC: *"FC storage is managed in Settings -> Storage (3PL service)."*
2. `settings/storage/page.tsx` is a **redirect** (SUPERSEDED, Pavel 2026-07-13) -> `/services`
3. `/services` **refuses WAREHOUSE** (`page.tsx:104`, "WAREHOUSE is NOT self-serve"; `:155` returns
   `['overview']` only)

**The consequence, `inbound/actions.ts:246-252`:** every FC storage agreement created today snapshots
`rateCents: fcService.storageRateCents ?? 0` -> **`0`**. The billing math is correct and the answer is
zero. `weeklyPalletCapacity`, `fcCertifications`, `hazmatAccepted`, `facilityLat/Lng` are equally
writer-less, **while `fc-scorer.ts` / `fc-selector.ts` read them as hard filters and weights.**

### Zero 2: nothing charges

`computeStorageAccrual` (`packages/shipping/src/storage-accrual.ts`) computes correctly and is pinned.
**All six callers are display surfaces** (partner billing, partner inventory, creator storage panel,
creator inventory, admin order detail, its own test). **No `stripe.invoice`, no `PaymentIntent`, no
`Charge`, no cron.** The schema's `// Monthly Stripe billing line` (`:9545`) is an intent, not code.

`storage-accrual.ts:11` says so plainly: *"Charge EXECUTION stays gated behind the
payments-verification checklist - this module only computes."*

**This breaks the L-series' own promise.** `LOGISTICS_AND_FULFILLMENT.md:472`: *"every logistics
capability ships 'build-ready, admin-gated'... Nothing waits on code at enable time; everything waits
on ops readiness."* For storage billing that is **false**: the gate cannot flip on code that does not
exist. L9 locked "Monthly Stripe billing on the fee snapshot" and that half was never written.

### Zero 3: the take is 0%

`OrderSettings.warehouseReferralFeeBps Int @default(0)` (`schema.prisma:3241`).

**The irony worth naming:** `MANUFACTURER_MERIT_ENGINE.md:283-285` argues a low manufacturer
commission is affordable *because* the platform has other levers, and names **"FC/logistics margin"**
as one of the three. **The lever that justifies Premier's 0% is itself set to 0% and bills nothing.**

---

## §2 A real bug found on the way: the L9 rate bands were lost in the migration

L9 locked: *"Partner rates constrained to admin-approved bands."* That enforcement exists:

`settings/storage/actions.ts:26-36` - `STORAGE_RATE_BANDS`: `PALLET_MONTH` $5.00-$150.00,
`CUFT_MONTH` $0.30-$3.00, citing the research anchors.

**But that route was superseded on 2026-07-13, and the live `/services` editor did not inherit the
bands.** `services/actions.ts:162-164` validates only `>= 0`:

```ts
if (input.storageRateCents !== undefined) {
  const v = int(input.storageRateCents)
  if (v !== undefined) data.storageRateCents = v
}
```

**A producing partner can save $500/pallet/month today.** The band enforcement L9 locked is sitting in
a dead route. This is independent of everything else here and worth fixing on its own.

---

## §3 So: should we build an FC service builder?

**Yes, but know what it buys.** It fixes **Zero 1 only**, and Zero 2 is the one standing between the
platform and revenue.

**And it is not the same artifact as the Print / Co-packer builders**, because of a locked decision:
`services/page.tsx:104` - *"WAREHOUSE is NOT self-serve - the FC network is admin-contracted (Pavel
2026-07-13)."* `LOGISTICS_AND_FULFILLMENT.md:463` (L2): *"Until [ShipBob] FCs run as admin-onboarded
WAREHOUSE partners (V1 manual flow)."*

A 3PL negotiates a contract; they do not self-publish a rate card. So the FC builder is an **ADMIN
onboarding surface** (admin sets the contracted rates, capacity, certs, geo) with, at most, a
partner-side read-only view plus the operational surfaces that already exist. Building it as a
partner-self-serve builder would contradict a decision made three days ago.

**Recommended order:**

1. **FC-1 - Restore the L9 bands** on the live `/services` path (§2). Independent, small, a real bug.
2. **FC-2 - Give the rate a door.** An admin FC editor at `/admin/logistics/fulfillment-centers/[id]`:
   `storageBillingUnit`, `storageRateCents` (band-checked), `storageMinMonthlyCents`,
   `storageFreeGraceDays`, `pickFeeCents`, `packFeeCents`, `maxDwellDays`, `weeklyPalletCapacity`,
   `fcCertifications`, `hazmatAccepted`, `storageClasses`, `facilityLat/Lng`. **Every one of these is
   already read by the scorer and the accrual; none has a writer.**
3. **FC-3 - Set `warehouseReferralFeeBps`** to something non-zero.
4. **FC-4 - THE BIG ONE: the charge executor.** A monthly sweep over open `StorageAgreement` rows ->
   `computeStorageAccrual(feeSnapshotJson)` -> Stripe invoice line -> ledger row. This is the half of
   L9 that was never written, and it is the only item here that produces revenue. Gate it behind the
   payments-verification checklist as designed.
5. **FC-5 (optional) - The prototype.** Once FC-2 exists, an admin-side builder prototype in the
   Print/Co-pack visual language is a nice-to-have, not a blocker.

---

## §4 Does this close the service cycle? Nearly, and here is the honest map

| Service | "Builder" today | Priced? | Reaches Stripe? |
|---|---|---|---|
| MANUFACTURING | `products/new` guided builder (~55 files) | yes | yes |
| LABEL_PRINTING | prototype BUILT (`design/print-service-builder-prototype.html`), PS-9-0 schema landed | partly (offering + price curves) | yes |
| COPACKING | prototype BUILT (`design/copacker-service-builder-prototype.html`) | **no** (CP-1..CP-3) | no |
| WAREHOUSE | scattered across 5 routes + 2 dead redirects | **yes** | **FC labeling only** |

**Caveat on "closing the cycle": MANUFACTURING has no service builder.** It has a *product* builder.
The manufacturer's service-level commercial terms are spread across `/services` capability editors and
per-product `ProductTemplatePackaging` rows. If the goal is genuine end-to-end symmetry, that is the
fourth gap, and nobody has named it.

**What Pavel did not miss but is worth stating:** exactly one FC revenue line reaches Stripe today,
and it is **FC labeling**, precisely because it is a per-unit fee on a **known quantity at checkout**,
which makes it structurally a production line rather than a storage line. Every *recurring* FC line
(storage, pick/pack, referral) is display-only. **That is the tell: the platform bills what enters the
order, and accrues what does not. Storage is the only revenue that is not an order line, and it is the
only revenue that does not bill.**

`FcValueAddedService` is also the platform's **only working model of a partner pricing an operation**,
and it is the shape CP-1 should copy (see `COPACK_SERVICE_SPEC_2026-07-15.md` §4).
