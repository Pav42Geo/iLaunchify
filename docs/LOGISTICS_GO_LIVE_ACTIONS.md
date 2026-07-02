# Logistics Go-Live — Pavel's Action List

**Created 2026-07-02** at logistics program closeout (L0–L4a built + gated).
Everything below is a HUMAN action — no code is waiting on code. Ordered by lead time:
start the top items this week; the bottom ones are day-before-launch.

---

## 1. Start THIS WEEK (longest lead times)

### 1.1 Amazon SP-API developer application ⏱ weeks-long approval
- Seller Central → Partner/Developer Console → register a developer profile + app.
- You'll answer a data-protection questionnaire (how tokens are stored, who accesses data).
  Our architecture answers: tokens by reference in a secret store (`ChannelConnection.accessTokenRef`),
  never raw in DB; roles needed: `fulfillmentInbound`, `listings`.
- When approved → put `AMZ_SPAPI_CLIENT_ID` / `AMZ_SPAPI_CLIENT_SECRET` in env → the creator
  "Connect Amazon" button lights up automatically → then we build the OAuth exchange + live
  inbound-plan confirmation (the admin "Confirm with Amazon" button is already waiting, disabled).

### 1.2 ShipBob master-agreement conversation ⏱ commercial negotiation
- Decision L2: platform-level agreement, creators as sub-clients billed through iLaunchify.
- Ask for: food-grade/lot+expiry handling confirmation, platform billing structure, API access
  (Developer API 2.0), and whether they'll discuss multi-tenant provisioning.
- No agreement = no blocker for launch: V1 runs on admin-onboarded warehouse partners (1.3).

### 1.3 Contract 2–5 regional fulfillment centers ⏱ contracts + data gathering
- Target the coverage you named: NJ, GA, TX, CA (+ Chicago-area given partner geography).
- For FOOD/pet/supplement storage they MUST be FDA-registered (hard filter in the selector).
- What the platform needs per FC at onboarding (admin → Partners, service type WAREHOUSE):
  storage classes, certifications (FDA_REGISTERED/GMP/SQF), weekly pallet capacity,
  **facility coordinates** (drives nearest-FC selection), rate card, receiving spec
  (appointment rules, pallet requirements, label placement).

## 2. Fast wins (days, not weeks)

### 2.1 EasyPost account → real labels + live checkout quotes
1. Create account at easypost.com → grab TEST key first, then production.
2. Env: `EASYPOST_API_KEY`, `EASYPOST_WEBHOOK_SECRET`.
3. Register the webhook URL in the EasyPost dashboard: `https://<partner-app-domain>/api/webhooks/easypost`.
4. Verify on admin → Developer & API: EasyPost row green, press **Test connection**,
   and after the first tracked shipment the row shows "webhook: Xh ago" (if it says
   "never received", the webhook URL isn't registered — that's the exact failure the pill catches).
5. Flip `carrier:easypost` in admin → Logistics → Gates.

### 2.2 Seed + env hygiene on the deploy target
- `pnpm db:push && pnpm db:generate` (if not already run against prod DB) → `pnpm --filter @ilaunchify/db seed:logistics`
  (idempotent: 12 gates all OFF + carrier rule matrix).

## 3. Legal / contract updates (run in parallel with 1.x)

- **Partner contract additions** (spec §1.1 table is the source): FSMA §1.908(a)(3) duty-assignment
  clause (temp control), UCC 7-301 indemnity (partner warrants weights/dims/contents),
  FOB Origin, re-bill terms for carrier adjustments, storage-program terms (L9 bands + grace).
- **Creator ToS:** FOB Origin risk transfer + the insurance offer language.
- **Insurance:** work `docs/SHIPPING_INSURANCE_VERIFICATION.md` top to bottom — including the
  mandatory end-to-end TEST CLAIM — then flip the `insurance` gate. Don't shortcut this one.

## 4. Ops setup inside admin (no external party needed)

1. **Flip `destination:HOLD_AT_MANUFACTURER` first** — zero external dependencies; it's the
   supplement on-demand practice and your most differentiated destination.
2. Have supplement/coffee/cosmetics manufacturers fill **partner → Settings → Storage & fulfillment**
   (rates are validated against your L9 bands automatically).
3. Partners without carrier accounts: point them to **Settings → Carrier & shipping → Enable
   iLaunchify shipping** (creates their platform-paid sub-account) once 2.1 is done.
4. Tune OrderSettings logistics knobs if desired (FC weights, insurance threshold, margin bps,
   105-day channel shelf floor) — defaults are the researched values.

## 5. Dry run before first real order (half a day)

1. Dev environment: flip HOLD gate → place a supplement order → confirm StorageAgreement appears
   → release stock → partner ships release → agreement closes at zero.
2. FC path: onboard a test WAREHOUSE partner (with coordinates) → order to "Fulfillment center"
   → verify the suggestion + rationale → partner /inbound confirm → order DELIVERED.
3. Doc gates: try to mark a food dispatch shipped WITHOUT a COA — it must refuse; upload → passes.
4. EasyPost TEST key: buy a label from the partner ship panel; check tracking webhook moves the leg.
5. Gate copy: place a gummy (meltable) order in July aimed at FBA — the channel card must explain
   the Oct 16–Apr 14 window and steer to an FC. That copy is customer-facing; read it as a creator would.

## 6. Later triggers (external events → small code phases)

| Event | Then |
|---|---|
| Amazon approves the dev app | Build SP-API OAuth + live plan confirmation (Phase L3b) |
| ShipBob agreement signed | Build FulfillmentConnector (Phase L4) + flip `connector:shipbob` |
| First TikTok/Walmart creator demand | WFS/FBT adapters (Phase L4) — gates + plan model already built |
| Cold-chain demand (frozen/chilled) | Lineage-class FC partner + Loadsmart rail + insurance rider → flip `storage_class:*` (Phase L5) |
| Code has Studio bandwidth | Hand over `docs/HANDOFF-TO-CODE-fnsku-in-dieline.md` |
| Creators selling pet food | They must register products in every ship-to STATE (AAFCO) — the routing gate enforces `petFoodRegisteredStates` |
