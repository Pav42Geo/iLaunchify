# "On-demand" means THREE different things. Read this before touching any of them.

**Status:** MAP + fix, 2026-07-16. The safe half is DONE. **The risky half was DECIDED, ATTEMPTED,
and REVERTED** (§3): Pavel greenlit it, the attempt hit the stale-Prisma-client trap, and it was
backed out rather than forced. That is the answer, not a deferral. Origin: `PRINT_PRICING_SPEC_2026-07-15.md` flagged "two meanings of on-demand
share one word in a money path". A full trace found **three**, and the third is what makes a rename
dangerous.

---

## §1 The three (four) meanings

They are **distinct businesses that share one English phrase.** Do NOT merge them, and never assume a
value from one is comparable to another.

| # | Meaning | Carrier | Money |
|---|---|---|---|
| **A1** | **MAKE-TO-ORDER, a manufacturing CAPABILITY.** "We produce small / no-MOQ batches." | `FulfillmentMode.ON_DEMAND` (`schema.prisma:6785`) | a PRICING dimension: selects a different band set + MOQ |
| **A2** | **MAKE-TO-ORDER, a channel LISTING MODE.** "A consumer order on Shopify triggers a production order." | `ChannelListingMode.ON_DEMAND` (`:5736`) + `OnDemandEnablement` (`:5843`) | a per-listing GATE; the production order carries normal production money |
| **B** | **SHIP-FROM-STOCK. The opposite business.** "The partner picks/packs a parcel out of stock ALREADY MADE." | `StorageMode.ON_DEMAND` (`:9256`) + `PartnerService.onDemandEnabled` (`:1401`) | `pickFeeCents + packFeeCents`. **Nothing is produced.** |
| **A3** | MAKE-TO-ORDER, a TS-only order-type tag | `FulfillmentOrderType` (`orders/destination-options.ts`) | none (a destination gate) |

**A1 and A2 are both "make-to-order" in prose but are different AXES**, and this matters: A1 is a
manufacturer capability + pricing dimension, A2 is a per-listing gate. **Nothing checks A1 when
granting A2.** Collapsing them under one name would be a fresh bug, not a cleanup.

**Definitions, from the docs that own them:**
- A2, `CHANNEL_MANAGEMENT_SPEC.md:15-17`: *"ON-DEMAND: no stock. A consumer order on the channel
  triggers a production order to the pinned manufacturer... GATE: the manufacturer must have
  pre-confirmed they accept on-demand orders for THIS product with THIS branding."*
- B, `LOGISTICS_AND_FULFILLMENT.md:146`: *"ON_DEMAND: partner holds bulk/labeled stock; each
  end-channel order triggers a pick/pack/parcel ship by the partner. Requires `canShipParcel=true`."*
- A1, `builds/_V1_DECORATION_METHODS.md:11`: *"Direct printing on cans requires 5k+ MOQ and is
  bulk-only. Pressure-sensitive labels work at 100-unit MOQ and natively fit on-demand."*

---

## §2 DONE (2026-07-16): the actual collision is gone

**`packages/orders/src/destination-options.ts` contained TWO meanings, 84 lines apart:**
`ManufacturerStorageInput.onDemandEnabled` (**B**) at `:22`, and `FulfillmentOrderType`'s
make-to-order member (**A3**) at `:106`.

**And `onDemandEnabled` + `canShipParcel` were DEAD:** declared, passed in by two callers that fetched
them from the DB, and **read nowhere**. The HOLD gate reads only `offersStorage`, `storageClasses`,
`maxDwellDays`, `productShelfLifeDays`.

**That is the worst kind of latent hazard.** A dead field named `onDemandEnabled` sitting in a
destination gate *reads* as though HOLD eligibility depends on ship-on-demand capability. The next
person to "wire up the unused field" has a coin-flip chance of wiring the wrong meaning into a money
gate.

Fixed:
1. **Deleted** `onDemandEnabled` + `canShipParcel` from `ManufacturerStorageInput`. TypeScript's
   excess-property check then found all three call sites for us (`destination-options.test.ts:50`,
   `cart-actions.ts:1753`, `fulfillment-actions.ts:453`). The file no longer contains meaning B at all.
2. **Renamed** `FulfillmentOrderType`'s `'ON_DEMAND'` -> `'MADE_TO_ORDER'`. TS-only, never persisted,
   one production caller (which passes `'BULK'`), one test. Free: take the free ones.
3. **Documented the three meanings in the file header**, so the next reader does not have to
   rediscover this.

**The prisma `select`s stay.** They feed the REAL ship-on-demand read, which lives where it belongs:
`cart-actions.ts:1775` (`svc.onDemandEnabled && svc.canShipParcel` gating `StorageAgreement.mode`) and
`shipping/storage-offering-rules.ts` guard 4.

---

## §3 REVERTED, empirically: the renames are NOT worth it yet

**Pavel 2026-07-16: "let's do it if worth it" -> tried -> NOT worth it. Backed out.**

The field rename (`PartnerService.onDemandEnabled` -> `parcelPickPackEnabled` via `@map`) looked like
the safe one: every one of its ~20 call sites is TYPED (verified: no cast-guards on this field), and
`@map` keeps the DB column so `db:push` is a no-op. It was renamed across 11 files and then:

```
error TS2353: Object literal may only specify known properties, and 'parcelPickPackEnabled'
              does not exist in type 'PartnerServiceSelect<DefaultArgs>'
error TS2551: Property 'partner' does not exist ... Did you mean 'partnerId'?
```

**Those are not bugs in the rename. They are the STALE PRISMA CLIENT** (CLAUDE.md's three-layer
trap): the generated client does not learn a renamed field until `pnpm db:generate` runs. The
`partner` errors are cascade damage: once one `select` key is unknown, Prisma's type inference
collapses and unrelated properties light up too.

**Why that settles it.** Shipping the rename means handing over a tree that **does not compile until
someone runs a command**, on the field that gates `StorageAgreement.mode` (whether pick/pack fees
accrue), in a repo where a second agent shares the working tree. Cosmetic win, uncompilable money
path. No.

**THE TRIGGER, written down so this is not re-litigated:** do the renames in the same change as a
`db:push` + `db:generate` that is happening on these tables anyway. Then the client regenerates in the
same breath and the compiler can actually verify the work.

**Everything below is the still-valid PLAN for that moment.**

### The proposal (unchanged)

All three enums are **live Postgres types**. `FulfillmentMode` additionally has a real migration
(`20260605160000_decoration_offerings`) and its column sits inside a `@@unique`
(`ProductTemplatePricingTier`, `:7421`), so a value rename is an `ALTER TYPE ... RENAME VALUE`.

**Proposed (keeps A1/A2 distinct, does NOT merge them):**

| Carrier | Now | Proposed |
|---|---|---|
| `FulfillmentMode` | `ON_DEMAND` | `MADE_TO_ORDER` |
| `ChannelListingMode` | `ON_DEMAND` | `MADE_TO_ORDER` |
| `StorageMode` | `ON_DEMAND` | `PICK_PACK_PARCEL` |
| `PartnerService.onDemandEnabled` | | `parcelPickPackEnabled` (via `@map`, so `db push` is a no-op) |
| `OnDemandEnablement` | | `MadeToOrderEnablement` (via `@@map`) |

**DO NOT rename** (persisted, read by string key, would silently break historical rows):
- **`feeSnapshotJson` keys `pickFeeCents` / `packFeeCents`**: frozen at agreement time "for legal
  reproducibility", read by string key at `storage-panel-data.ts:64-65`.
- **Audit action strings** `ON_DEMAND_REQUESTED` / `ENABLED` / `DECLINED` / `SUSPENDED` and the
  entityType `'OnDemandEnablement'` (`packages/audit/src/types.ts:51`). Persisted in AuditLog rows.

**THE TRAP that makes this risky, and the reason to think twice:** the channel models are unmigrated,
so every access is **cast-guarded**: TypeScript is off by design at those sites:
```ts
// channels/orders/ingest.ts:151
const mode = ((link.channelProductLink as { mode?: string } | undefined)?.mode ?? 'ON_DEMAND') as 'ON_DEMAND' | 'BULK'
```
A `string` widened, then **re-narrowed by assertion**. And the prisma delegate is reached by string:
`d('onDemandEnablement')` (`ingest.ts:153`), plus 5 more `(prisma as unknown as {...}).onDemandEnablement`
sites. **A model rename produces NO TypeScript error at any of them.** Grep manually or don't do it.

Note also `ChannelProductLink.mode` and `StorageAgreement.mode` are **both literally named `mode`** and
both admit the string `'ON_DEMAND'`. Prisma's types keep them apart until someone casts. Nothing
crosses them today, but that is the shape that turns this hazard into a routing bug.

**Recommendation:** the renames are worth doing but are NOT urgent now that the dead field is gone and
the meanings are documented. The remaining risk is a human reading the wrong `ON_DEMAND`, which §1 and
the file header now mitigate. Do them when something else already forces a `db:push` on these tables.

---

## §4 Separate bugs found on the way (not naming issues)

**1. `ingest.ts:153` resolves the enablement gate WITHOUT the manufacturer.** VERIFIED, and it is worse
than "arbitrary pick": **it carries CONSENT across a re-pin.** `OnDemandEnablement` is documented as
"a manufacturer's standing agreement to accept on-demand production orders for ONE creator product
WITH THE APPROVED BRANDING" (`schema.prisma:5839`). Pin a product to manufacturer A, A approves
(ENABLED), later re-pin to B: this lookup still finds A's row, so **B's gate opens on A's consent** for
branding B never saw. That is a consent problem, not just a routing one.

**NOT FIXED, deliberately (2026-07-16).** `ChannelVariantLink.productId` is a SOFT FK with no relation
(`schema.prisma:5760`), so scoping the lookup needs a new batched query for each product's pinned
`productTemplate.manufacturerServiceId` (the pattern `publish/actions.ts:327` already uses on the
REQUEST side). That is a new query into a **cast-guarded** (13 sites in this file), currently-DARK
channel path, unverifiable without running the app. Same risk shape as the rename in §3, and this one
needs a re-pin to trigger at all. It DOES fail-closed (the existing `.catch(() => null)` yields status
'NONE' = gate shut), so a mistake here breaks the feature rather than moving money wrongly.
**Fix it when the channel path stops being dark** (it is gated on adapters + SP-API + `db:push`), and
do it in the same change as the §3 renames since both wait on the same `db:generate`.

Original finding:
```ts
?.findFirst?.({ where: { creatorUserId: user.id, productId: String(link.productId) }, select: { status: true } })
```
against `@@unique([creatorUserId, productId, manufacturerServiceId])` (`schema.prisma:5857`). If a
product ever has enablements from two manufacturers, `findFirst` picks arbitrarily, so an **ENABLED row
from manufacturer X can open the gate for manufacturer Y**. Not reachable while products are
single-manufacturer (owner-pinned), which is why it has not bitten. Fix = include
`manufacturerServiceId` in the where.

**2. `ProductDetailConfigurator.onDemandRows` is dead UI.** VERIFIED: it is declared (`:88`), threaded
to `PricingTierModal` (`:812`), and **no external caller ever passes it**, so `hasOnDemand` (`:343`) is
permanently false and the Bulk/On-demand price toggle never renders.

**LEFT IN PLACE, deliberately.** This is scaffolding for meaning A1 (a manufacturer's small-batch
price bands), which is a real unbuilt feature, not a mistake. Deleting it would just have to be
re-written. It is inert and it is now documented here. Wire it when A1 pricing reaches the PDP; the
prop chain is already correct.

**3. `docs/builds/on-demand-pricing-economics.md:137` references `Partner.onDemandMaxDailyCapacity`,
which does not exist.** The shipped equivalent is `OnDemandEnablement.capacityPerDay`.

**4. `docs/builds/ON_DEMAND_BUSINESS_MODEL.md` is referenced repeatedly and does not exist in the repo.**
