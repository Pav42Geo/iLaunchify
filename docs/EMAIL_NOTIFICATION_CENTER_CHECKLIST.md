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
- [x] ~~[PAVEL]~~ commit + push the three files above — views were already tracked; the two orders
      files turned out never-committed (origin unbuildable) and Code repaired that in `65e80803`

**Remaining (Code — hot files):** ✅ **ALL DONE (Code, 2026-07-05)**
- [x] **[CODE]** `scopeManifestForDispatchType` wired at the persist site (`routing.ts#createDispatches`) —
      each dispatch's stored `finishManifestJson` IS its packet (G1/G3) — `891c8c0e`
- [x] **[CODE]** `isFinalShipper` from the routing graph (co-packer when assembly exists, else the
      manufacturer; printers never; warehouses always via the engine) — `891c8c0e`
- [x] **[CODE]** `<RolePacketView packet={…}/>` rendered in partner + admin manifest views
      (legacy full-manifest rows fall back to `ProductionManifestView`) — `891c8c0e`
- [x] **[CODE]** Raw-JSON download returns the packet (route serves `finishManifestJson`, which now
      holds the packet — no route change needed) — `891c8c0e`
- [x] **[CODE]** `INBOUND_ASSIGNED` fired to the FC service at ship time (role-routed fan-out;
      PRODUCT/COPACKING legs of WAREHOUSE_PARTNER orders) — `e11c8a44` + `866a8914`
- [x] **[CODE]** Typed substrate/packaging/finish transport (G4) — reads the order-time
      `configurationSnapshot.options` (typed, versioned) with the internalNotes regex as legacy
      fallback; no new Order columns needed — `491a9353`

**Unrelated carryover (blocks cast-guard cleanup):**
- [x] **[PAVEL]** `db:push` → `db:generate` → `rm -rf apps/*/.next` for `Product.selectedFlavorPresetIds` (landed 2026-07-05)
- [ ] **[CW]** cast-guard cleanup in Cowork-owned files (`checkout/production-actions.ts`, seeds) per `docs/POST_PUSH_CASTGUARD_CLEANUP.md`
- [x] **[CODE]** cast-guard cleanup in `canvas/page.tsx` — named guards (`selectedFlavorPresetIds`,
      `loadStudioFinishes`) in `cb58429b`; remaining mockup/packagingType guards + `launch-actions.ts` done 2026-07-05

---

## B. Notification/Email Center — Phase 1 (Cowork, pure — buildable now)

All in `@ilaunchify/notifications`, pure + unit-tested, collision-free — **built 2026-07-05**:
- [x] **[CW]** `resolveNotificationContent(event, payload, { templateOverride?, branding? }) → { subject, html, text }` — composes global **header + per-event body + global footer**, override-or-code-fallback, token substitution — `src/resolve-content.ts` (+ `renderEmailShell` for admin preview, markdown-lite, DRAFT-preview mode, mandatory-category unsubscribe suppression)
- [x] **[CW]** Token substitution + **token-palette extractor** (available `{{vars}}` per event) — `src/template-tokens.ts` (palette type-checked against `TemplateData` payload keys; `unknownTokens` for editor validation)
- [x] **[CW]** Event → **category** lookup + category config + `isCategoryOptOutable` / group-preference resolver — `src/categories.ts` (total `Record<NotificationEvent, slug>`, 11 categories incl. `marketing` for G; `shouldDeliver`, `effectiveCategoryMatrix`)
- [x] **[CW]** Signed **unsubscribe token** build/verify (HMAC; secret passed in, never read/logged) + `List-Unsubscribe` header builder — `src/unsubscribe.ts` (v1 HMAC-SHA256, constant-time verify, 90-day max age, rejects mandatory categories; `LIST_UNSUBSCRIBE_POST`)
- [x] **[CW]** TS types for new models (branding / template / category / delivery) — `src/center-types.ts`
- [x] **[CW]** Tests for all of the above — `src/notification-center.selftest.ts` (tsx/node selftest, package convention; passing) + package `tsc --noEmit` clean
- [ ] **[PAVEL]** commit + push the section-B files (5 new files in `packages/notifications/src/` + additive edits to `index.ts` and `templates.ts` — `TemplateData` export)

## C. Notification/Email Center — Phase 2 (schema + wiring) — **built by Cowork 2026-07-05** (Pavel decision: CW builds all phases this session)

- [x] **[CW]** Additive Prisma models: `NotificationBranding` (singleton, header/footer/unsubscribe/preferenceCenterUrl), `NotificationTemplate` (body-only override, DRAFT/PUBLISHED), `NotificationCategory` (display-copy mirror; code registry stays source of truth), `NotificationTemplateVersion` (publish snapshots), `EmailDelivery` (+ enums `NotificationTemplateStatus`, `NotificationCtaMode`, `EmailDeliveryStatus`) — end of the notifications block in `schema.prisma`
- [x] **[CW]** Re-key `NotificationPreference` to **(userId, category, channel)** — additive: `event` now nullable (legacy rows kept, dispatcher ignores them), `category String?` added, second `@@unique([userId, category, channel])`
- [x] **[CW]** Wire `dispatchNotification` → resolver + group-preference gate (mandatory categories bypass) — also: branded from-name/reply-to, signed unsubscribe link + `List-Unsubscribe`/`List-Unsubscribe-Post` headers on opt-outable sends, `EmailDelivery` SENT mirror. ALL new-model access is cast-guarded in ONE file: `packages/notifications/src/center-db.ts` (post-generate cleanup lives there only)
- [x] **[CW]** `renderEmailHtml` reads branding (optional `EmailShellBranding` param — brandName/accent/ink/footer; defaults = locked constants, one-off sends unchanged)
- [x] **[CW]** `applyUnsubscribeToken` route engine (`unsubscribe-apply.ts`) + category-keyed preference API (`getEffectiveCategoryPreferences`, `setCategoryPreferenceChecked`) + `seed-notification-categories.ts` wired into `seed.ts` (mirror of the code registry — keep in sync)
- [x] **[PAVEL]** migration run 2026-07-05 (`db:push` → `db:generate` → `.next` clear → seed). Envs: `NOTIFICATION_UNSUBSCRIBE_SECRET`, `RESEND_WEBHOOK_SECRET`
- [x] **[CW]** post-generate de-cast done 2026-07-05: `center-db.ts`, `seed-notification-categories.ts`, enum-key casts in `categories.ts`/`template-tokens.ts`, F files (`progress-actions.ts`, partner/creator order pages), and the flavor-preset guard in `checkout/production-actions.ts`. Still Code's: `canvas/page.tsx` + `launch-actions.ts` guards (hot zone / Code-owned per POST_PUSH_CASTGUARD_CLEANUP.md)

## D. Notification/Email Center — Phase 3 (Code — admin v2 surfaces)

**Built by Cowork 2026-07-05** (admin routes under `/notifications-center/*`, sidebar: Settings → Notifications; Pavel decision — this is the Communications group returning):
- [x] **[CW]** Notifications → **Templates** — list of all events (KPI strip, category/source chips) + per-event editor: token palette (click-to-insert, typo-validated via `unknownTokens`), server-action live preview (send path = preview path), publish w/ version snapshots, rollback, revert-to-code, per-event email kill-switch, test-send to self. `templates/page.tsx`, `templates/[event]/`
- [x] **[CW]** Notifications → **Branding** — singleton editor (logo, brand name, accent/ink pickers, footer, unsubscribe/preferences copy + URL, from-name, reply-to) + live shell preview. `branding/`
- [x] **[CW]** Notifications → **Deliverability** — event × status pivot (7/30/90d windows) from `EmailDelivery` + the active 90-day bounce/complaint suppression list. `deliverability/page.tsx`
- [x] **[CW]** Notifications → **Log** — recipient audit (who/what/when/channel; email status distinguishes sent / digest-queued / quiet-hours-skipped / suppressed / failed), email filter, 50/page. `log/page.tsx`
- [x] **[CW]** User-side **group × channel preference matrix** in ALL THREE apps (creator/partner/admin `settings/notifications`) — legacy per-event `PreferencesForm` deleted, actions re-keyed to `setCategoryPreferenceChecked` + audit rows; quiet hours preserved; shared `getPreferenceMatrixView` server helper. Admin personal page links to the Center.
- [x] **[CW]** New audit entity types: `NotificationTemplate` / `NotificationBranding` / `NotificationPreference`; `samplePayloadForEvent` helper for preview/test-send
- [x] **[CW]** (optional) presentational template-preview card + preference-matrix component — built 2026-07-05: `packages/ui/src/components/EmailTemplatePreviewCard.tsx` (subject + sandboxed-iframe email + plaintext + in-app tabs, `TokenPaletteRow` click-to-insert chips) and `NotificationPreferenceMatrix.tsx` (category × channel toggle grid, locked mandatory rows, channel-unavailable cells). Props-only; hosts feed them from `resolveNotificationContent` (preview:true) / `effectiveCategoryMatrix` + `tokenPaletteForEvent`.

## E. Notification/Email Center — Phase 4 (Code — deliverability + unsubscribe routes)

**Built by Cowork 2026-07-05:**
- [x] **[CW]** Resend inbound webhook → `EmailDelivery` rows + bounce/complaint **suppression** — engine in `packages/notifications/src/resend-webhook.ts` (Svix HMAC verify, no svix dep; correlates to the SENT row via provider message id), route at `apps/creator/src/app/api/webhooks/resend/route.ts` (public `/api/webhooks` prefix). Suppression: dispatcher checks `isEmailSuppressed` (bounce/complaint within 90d) before every send. Env: `RESEND_WEBHOOK_SECRET`
- [x] **[CW]** One-click **unsubscribe route** — human landing page `apps/marketing/src/app/unsubscribe/page.tsx` (applies token, category-labeled confirmation, error copy per reason) + RFC 8058 POST endpoint `apps/marketing/src/app/unsubscribe/one-click/route.ts`. Marketing gained the `@ilaunchify/notifications` workspace dep (**[PAVEL]** `pnpm install` to persist the symlink)
- [x] **[CW]** `List-Unsubscribe` + `List-Unsubscribe-Post` headers — emitted by the dispatcher on EVERY opt-outable-category send (not just marketing; Gmail/Yahoo look at volume, not intent). Header URL = one-click POST endpoint; footer link = landing page

## F. Job-progress capture (Code + Cowork — closes the daily-flow gap)

**Built by Cowork 2026-07-05 (schema lands with the same push as C):**
- [x] **[CW]** `DispatchProgressUpdate` model (kind NOTE/ETA/PHOTO/MILESTONE, body, etaAt, photoAssetId, milestone, author, ts) + `DispatchProgressKind` enum — schema.prisma after OrderDispatch
- [x] **[CW]** `OrderDispatch.currentEtaAt` (partner-revisable) + `CREATOR_DISPATCH_PROGRESS` event (enum + template + category `orders` + token palette; enum-key casts marked for post-generate cleanup)
- [x] **[CW]** Partner progress-submit action + UI on the dispatch detail — `progress-actions.ts` (ownership check, active-state gate, audit row, creator notification; PHOTO upload UI = follow-up) + `ProgressUpdatePanel.tsx` on the partner dispatch page
- [x] **[CW]** Pure helper: build creator order timeline from state timestamps + progress updates — `packages/orders/src/dispatch-timeline.ts` (+ vitest suite `dispatch-timeline.test.ts`; built 2026-07-05). `buildDispatchTimeline` / `buildOrderTimeline` / `effectiveEta`; declares the `DispatchProgressUpdateData` shape the F schema must match (kind NOTE/ETA/PHOTO/MILESTONE, body, etaAt, photoAssetId, milestone, authorName, createdAt). ETA dates format in UTC (calendar-date, viewer-TZ-stable).
- [x] **[CW]** Presentational creator **order timeline** component — `packages/ui/src/components/OrderTimelineView.tsx` (built 2026-07-05). Props-only; host resolves photoAssetId → photoUrl; ETA banner via `effectiveEta`; compact mode for embedding.
- [x] **[CW]** Wire timeline into the creator order view — creator `orders/[orderId]/page.tsx`: `buildOrderTimeline` over all dispatches + progress rows (query fails soft pre-migration), order-level ETA banner via `effectiveEta`

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
