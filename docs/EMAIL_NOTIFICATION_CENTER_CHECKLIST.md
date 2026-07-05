# Build checklist — Notification/Email Center + Partner Order Packets

Living checklist for two adjacent initiatives. Mark `[x]` as items land. Plans:
- `docs/PARTNER_ORDER_PACKETS.md` — product passport + per-role need-to-know packets.
- `docs/EMAIL_NOTIFICATION_CENTER.md` — notification control plane, group opt-out, header/body/footer,
  job-progress capture, marketing-email boundary.

Owner legend: **[CW]** Cowork (pure/new files, presentational) · **[CODE]** Code (schema/hot files/wiring)
· **[PAVEL]** human-run (migrations, git, external accounts).

---

## A. Partner Order Packets (mostly built)

**Built (Cowork):**
- [x] Pure `scopeManifestForRole` engine + types + tests — `packages/orders/src/partner-packet.ts` (+ test)
- [x] `ProductPassportView` shared panel — `packages/ui/src/components/ProductPassportView.tsx`
- [x] `RolePacketView` per-role work-packet panel — `packages/ui/src/components/RolePacketView.tsx`
- [ ] **[PAVEL]** commit + push the three files above (see plan doc for the git command)

**Remaining (Code — hot files):**
- [ ] **[CODE]** Wire `scopeManifestForDispatchType` into `manifest.ts` → each dispatch's stored manifest is its packet (G1/G3)
- [ ] **[CODE]** Supply `isFinalShipper` from the routing graph
- [ ] **[CODE]** Render `<RolePacketView packet={packet} />` in partner (and admin) manifest view
- [ ] **[CODE]** Raw-JSON download route returns the packet, not the full manifest
- [ ] **[CODE]** FC/warehouse leg + `INBOUND_ASSIGNED` notification (G2)
- [ ] **[CODE]** Typed `substrate`/`packaging`/`finish` columns on Order (replace internalNotes regex parse) (G4)

**Unrelated carryover (blocks cast-guard cleanup):**
- [ ] **[PAVEL]** `db:push` → `db:generate` → `rm -rf apps/*/.next` for `Product.selectedFlavorPresetIds`
- [ ] **[CW]** cast-guard cleanup in Cowork-owned files (`checkout/production-actions.ts`, seeds) per `docs/POST_PUSH_CASTGUARD_CLEANUP.md`
- [ ] **[CODE]** cast-guard cleanup in `canvas/page.tsx` (Code owns that file now)

---

## B. Notification/Email Center — Phase 1 (Cowork, pure — buildable now)

All in `@ilaunchify/notifications`, pure + unit-tested, collision-free:
- [ ] **[CW]** `resolveNotificationContent(event, payload, { templateOverride?, branding? }) → { subject, html, text }` — composes global **header + per-event body + global footer**, override-or-code-fallback, token substitution
- [ ] **[CW]** Token substitution + **token-palette extractor** (available `{{vars}}` per event)
- [ ] **[CW]** Event → **category** lookup + category config + `isCategoryOptOutable` / group-preference resolver
- [ ] **[CW]** Signed **unsubscribe token** build/verify (HMAC; secret passed in, never read/logged) + `List-Unsubscribe` header builder
- [ ] **[CW]** TS types for new models (branding / template / category / delivery)
- [ ] **[CW]** Tests for all of the above

## C. Notification/Email Center — Phase 2 (Code — schema + wiring)

- [ ] **[CODE/PAVEL]** Additive Prisma models: `NotificationBranding` (header/footer/unsubscribe/preferenceCenterUrl), `NotificationTemplate` (body-only override), `NotificationCategory`, `NotificationTemplateVersion`, `EmailDelivery`
- [ ] **[CODE]** Re-key `NotificationPreference` to **(userId, category, channel)**
- [ ] **[CODE]** Wire `dispatchNotification` → resolver + group-preference gate (mandatory categories bypass)
- [ ] **[CODE]** `renderEmailHtml` reads `NotificationBranding` instead of hardcoded colors
- [ ] **[PAVEL]** migration run (`db:push` → `db:generate` → `.next` clear)

## D. Notification/Email Center — Phase 3 (Code — admin v2 surfaces)

- [ ] **[CODE]** Notifications → **Templates** (list 48 events, edit drawer w/ token palette, preview, test-send, publish/rollback, enable/disable)
- [ ] **[CODE]** Notifications → **Branding** (logo, accent, ink, header, footer, from-name, reply-to; preview)
- [ ] **[CODE]** Notifications → **Deliverability** (per-event sent/delivered/bounced/complained/opened; suppression list)
- [ ] **[CODE]** Notifications → **Log** (recipient audit: who/what/when/channel/status)
- [ ] **[CODE]** User-side **group × channel preference matrix** (replaces 8-event list; all categories)
- [ ] **[CW]** (optional) presentational template-preview card + preference-matrix component

## E. Notification/Email Center — Phase 4 (Code — deliverability + unsubscribe routes)

- [ ] **[CODE]** Resend inbound webhook → `EmailDelivery` rows + bounce/complaint **suppression**
- [ ] **[CODE]** One-click **unsubscribe route** (verifies token → sets group preference off)
- [ ] **[CODE]** Emit `List-Unsubscribe` + `List-Unsubscribe-Post` headers on marketing-category sends

## F. Job-progress capture (Code + Cowork — closes the daily-flow gap)

- [ ] **[CODE/PAVEL]** `DispatchProgressUpdate` model (kind NOTE/ETA/PHOTO/MILESTONE, body, etaAt, photoAssetId, milestone, author, ts)
- [ ] **[CODE]** `OrderDispatch.currentEtaAt` (partner-revisable) + `CREATOR_DISPATCH_PROGRESS` event
- [ ] **[CODE]** Partner progress-submit action + UI on the dispatch detail
- [ ] **[CW]** Pure helper: build creator order timeline from state timestamps + progress updates
- [ ] **[CW]** Presentational creator **order timeline** component
- [ ] **[CODE]** Wire timeline into the creator order view

## G. Marketing email (external — Pavel decision + setup)

- [ ] **[PAVEL]** Pick ESP: start Resend Broadcasts / Loops → graduate to Customer.io
- [ ] **[PAVEL]** Separate marketing subdomain (e.g. `news.ilaunchify.com`), warm reputation
- [ ] **[CODE]** Add **"Marketing & product updates"** category (opt-outable) + bidirectional consent sync to the ESP
- [ ] Keep transactional (this Center) and marketing streams fully separate

---

### Suggested build order for the new session
1. B (Cowork pure engine) — no dependencies, lands immediately.
2. C (schema + wiring) — needs Pavel migration.
3. D + E (admin surfaces + webhooks).
4. F (job-progress) in parallel — independent of the template work.
5. A remaining (Code) — partner-packets wiring, whenever convenient.
