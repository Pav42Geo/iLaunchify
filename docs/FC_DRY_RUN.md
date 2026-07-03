# FC end-to-end dry run — walkthrough + checklist

Go-live gate from `docs/PARTNER_ROLE_ACCOUNTS.md` §10. Runs the complete Fulfillment Center loop on seeded data: **inbound → receive (lot gate) → inventory → creator release → pick/ship → ledger → cron sweeps → admin exception**.

Pre-flight (once): `pnpm db:push && pnpm db:generate && rm -rf apps/*/.next`, restart `pnpm dev`, `pnpm typecheck` green. Then:

```bash
pnpm db:seed                                # if not already seeded (creator, Acme mfg, catalog)
pnpm --filter @ilaunchify/db seed:fc-dryrun # FC partner + inbound order
```

Logins (dev login): FC `fc-dryrun@ilaunchify.dev` · creator `sample-creator@ilaunchify.dev` · admin `georgiev.pavel@gmail.com`. Partner app :3002, creator :3000 (⚠ legacy FOD container gotcha), admin :3003.

## Walkthrough

**1. FC role skin** — log in as the FC on :3002.
- [ ] Dashboard eyebrow reads "Fulfillment Center · Home" (not Manufacturing)
- [ ] Nav shows Inbound / Inventory / Outbound / Storage billing; NO Products/Packaging/Accessories
- [ ] Dashboard queue shows "Confirm inbound receipts · 1 shipment"

**2. Onboarding surfaces (spot check)** — `/settings/fulfillment`: save a receiving spec + add a blackout window (then remove it — leaving it on blocks FC selection for new checkouts). `/settings/notifications`: FC events + quiet hours visible.

**3. Inbound** — `/inbound`: the seeded order sits in **Expected** (status Received? → re-run seed; the leg is DELIVERED but receipt unconfirmed).
- [ ] Open it → Confirm receipt. **D2 gate:** submit stays disabled until lot + expiry are filled on the lot-tracked line; try leaving lot empty
- [ ] Enter lot `LOT-DR-001`, expiry ~18 months out, received qty **580** (vs 600 expected — deliberate short), tick checklist, note required → confirm
- [ ] Toast: "Receipt confirmed — discrepancy filed"

**4. Inventory** — `/inventory`:
- [ ] Agreement row appears: 580 units, 2 pallets, ACTIVE, storage-accrued $ (PALLET_MONTH) — *this row existing at all is the seam fix: agreements open at receipt for FC-held stock*
- [ ] FEFO panel absent (lot expires >90d) — sanity, not failure

**5. Creator release** — as creator on :3000, open the FC order (`demo-order-fc-inbound`):
- [ ] Stored-stock panel renders for a WAREHOUSE_PARTNER order; request a release of **100** units (needs a saved address)

**6. Outbound** — back as FC, `/outbound`:
- [ ] Release in Queue with **FEFO badge: lot LOT-DR-001**
- [ ] Start picking → Mark shipped (carrier + tracking required) → balance drops to 480 on `/inventory`; agreement back to ACTIVE
- [ ] Mark delivered (History tab)

**7. Ledger** — `/billing`: agreement row shows rate $22/pallet/mo, grace end, 1 pick fee accrued, platform fee + net split.

**8. Admin exception** — as admin on :3003, Logistics → Receiving exceptions:
- [ ] The 580-vs-600 short is OPEN (oldest first); open it → lines show −20, receipt record shows the immutable lot capture
- [ ] Resolve requires a note; resolving notifies the FC (check FC bell)

**9. Cron sweeps** — `curl -X POST localhost:3003/api/cron/partner-ops -H "Authorization: Bearer $CRON_SECRET"`:
- [ ] Returns ok + counters; run twice — second run sends nothing (idempotency)
- [ ] Optional: upload a COI on the FC with expiry ≈ tomorrow, re-run → DOC_EXPIRING_SOON; set it to yesterday, re-run → DOC_EXPIRED + WAREHOUSE service PAUSED (then reinstate via admin partner detail)

**10. Audit trail** — admin `/audit`: INBOUND_RECEIPT_CONFIRMED, INBOUND_RECEIPT_DISCREPANCY, STORAGE_AGREEMENT_OPENED_AT_RECEIPT, STORAGE_RELEASE_* rows all present with payloads.

## Known V1 caveats (expected, not failures)

FC fee snapshot is taken at **receipt** (not checkout) — an FC repricing while goods are in transit changes the agreement rate; acceptable V1, revisit with the rate-card model. CUFT_MONTH accrual shows "—". Release tracking is manual entry (EasyPost label purchase for FC lanes = L2 gate). Pallet balance doesn't decrement per release (L1.2b). Mode is STOCK_RELEASE only until channel rails.

Anything that fails → note the step number and hand it back.
