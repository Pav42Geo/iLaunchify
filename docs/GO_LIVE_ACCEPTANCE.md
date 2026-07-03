# Go-live acceptance — full partner-platform walkthrough

The one test that gates onboarding real partners. Supersedes and includes `docs/FC_DRY_RUN.md`
(same seed, same FC loop, plus everything built since: proof loop, teams, ramp, SLA monitor,
scorecard, digest). ~45 minutes. Check boxes as you go; anything failing → note the section
number and hand it back.

**Pre-flight (once):** everything committed + pushed · `pnpm db:push && pnpm db:generate &&
rm -rf apps/*/.next` · restart `pnpm dev` · `pnpm type-check && pnpm lint` green ·
`CRON_SECRET` set in `.env.local`.

```bash
pnpm db:seed                                # if not already seeded
pnpm --filter @ilaunchify/db seed:fc-dryrun # FC partner + inbound order + proof-loop print order
```

Logins (dev login): FC `fc-dryrun@ilaunchify.dev` · manufacturer `sample-manufacturer@ilaunchify.dev`
· creator `sample-creator@ilaunchify.dev` · admin `georgiev.pavel@gmail.com`.
Apps: partner :3002 · creator :3000 (⚠ legacy FOD container gotcha) · admin :3003.

---

## A. Fulfillment Center loop (= FC_DRY_RUN steps 1–10)

- [ ] **A1 Role skin** — FC login: eyebrow "Fulfillment Center · Home"; nav = Dashboard, Orders,
  Inbound, Inventory, Outbound, Services, Certifications, Payments, Storage billing, Settings;
  NO Products/Packaging/Accessories; dashboard queue shows "Confirm inbound receipts · 1"
- [ ] **A2 Receive w/ lot gate** — `/inbound` → open the expected order → submit disabled until
  lot + expiry filled; enter lot `LOT-DR-001`, expiry ~18mo, qty **580** of 600 (deliberate
  short), checklist + note → "Receipt confirmed — discrepancy filed"
- [ ] **A3 Inventory** — agreement row exists (580 units / 2 pallets / ACTIVE / accrual $) —
  the receipt-opens-agreement seam
- [ ] **A4 Creator release** — as creator, open `demo-order-fc-inbound` → stored-stock panel →
  release **100** units (needs a saved address)
- [ ] **A5 Outbound** — as FC: release in Queue with **FEFO badge LOT-DR-001** → Start picking →
  Mark shipped (carrier+tracking) → inventory drops to 480 → Mark delivered
- [ ] **A6 Ledger** — `/billing`: $22/pallet/mo, grace end, 1 pick fee, platform/net split
- [ ] **A7 Admin exception** — admin → Logistics → Receiving exceptions: the −20 short is OPEN;
  detail shows lines + immutable lot capture; resolve requires a note; FC gets the bell
- [ ] **A8 Facility settings** — FC `/settings/fulfillment`: save receiving spec; add + remove a
  blackout window (a live blackout hard-excludes this FC from new checkout selection)

## B. Print proof loop (D3)

- [ ] **B1** — as the manufacturer partner (Acme runs the label service), open the ACCEPTED print
  job on `demo-order-proof-loop`: eyebrow "Print production · Print job"; Print contract card
  echoes the output spec; Proof panel shows **"Required before ready"** (first order for this
  creator×printer pair)
- [ ] **B2 Gate** — try Mark producing → Mark ready WITHOUT a proof → blocked with the
  first-order explanation
- [ ] **B3 Round trip** — upload a proof (any PDF/PNG) → as creator, order page shows the
  approval panel → **Reject with a note** → printer sees v1 rejected + note, uploads v2 →
  creator **Approves** → printer can now mark READY
- [ ] **B4 Notifications** — creator got CREATOR_PROOF_AWAITING (bell + email if configured);
  printer got PROOF_REJECTED then PROOF_APPROVED

## C. Team, roles & scoping (P3)

- [ ] **C1 Invite** — as FC (org admin): `/settings/team` → invite a second address you control,
  NO admin, WAREHOUSE service roles ticked → email arrives with the accept link
- [ ] **C2 Accept** — logged out, open the link → login with the invited address → accept →
  lands on dashboard
- [ ] **C3 Scoped view** — as the teammate: nav = Dashboard, Orders, Inbound, Inventory,
  Outbound, Settings ONLY (no Payments/Billing/Certifications); `/billing` and
  `/settings/fulfillment` bounce; `/outbound` works (start a pick to prove actions pass)
- [ ] **C4 Roster** — as FC admin: team page lists both (founder badge on you), teammate shows
  service roles + last-active; remove + re-invite works; revoke a pending invite works
- [ ] **C5 Routed notifications** — trigger a partner-ops sweep (D1) — the teammate ALSO gets
  the FC operational events, not just the founder

## D. Cron engines (idempotency = run each twice; second run sends nothing)

```bash
curl -X POST localhost:3003/api/cron/partner-ops -H "Authorization: Bearer $CRON_SECRET"
curl -X POST localhost:3003/api/cron/notification-digest -H "Authorization: Bearer $CRON_SECRET"
```

- [ ] **D1 partner-ops** — returns ok + counters; second run all-zero
- [ ] **D2 Doc expiry chain** — upload a COI on the FC with expiry ~45 days out → sweep →
  DOC_EXPIRING_SOON is **digest-tagged** (no immediate email); run notification-digest →
  ONE summary email; set the COI expiry to yesterday → sweep → DOC_EXPIRED + WAREHOUSE
  service PAUSED (org admins notified) → reinstate via admin partner detail service toggle
- [ ] **D3 SLA monitor** — admin → Logistics → SLA monitor: the seeded/created at-risk rows
  appear in the right buckets with sane ages

## E. Admin oversight

- [ ] **E1 Ramp queue** — Inbox → Partner ramp: FC's delivered dispatch (A5's parent) appears
  with 0/3 → confirm → 1/3
- [ ] **E2 Scorecard** — partner detail (Dryrun FC): scorecard shows completed count, accept
  rate, the A2 discrepancy counted; time-to-first-order populated in quick stats
- [ ] **E3 Verification doc track** — partner verification page (any partner): DOCUMENTS
  section shows the role track with ✓/missing/expired states
- [ ] **E4 Audit trail** — `/audit`: INBOUND_RECEIPT_*, STORAGE_AGREEMENT_OPENED_AT_RECEIPT,
  STORAGE_RELEASE_*, PROOF_*, PARTNER_TEAMMATE_*, PARTNER_RAMP_CONFIRMED all present

## Known V1 caveats (expected, NOT failures)

FC fee snapshot at receipt (not checkout) · CUFT accrual shows "—" · release tracking manual
until EasyPost FC lanes · pallet balance static per release · ramp = review ritual (no hard
routing block) · PREPRESS/PRODUCTION roles grant identical operational access until Code's
print-workflow gates · routing.ts DISPATCH_RECEIVED still founder-routed until Code's swap ·
invitee auto-create depends on the Auth.js email provider (C2 verifies this).

**All boxes ticked = partner platform is go-live-ready per PARTNER_ROLE_ACCOUNTS §10.**
Remaining launch gates are outside this doc: Stripe test-mode verification
(STRIPE_TESTMODE_VERIFICATION.md) and the LogisticsSetting lane review.
