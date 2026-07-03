# HANDOFF → Code: Partner Role Accounts follow-ups (2026-07-02)

From Cowork. Context: docs/PARTNER_ROLE_ACCOUNTS.md (LOCKED, D0–D6 + build log) — P0–P2 shipped by Cowork today. Schema is pushed + generated; typecheck green after the CREATOR_STOCK_ALERT template fix. These four items are yours; everything else in that doc is done or explicitly deferred to P3.

## 1. Finish your C6.3 templates-handoff TODO (small)
`apps/creator/src/app/(dashboard)/channels/inventory/alerts.ts` writes the `CREATOR_STOCK_ALERT` Notification row directly (line ~150) with a TODO to migrate. The template side now exists: `TemplateData['CREATOR_STOCK_ALERT']` = `{ title?, body?, productName?, alertState? }` + a renderTemplate case with your `/channels/inventory` link (packages/notifications/src/templates.ts). Swap the direct `notification.create` for `dispatchNotification({ userId, event: 'CREATOR_STOCK_ALERT', data: { title: copy.title, body: copy.body }, audience: 'creator' })` — you gain the preference/quiet-hours/email machinery for free. Drop the `.catch(() => {})` enum guard; the value is live in the DB.

## 2. Reprint-dispatch action (P3, order machinery — your zone)
docs/PARTNER_ROLE_ACCOUNTS.md §3.3.C: admin resolves an OrderDispute on a LABEL dispatch with outcome "reprint" → create a NEW LABEL OrderDispatch on the same order (same manifest version, costCents 0 or admin-entered), notify printer + creator. V1 defect claims already ride the existing dispute flow — this is just the resolution action. Suggested seam: a `createReprintDispatch` helper in `packages/orders` + a button on the admin dispute resolution surface.

**Agreed 2026-07-02 (Code ↔ Cowork):**
- Linkage = `DISPATCH_REPRINT_CREATED` audit row (audit-first pattern), NOT a column. A first-class `reprintOfDispatchId` self-relation lands with P3 partner scorecards (defect-rate counting needs it queryable) — Cowork adds it there, batched with the next schema push. Put reprintOf/disputeId in the audit payload so the backfill is mechanical.
- Creator notice = existing `CREATOR_ORDER_DISPUTE_RESOLVED` with `outcome: 'reprint'` in data. Cowork extended the template (2026-07-02): TemplateData accepts `outcome?: 'reprint'` and renders reprint-specific copy ("Reprint on the way…") — pass the field and the copy is handled; no new enum value, no schema push.

## 3. fc-selector: blackout test case (tiny)
I added `FcCandidate.blackedOut?: boolean` as a HARD filter in `packages/orders/src/fc-selector.ts` (reason: "facility blackout window…"), hydrated from `PartnerBlackoutDate` at both checkout call sites. `fc-selector.test.ts` is your pure suite — add a case: blacked-out nearest candidate loses to a farther clean one, and `blackedOut: undefined` behaves as false.

## 4. Blackout enforcement in findRouting — BLOCKED, do not start
Printer capacity pause (§3.3.D) should reroute commodity print legs away from blacked-out printers. findRouting is frozen until D1–D4 (ROUTING_BINDING_MODEL) are locked — noting it here so it lands with that work, not before. Data is ready: `PartnerBlackoutDate` rows exist for all service types.

## File ownership (single-writer)
Cowork owns (uncommitted-risk zone until Pavel pushes): `apps/partner/src/**` (role-skins, inbound/inventory/outbound/billing, orders/[dispatchId]/* incl. proof/lot files), `apps/admin/src/{lib/partner-ops-worker.ts, app/(dashboard)/logistics/receiving-exceptions/**}`, `packages/notifications/src/templates.ts`, `packages/db/src/partner-doc-tracks.ts`, schema partner-role sections. Yours: `channels/inventory/*`, `packages/orders/src/fc-selector*` (after item 3 you own it again), anything under item 2. Announce before crossing.
