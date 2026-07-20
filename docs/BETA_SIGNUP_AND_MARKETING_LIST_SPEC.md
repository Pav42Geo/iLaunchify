# Beta Signup Capture and Marketing List Spec

Status: PROPOSED (2026-07-14)
Owner: Pavel
Surfaces: `apps/marketing` (public beta landing + interest forms), `apps/admin` (review + invite console)
Prototype: `design/beta-landing-prototype.html`
Related: `docs/AUTH_ENTRANCE_SECURITY_2026-07.md`, `docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md`

## 0. Goal and the one rule that shapes everything

We want a lightweight way for founding Creators and Partners to raise their hand for the beta and answer a short qualification survey, WITHOUT creating a real account. The real signup stays exactly as it is today. When we decide someone is a fit, we invite them into the existing signup flow.

The one rule: **capture is not signup.** A `BetaSignup` row is an expression of interest plus survey answers. It never touches `User`, `Partner`, or auth. Conversion happens later, on an explicit admin action, through the invite/magic-link paths we already have.

Second hard rule, business-critical: **on the partner side we only want manufacturers, co-packers, printers, and warehouses that offer white-label, private-label, or custom-formulation production.** A partner who only makes their own branded goods is out of scope. The survey qualifies on this in question one, and the copy communicates the selectivity up front.

## 1. Two stores, one source of truth

Keep these responsibilities separate and do not blur them.

| Concern | System | Why |
|---|---|---|
| Truth: survey answers, qualification, review state, invite state, audit | **Our DB (`BetaSignup`)** | It is structured, queryable, joins to the rest of the platform, and is auditable. |
| The marketing list we actually send from | **Resend Audience / Segment** | Handles unsubscribe headers, bounce/complaint suppression, and no-code branded Broadcasts. |

Flow: a confirmed opt-in in our DB is **synced up** to a Resend Audience. We never treat Resend as the record of truth; if Resend and our DB disagree, our DB wins and re-syncs. This means we can leave Resend at any time by exporting, and no survey data is trapped in a third party.

## 2. The marketing-list decision (the "propose the right one")

**Recommendation: use Resend Audiences + Broadcasts as the marketing list, synced from `BetaSignup`.**

Reasoning, in order of weight:

1. **It is already our stack.** `@ilaunchify/notifications` runs on `resend ^4`, the API key, verified sending domain, and the inbound webhook (`resend-webhook.ts`, powering admin Deliverability) are already wired. Adding a second ESP means a second domain warm-up, a second suppression list, and a second place deliverability can rot. Not worth it for a beta.
2. **Audiences give us a real marketing list.** Contacts live in an Audience (renamed Segments in Nov 2025), a contact can be in multiple audiences and still counts once toward quota, and CSV import/export is first-class (up to 200MB).
3. **Broadcasts cover branded sends with zero new code.** We can compose branded HTML in the dashboard or send a saved Broadcast via the Broadcast API, and unsubscribe flows plus Gmail/Yahoo bulk headers are handled automatically. That satisfies "send them branded email templates."
4. **Export is a one-click escape hatch.** If we later move to a dedicated lifecycle tool, we export the Audience to CSV and import elsewhere. No lock-in, because the survey truth is in our DB anyway.

When you would pick something else (documented so we do not relitigate later):

- **Loops or Customer.io** if the beta turns into always-on lifecycle automation (drip sequences, behavioral triggers, in-app + email). Revisit only when we have real onboarding funnels to automate, not before.
- **HubSpot** only if Sales/CRM wants these contacts as leads with pipeline stages. That is a heavier commitment; do not adopt it just to store beta emails.
- **Mailchimp/ConvertKit**: no. Redundant with Resend and adds a second sending reputation to manage.

Net: Resend now, export-and-graduate later if the use case grows. Right-sized for a beta.

## 3. Data model (`packages/db/prisma/schema.prisma`)

Additive only. New model uses `uuid()` per the id FREEZE. All enums are new.

```prisma
enum BetaTrack {
  CREATOR
  PARTNER
}

enum BetaSignupStatus {
  NEW          // just submitted, not yet double-opt-in confirmed
  CONFIRMED    // email confirmed (double opt-in), synced to Resend audience
  REVIEWING    // admin looking at it
  INVITED      // real signup invite sent
  CONVERTED    // completed real signup (linked to userId)
  DECLINED     // not a fit (e.g. own-brand-only partner)
  WITHDRAWN    // user asked to be removed / unsubscribed
}

/// White-label qualification answer for partner applicants.
enum WhiteLabelFit {
  FULL         // "Yes, that's our model"
  PARTIAL      // "Some products, yes"
  NONE         // "No, only our own brands"  -> auto-disqualify
}

model BetaSignup {
  id                String            @id @default(uuid())
  track             BetaTrack
  status            BetaSignupStatus  @default(NEW)

  // contact
  fullName          String
  email             String
  company           String?           // brand/handle for creators, company for partners
  locationRegion    String?           // US state (beta is US-only)

  // qualification (partner)
  whiteLabelFit     WhiteLabelFit?    // required for PARTNER, null for CREATOR
  qualified         Boolean           @default(false) // derived gate

  // survey payload (typed at the app layer, stored as JSON)
  survey            Json

  // double opt-in
  confirmTokenHash  String?           @unique
  confirmedAt       DateTime?

  // marketing-list sync
  resendContactId   String?           // id returned by Resend when synced
  syncedAt          DateTime?
  unsubscribedAt    DateTime?

  // conversion to real account (set on INVITE/CONVERT, never before)
  invitedAt         DateTime?
  convertedUserId   String?
  convertedUser     User?             @relation("BetaSignupConverted", fields: [convertedUserId], references: [id])

  // provenance + anti-abuse
  source            String?           // utm/source tag
  ipHash            String?           // hashed, for rate-limit/abuse only
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@unique([email, track])            // one interest row per email per track
  @@index([track, status])
  @@index([status])
  @@index([email])
}
```

Notes:

- `@@unique([email, track])` lets the same person express interest as both a Creator and a Partner, but dedupes repeat submissions on the same track (upsert on collision, refresh survey answers, do not create a second row).
- `survey Json` stays flexible so we can tweak questions without a migration. It is typed with a Zod schema at the app boundary (below), so it is not a free-for-all.
- `qualified` is derived: creators are always eligible to be reviewed; partners are `qualified = whiteLabelFit != NONE`.
- Do not add a foreign key to `Partner`/`User` beyond `convertedUserId`. Capture must not entangle with tenant data.

Add the back-relation on `User`:

```prisma
// in model User
betaSignups BetaSignup[] @relation("BetaSignupConverted")
```

Apply with `pnpm db:push` then `pnpm db:generate`, then `rm -rf apps/*/.next` and restart dev (stale-client gotcha).

## 4. Typed survey payload (app layer)

Define in a small shared module (e.g. `packages/marketing-forms` or colocated in `apps/marketing/src/lib/beta`). Zod validates on submit; the parsed object is what goes into `survey`.

```ts
// creator survey
const CreatorSurvey = z.object({
  productType: z.enum(['drinks','protein','supplements','snacks','coffee_tea','pet','undecided']),
  sellsToday: z.enum(['not_yet','own_channels','via_maker']),
  audienceSize: z.enum(['<5k','5k-50k','50k-250k','250k-1m','1m+','none']),
  biggestBlocker: z.enum(['find_manufacturer','cost_minimums','design_packaging','compliance','dont_know_start']),
  timeline: z.enum(['asap','1-3mo','3-6mo','exploring']),
  payReason: z.string().max(500).optional(),
})

// partner survey
const PartnerSurvey = z.object({
  whiteLabelFit: z.enum(['FULL','PARTIAL','NONE']),   // Q1, gates qualification
  partnerType: z.enum(['manufacturer','printer','copacker','warehouse','multiple']),
  formats: z.array(z.enum(['powders','beverages','caps_tabs','bars','gummies','pet','labels'])).min(1),
  capacity: z.enum(['plenty','some','near_full']),
  orchestrationOpenness: z.enum(['very','somewhat','curious','unsure']),
  clientPain: z.string().max(500).optional(),
})
```

The prototype form fields map one to one to these. The partner form's first question is `whiteLabelFit`; a `NONE` answer still submits (we keep the datapoint) but the row is created `qualified = false` and routed to a soft "not a fit right now" outcome instead of the standard confirmation.

## 5. Submit flow (marketing app)

Route: `POST /api/beta/interest` in `apps/marketing`.

1. **Anti-abuse first.** Verify Cloudflare Turnstile token (already the plan in AUTH_ENTRANCE_SECURITY) and check a hidden honeypot field. Rate-limit by hashed IP.
2. **Validate** with the Zod schema for the track. Reject on failure with field errors.
3. **Upsert** `BetaSignup` on `[email, track]`. Status `NEW`. Compute `qualified`.
4. **Double opt-in.** Generate a confirm token, store `confirmTokenHash`, send a branded "confirm your beta interest" email via `@ilaunchify/notifications`. (Do not sync to Resend Audience yet; confirmation proves the address.)
5. **Audit.** `logSystemAudit` with new entity type `BETA_SIGNUP`, action `CREATED`.
6. **Respond** with the success state the prototype already shows ("you are on the founding list, watch for an invite").

Confirm route: `GET /api/beta/confirm?token=...`:

1. Hash, look up, set `confirmedAt`, status `CONFIRMED`.
2. **Sync to Resend Audience** (`resend.contacts.create`) into the right audience (Creator vs Partner), store `resendContactId`, `syncedAt`. Tag/segment by track and qualification so Broadcasts can target precisely.
3. Audit `CONFIRMED`.

Unsubscribe: honor Resend's unsubscribe webhook by setting `unsubscribedAt` + status `WITHDRAWN` on the matching row, so our DB stays truthful.

## 6. Admin console (`apps/admin`)

New page `/admin/beta-signups` following the LOCKED admin v2 surface pattern (hero band, 5-card KPI strip, URL-driven filter chips, sortable table, RowActionsMenu, 50/page). Use the `v2-admin-surface-builder` subagent.

- KPIs: total, confirmed, qualified partners, invited, converted.
- Filter chips: track (Creator/Partner), status, qualified yes/no.
- Row actions (deep-link, never inline-mutate): View detail, Mark reviewing, **Send beta invite** (fires the existing signup invite, sets `INVITED`), Decline, Export selected.
- Detail page renders the full survey nicely, shows audit history, and is where the invite action lives.
- **Invite = the bridge to real signup.** It calls the existing invite/magic-link generator for the correct app (creator or partner onboarding). This is the only place `BetaSignup` connects to auth.

Export button: server action that streams selected rows (or a filtered set) to CSV for use in any external email client, exactly as requested.

## 7. Audit + notifications wiring

- Add `BETA_SIGNUP` to `AUDIT_ENTITY_TYPES` in `packages/audit`. Actions used: `CREATED`, `CONFIRMED`, `REVIEWING`, `INVITED`, `CONVERTED`, `DECLINED`, `WITHDRAWN`.
- Add three transactional templates to `@ilaunchify/notifications`: confirm-opt-in, you-are-invited (creator), you-are-invited (partner). Marketing Broadcasts (the recurring branded sends) are composed in Resend, not in code.

## 8. Env

```
RESEND_CREATOR_AUDIENCE_ID=
RESEND_PARTNER_AUDIENCE_ID=
# reuses existing AUTH_RESEND_KEY / AUTH_EMAIL_FROM and RESEND_WEBHOOK_SECRET
```

## 9. Build phases

- **P0 (capture works):** model + migration, marketing `POST /interest`, double opt-in confirm, Turnstile + honeypot, success states already in the prototype. No Resend sync yet, no admin UI. Rows land in DB, we can query them.
- **P1 (marketing list live):** Resend Audience sync on confirm, unsubscribe webhook reconciliation, the three transactional templates.
- **P2 (ops):** `/admin/beta-signups` v2 console, invite action bridging to real signup, CSV export.
- **P3 (optional):** live "founding members joined" counter on the landing (reads confirmed count), referral/skip-the-line if we want virality.

## 10. Open decisions for Pavel

1. Confirm the marketing-list pick: Resend Audiences now, graduate later. (Recommended.)
2. Public founding-member counter on the landing: yes or hold until numbers look good.
3. Partner `PARTIAL` white-label answer: auto-qualify for review, or route to manual check. (Default: qualify for review, flag in admin.)
