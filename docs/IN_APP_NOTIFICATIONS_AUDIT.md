# In-App Notifications — Audit + Revision Plan (DRAFT 2026-07-06)

Companion to `docs/EMAIL_NOTIFICATION_CENTER.md` (email side, built 2026-07-05). This audits the
IN_APP channel: coverage, bell + feed UX, settings, and what to change before real users arrive.

---

## 1. What exists (it's more solid than expected)

The substrate is good — the Email Notification Center work gave the in-app channel a real spine:

- **Model**: `Notification` (`userId, event, channel, title, body, link, readAt, payload`) with the
  right indexes (`[userId, readAt]`, `[userId, createdAt]`). `NotificationPreference` re-keyed
  2026-07-05 to **category × channel** (11 categories, 3 mandatory: account/billing/cancellations).
- **Dispatcher** (`packages/notifications/src/dispatcher.ts`): 49 `NotificationEvent` types; IN_APP
  respects category preferences via `shouldDeliver()`; quiet hours + digest are email-only **by
  design** (the bell is where you go *to* see what's pending — correct call).
- **Bell**: per-app dropdown, 30s polling, unread badge (99+ cap), 8 rows, mark-read on click,
  mark-all, deep links via `notification.link`, "View all" → `/notifications` (200-row page).
- **Settings**: `/settings/notifications` in all three apps — category × channel matrix +
  quiet hours, dispatcher-enforced.

## 2. Coverage — 39/49 events wired (~80%)

Full emit matrix in audit appendix (agent sweep 2026-07-06). Wired domains: dispatch workflow
(accept/decline/withdraw/progress), cancellations + disputes (all parties), support ticketing (full
FSM + SLA), certs + compliance docs expiry, payments (failed/downgrade), stock alerts, partner
verification/activation, packaging review.

### 2a. CORRECTION (2026-07-06, hand-verified)

The agent-sweep gap list first published here was wrong. All 9 "dead" events **are wired**:
`PARTNER_APPLIED` (apply action), `DISPATCH_RECEIVED` (routing.ts + reprint + checkout adjust),
the full proof loop (`CREATOR_PROOF_AWAITING` in partner proof-actions; `PROOF_APPROVED`/
`PROOF_REJECTED` in creator proof-actions via a ternary — greps for the literal miss it),
`INBOUND_ASSIGNED`, `RECEIVING_DISCREPANCY_OPENED/RESOLVED`, `RELEASE_SHIP_SLA_AT_RISK`
(partner-ops-worker). Coverage of existing enum events is effectively complete.

Residue: several emit sites still cast `'X' as NotificationEvent` "until db:generate" — the
generated client already has these values, so the casts are dead weight; sweep them opportunistically.

**"New order placed" in-app event — DECIDED NOT NEEDED (Pavel 2026-07-06):** the checkout
confirmation screen + email is enough.

### 2b. Also missing (no event at all)

Team invites (creator teammate / PartnerMembership), channel connect–disconnect + go-live results,
payout paid (Stripe transfer), risk-gate actions touching a creator's order (per RISK_MANAGEMENT
spec MONITOR→ACT), sample-order lifecycle. These need new enum values — additive.

## 3. UX assessment vs. major platforms

Researched: Linear Inbox (closest analog — work-queue product), GitHub notifications, Facebook,
Slack, Shopify admin. Patterns that matter for us:

1. **Actor–action–object message grammar** — "Sarah approved your design" reads in 2 seconds.
   Linear/GitHub rows are `<avatar/icon> <actor> <verb> <object ref>` + one context line + relative
   time. **Ours**: template-driven titles are decent, but `ORDER_NEEDS_ATTENTION` is a generic
   catch-all reused for cancel/dispute/hold — an admin can't tell what happened without clicking.
2. **Triage verbs, not just read/unread** — Linear: read, snooze, archive, delete;
   auto-archive beyond 2,000 open notifications. **Ours**: read/unread only, no archive, hard
   200-row cliff (history silently truncates).
3. **Grouping/coalescing** — Facebook aggregates ("X and 4 others…"); Linear groups per issue.
   **Ours**: none — 5 declines in 5 seconds = 5 rows.
4. **Filtering** — GitHub filters by reason/repo; Linear by type. **Ours**: none, either surface.
5. **Realtime** — Linear pushes in realtime. **Ours**: 30s fixed polling, no jitter/backoff,
   3 duplicated bell components.
6. **Volume hygiene** — auto-archive read items ~30d, expire time-sensitive rows, summary modes.

## 4. Message format spec (proposed, LOCK before emitting more events)

Every IN_APP template conforms to:

- **Title** = actor + past-tense verb + object ref, ≤ 70 chars.
  `Peak Pack Co. accepted dispatch #D-1042` · `Your proof for "Berry Blast pouch" is ready to review`
  Object refs always carry the human id (`#D-1042`, order ref, product name in quotes).
- **Body** = ONE line of consequence/context, ≤ 110 chars:
  `2 of 3 partners accepted — production starts when Riverside Print confirms.`
- **Link** = deep link to the actionable screen (mandatory — a notification you can't act on is
  noise; today some payloads omit href).
- **Category** drives the row icon + accent (same 11 slugs as settings — visual language matches
  the preference matrix). Tone dots: pink = needs your action, ink = FYI, danger = money/SLA.
- **No generic events**: split `ORDER_NEEDS_ATTENTION` into `ORDER_CANCELLATION_REQUESTED`,
  `ORDER_DISPUTE_OPENED`, `ORDER_HOLD_APPLIED`.
- Payloads get zod schemas per event (today `data as never` — wrong keys fail silently at render).

## 5. Revision plan

### P0 — before onboarding real users (small, high yield)
1. ~~Wire the 9 dead events~~ — **moot** (§2a correction: they were already wired).
2. **Shared `NotificationBell` in `@ilaunchify/ui`** — ✅ DONE 2026-07-06. One component,
   `accent`/`badgeTone` props, per-app thin wrappers keep old paths; poll = 30s ±5s jitter,
   paused while tab hidden, refresh on visibility.
3. **Feed pages** — ✅ DONE 2026-07-06. Shared `NotificationFeed` (@ilaunchify/ui, URL-driven
   All/Unread + category chips from the settings registry) + `listNotificationsPage()` cursor
   pagination (50/page) replacing the 200-row cliff, in all three apps.
4. **Split `ORDER_NEEDS_ATTENTION`**; make `link` mandatory in every template. (Prisma enum
   change → needs `pnpm db:push` + `db:generate` + `.next` clear — schedule with next schema batch.)

### P1 — triage + hygiene
5. `archivedAt` on Notification — ✅ BUILT 2026-07-06, **GATED on `pnpm db:push` +
   `pnpm db:generate` + `rm -rf apps/*/.next`** (cast-guarded per
   docs/POST_PUSH_CASTGUARD_CLEANUP.md; de-cast in `packages/notifications/src/query.ts`,
   `categories.ts`, `template-tokens.ts` + the two emit sites after regen). Row archive
   button on all 3 feeds; auto-archive read>30d via `/api/cron/archive-notifications`
   (admin app, CRON_SECRET, suggested daily 04:00); bell + feed + unread count exclude archived.
   ⚠️ Until the push runs, archive buttons + the new events fail at runtime (dispatcher
   swallows event errors; archive updateMany will error) — run the incantation before testing.
6. Payload validation — ✅ DONE 2026-07-06. `payload-required.ts`: compile-checked
   REQUIRED_PAYLOAD_KEYS map (keys verified against TemplateData) + `missingPayloadKeys()`
   guard in the dispatcher — console.error on missing required keys, never blocks delivery.
   (zod skipped deliberately: not a package dep; existence checks at the dispatch seam
   catch the actual failure mode — "undefined" rendered into copy.)
7. Category icon + tone — ✅ DONE 2026-07-06. `packages/ui notification-categories.tsx`
   (slug → lucide glyph + tone: action=pink / danger=money-SLA / info=ink) rendered on
   bell rows (glyph chip + unread dot overlay) and feed rows; feed APIs + pages now carry
   the category slug.

NOTE: Pavel ran db:push + db:generate mid-build — all P1 cast-guards were de-cast same day
(query.ts, categories.ts, template-tokens.ts, payload-required.ts, both emit sites). No
cleanup debt remains from this phase.

P0 item 4 also ✅ BUILT 2026-07-06 (same gate): `ORDER_CANCELLATION_REQUESTED` +
`ORDER_DISPUTE_OPENED` enum values + templates (deep-link to /cancellations and /disputes
queues); cancel/dispute actions emit them; `ORDER_NEEDS_ATTENTION` kept for existing rows +
the two ops sweeps (inbound-receipt / release-ship overdue).

### P2 — grouping + realtime
8. Server-side coalescing window (e.g. same event + same order within 10 min → one row,
   "Riverside Print declined 3 dispatches") — needs a `groupKey` column (additive).
9. SSE endpoint (`/api/notifications/stream`) replacing polling — Next route handler streaming;
   polling stays as fallback. (WebSockets overkill for V1 scale.)
10. In-app digest option for `reminders`/`inventory` categories (currently email-only digest).

### P3 — nice-to-have
11. Snooze ("remind me tomorrow") — Linear-style, `snoozedUntil` column.
12. Per-row overflow menu: mark unread · archive · "turn off this category" (deep-links matrix).

### Explicitly NOT doing
- Browser push / desktop notifications (V2+, needs service worker + permission UX).
- Read-receipt sync across channels (email opened ≠ in-app read).
- Facebook-style social aggregation ("X and 4 others") — our actors are few; coalescing (#8) covers it.

## 6. Open questions — ANSWERED (Pavel 2026-07-06)

1. "Order placed/confirmed" in-app → **NO**; checkout confirmation screen + email is enough.
2. Auto-archive 30 days after read → **OK** (P1 item 5).
3. Coalescing window → **per-event tuning in the admin Notification Center** (P2 item 8 gets a
   per-event window setting on the template rows, not a global constant).

## Appendix — audit stats (2026-07-06 sweep)

49 events · 39 emitting · 3 bell components ~95% duplicated · 30s poll, no jitter · dropdown 8 rows ·
feed 200-row hard cap, no filters, no archive · settings matrix enforced for IN_APP (mandatory
categories always deliver) · quiet hours + digest email-only by design · 18 structural smells
catalogued (payload validation, lazy dynamic imports in workflow-notifications, singleton branding
guard, etc. — tracked for P1/P2).
