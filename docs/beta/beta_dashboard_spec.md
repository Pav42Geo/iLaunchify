# `/admin/beta` — Cohort 1 Dashboard Spec

**Target subagent:** `v2-admin-surface-builder` (per `CLAUDE.md` and `.claude/memory/ilaunchify-admin-surface-pattern.md`)
**Surface pattern:** Locked v2 — cream `#F3EFE8` hero band + 5-card KPI strip + URL-driven filter chips + sortable plain `<table>` + RowActionsMenu + Prev/Next paginator. **No shadcn Card, no `@ilaunchify/ui` Card.** Canonical references: `apps/admin/src/app/(dashboard)/audit/page.tsx`, `partners/page.tsx`, `products/page.tsx`.
**Path:** `apps/admin/src/app/(dashboard)/beta/page.tsx`
**Sidebar wiring:** Add under MANAGE section of `sidebar-config.ts` (per `.claude/memory/ilaunchify-admin-sidebar-v3-locked.md` — verify exact placement with Pavel before merging since the sidebar tree is LOCKED VERBATIM). Hidden until built; reveal on cohort 1 kickoff day.

---

## §1 Hero band

**Container:** cream `#F3EFE8` rounded-3xl with `border-ink-200` hairline. Padding `px-8 py-10`. Full-bleed within the dashboard content area.

**Content:**
- `<h1>` in Bricolage Grotesque display weight: `"Beta cohort 1 · day {N} of 90"`
- Subtitle in Inter regular: `"{Pavel's beta-journal headline from latest week} · last updated {timestamp}"`
- Top-right: a black pill button "Open beta journal" → links to `docs/beta/beta-journal.md` in GitHub (raw or via internal git viewer if one exists)
- Optional `<a>` chip "Beta program plan" → links to `BETA_PROGRAM_PLAN.md`

**Computed values:**
- `day N of 90` = `Math.floor((Date.now() - cohortStartDate) / msPerDay)` where `cohortStartDate` is read from a `BetaCohort` row (see §schema diff)
- Headline pulled from `BetaCohort.headline` field (Pavel updates weekly)

---

## §2 5-card KPI strip

Per v2 surface pattern, KPIs render via the `KpiWidget` primitive from `packages/ui`. Five cards in a single horizontal row, equally weighted, gap `gap-4`.

| Card | Value | Subtitle / sparkline | Source |
| --- | --- | --- | --- |
| **GMV** | `$N` (sum of cohort orders, not cancelled / refunded) | "↑ $X this week" | `getBetaGmv(cohortId)` |
| **Cohort completion** | `N / M` creators have at least 1 delivered order | "of {M} active" | `getBetaCompletionCount(cohortId)` |
| **Median time-to-first-shipment** | `N days` | `target ≤21d` | `getBetaMedianTimeToShipment(cohortId)` |
| **Avg revision rounds** | `N.N` design rounds per order | `target ≤3` | `getBetaAvgRevisionRounds(cohortId)` |
| **Open support threads** | `N` | "↑/↓ vs last week" | `getBetaOpenThreadCount(cohortId)` if SupportThread UI shipped; else manual count override from `BetaCohort.openThreadsManual` |

Color rules:
- Green tone if metric beats target
- Pink-700 tone if metric is at or below target (this is admin v2 — light surface, no neon green)
- Ink-700 if no target defined

---

## §3 Filter chip rows (URL-driven)

Per v2 pattern. Each chip toggle updates `?filter=value` in the URL via the `<FilterChip>` primitive.

**Row 1 — view scope:**
- All
- Creators only
- Partners only

**Row 2 — status filter (creator scope):**
- Active
- At-risk (no order placed by day 14 OR no app activity in 7d)
- Completed (≥1 delivered order)
- Exited

**Row 2 — status filter (partner scope):**
- Active
- At-risk (accept-rate <80% OR avg-on-time <75%)
- Inactive (no dispatches in 14 days)
- Exited

**Row 3 — niche filter (only when creator scope, per locked 8 niches from `apps/marketing/src/lib/niches.ts`):**
- All niches
- Supplements
- Functional drinks
- Functional food
- Pet
- (other 4 niches per locked seed)

---

## §4 Main panels — two-column

Below the filter chips, render two main tables side by side at `lg+` breakpoints, stacked at smaller breakpoints. **Each is a plain `<table>` per v2 surface pattern. No Card wrapper.**

### Left panel — Creator cohort table

**Title above:** `<h2>` "Creators ({N} active)"

**Columns:**

| Header | Sortable | Render |
| --- | --- | --- |
| Creator | yes (by name asc/desc) | avatar + handle (e.g., `@brandname`) + niche chip |
| Joined | yes | days-since-join (e.g., "day 12") |
| Status | yes | `<StatusPill>` from `@ilaunchify/ui` — green=active, yellow=at-risk, gray=completed, red=exited |
| Health | yes | traffic light — green / yellow / red. Computed: green if `onTrack(creator)`, yellow if any 1 watch flag, red if any 2+ watch flags |
| Last action | yes (by date) | "Started design 3h ago" — pulled from latest AuditLog row for `actorId=user.id` |
| GMV | yes | `$N` cohort-to-date |
| Orders | yes | `N placed / N delivered` |
| Actions | no | `<RowActionsMenu>` |

**Row link:** entire row links to `/admin/creators/{user.id}` per platform convention (`R6.1` pattern, anchored row).

**RowActionsMenu items:**
- "Open creator detail" → `/admin/creators/{id}`
- "Open Slack channel" → external link to Slack channel (URL stored in `BetaParticipant.slackChannelUrl`)
- "Mark as exited" → opens modal with `exitReason` text area; writes `BetaParticipant.exitedAt` + `exitReason` + `isActive=false` + AuditLog
- "Schedule check-in" → opens Pavel's calendar with pre-filled subject + creator email

**Traffic-light computation (centralized helper):**
```ts
function creatorHealth(creator: CreatorCohortMember): "green" | "yellow" | "red" {
  const flags: string[] = [];
  if (creator.daysSinceLastAction > 7) flags.push("inactive_7d");
  if (creator.daysSinceJoin > 14 && creator.ordersPlaced === 0) flags.push("no_order_day14");
  if (creator.designRevisionRoundsOpen > 3) flags.push("design_stuck");
  if (creator.openSupportThreadCount > 3) flags.push("support_heavy");
  if (creator.lastDispatchStatusAge > 5 && creator.lastDispatchStatus !== "DELIVERED") flags.push("dispatch_stale");
  if (flags.length === 0) return "green";
  if (flags.length === 1) return "yellow";
  return "red";
}
```

### Right panel — Partner cohort table

**Title above:** `<h2>` "Partners ({N} active)"

**Columns:**

| Header | Sortable | Render |
| --- | --- | --- |
| Partner | yes | logo + legal name + service-type chip |
| Joined | yes | days-since-join |
| Status | yes | `<StatusPill>` |
| Accept-rate | yes | `N%` over rolling 30d. red <80%, yellow 80-89%, green ≥90% |
| On-time shipment | yes | `N%` of dispatches shipped by committed lead-time. red <75%, yellow 75-89%, green ≥90% |
| Dispatches | yes | `N pending / N producing / N shipped` |
| Last action | yes | latest AuditLog row description + relative time |
| Actions | no | `<RowActionsMenu>` |

**Row link:** `/admin/partners/{partner.id}`.

**RowActionsMenu items:**
- "Open partner detail" → `/admin/partners/{id}`
- "Open Slack channel" → external Slack link
- "Mark as exited" → exit-reason modal
- "View dispatches" → `/admin/orders?partnerId={id}`

---

## §5 Timeline strip — cohort milestones over 90 days

Below the two-column main panels. Full-width.

**Container:** plain wrapped `<div>` with horizontal scroll on narrow viewports. No Card.

**Visual:** a horizontal timeline with day markers (day 0, 14, 30, 60, 75, 90). Milestones rendered as small badge chips above the timeline at their relative-time position:

- Day 0 — cohort kickoff (always green)
- Day 7 — all partners ACTIVE (computed: green if all partners ACTIVE by day 7, red if not)
- Day 14 — all creators have sample order placed (computed)
- Day 21 — first delivery (computed: green when first DELIVERED order in cohort)
- Day 30 — milestone check (manual: Pavel marks via admin)
- Day 45 — mid-cohort survey window
- Day 60 — reorder check-in window
- Day 75 — pre-retrospective survey
- Day 90 — GA decision

Today's position rendered as a vertical pink-700 line with "Today · day {N}" label.

**Hover state on each milestone:** tooltip with the milestone definition + computed pass/fail.

---

## §6 Recent activity log

Below the timeline strip. Full-width.

**Title:** `<h2>` "Recent activity"

**Source:** `AuditLog` filtered to cohort participants.

```ts
const cohortAuditFeed = await prisma.auditLog.findMany({
  where: {
    OR: [
      { actorId: { in: cohortUserIds } },
      { entityId: { in: cohortPartnerIds } },
      { entityId: { in: cohortOrderIds } },
      { entityId: { in: cohortProductIds } },
    ],
  },
  orderBy: { createdAt: 'desc' },
  take: 50,
});
```

**Render:** the existing `AuditFeedRow` component from `apps/admin/src/app/(dashboard)/audit/page.tsx` — proven pattern. Each row: icon (entity-typed) + actor + action verb + entity link + relative time. Click → detail page.

**Pagination:** Prev/Next at 50 per page per v2 convention.

---

## §7 Schema diff — `BetaCohort` + `BetaParticipant`

Add to `packages/db/prisma/schema.prisma`. Use the `prisma-migrator` subagent for the migration.

```prisma
model BetaCohort {
  id              String   @id @default(uuid())
  cohortNumber    Int      @unique           // 1, 2, 3...
  startDate       DateTime
  endDate         DateTime                   // startDate + 90 days
  status          BetaCohortStatus @default(ACTIVE)
  headline        String?                    // weekly journal headline (Pavel-editable)
  openThreadsManual Int   @default(0)        // until SupportThread UI ships
  retrospectiveNotes String?                 // populated at T+90
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  participants    BetaParticipant[]
}

enum BetaCohortStatus { PLANNED ACTIVE PAUSED COMPLETED }

model BetaParticipant {
  id              String   @id @default(uuid())
  cohortId        String
  cohort          BetaCohort @relation(fields: [cohortId], references: [id])
  // Exactly one of the two FKs is set per row (XOR)
  creatorUserId   String?  @unique
  creatorUser     User?    @relation("BetaParticipantCreator", fields: [creatorUserId], references: [id])
  partnerId       String?  @unique
  partner         Partner? @relation(fields: [partnerId], references: [id])
  // Lifecycle
  joinedAt        DateTime @default(now())
  exitedAt        DateTime?
  exitReason      String?
  isActive        Boolean  @default(true)
  // Communication
  slackChannelUrl String?
  publicNameConsent BetaPublicConsent @default(NOT_DECIDED)
  // Operational notes
  onboardingNotes String?                    // Pavel-maintained
  retrospectiveNotes String?                 // populated at T+90 from exit interview
  // Beta-specific commitments
  firstDispatchCommitment String?           // creator handle (for partners) or template id (for creators)
  acceptanceSlaHours      Int?               // partner only — 4 or 8
  certUploadCommitDate    DateTime?          // partner only
  insuranceCertStatus     String?            // partner only — "submitted" / "outstanding" / "verified"
  audienceSize            String?            // creator only — "25-50K", "50-100K", etc.
  // Calendar markers
  day14CheckInAt          DateTime?
  day30CheckInAt          DateTime?
  day60ReorderCheckInAt   DateTime?
  exitInterviewAt         DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([cohortId, isActive])
  @@index([cohortId, exitedAt])
}

enum BetaPublicConsent { NOT_DECIDED YES ASK_LATER NO }
```

**Audit notes:**
- Every `BetaParticipant` mutation writes an `AuditLog` row via `packages/audit` — exit, status change, slackChannelUrl set, etc.
- `exitReason` is required when transitioning `isActive=true → false`. Enforce in `setBetaParticipantExit()` server action.
- XOR on `creatorUserId`/`partnerId`: enforce in the server action layer (Prisma can't `@check` cleanly across nullable FKs).
- Add `betaParticipations` back-relation to both `User` and `Partner`.

**Migration name:** `add_beta_cohort_and_beta_participant`. Cockroach-safe (no `@db.Text`).

---

## §8 `beta-data.ts` loader shape

New file: `apps/admin/src/lib/beta-data.ts`.

```ts
import { prisma } from "@ilaunchify/db";

export type CohortContext = {
  cohort: BetaCohort;
  dayInCohort: number;
  daysRemaining: number;
  creatorUserIds: string[];
  partnerIds: string[];
};

export async function loadCurrentCohort(): Promise<CohortContext> {
  const cohort = await prisma.betaCohort.findFirst({
    where: { status: "ACTIVE" },
    include: { participants: true },
  });
  if (!cohort) throw new Error("No active beta cohort");
  const creatorUserIds = cohort.participants.filter(p => p.creatorUserId).map(p => p.creatorUserId!);
  const partnerIds = cohort.participants.filter(p => p.partnerId).map(p => p.partnerId!);
  const dayInCohort = Math.floor((Date.now() - cohort.startDate.getTime()) / 86400000);
  const daysRemaining = Math.max(0, 90 - dayInCohort);
  return { cohort, dayInCohort, daysRemaining, creatorUserIds, partnerIds };
}

export async function loadCohortKpis(ctx: CohortContext) {
  const [gmv, completionCount, medianShipTime, avgRevisions, openThreads] = await Promise.all([
    getBetaGmv(ctx),
    getBetaCompletionCount(ctx),
    getBetaMedianTimeToShipment(ctx),
    getBetaAvgRevisionRounds(ctx),
    getBetaOpenThreadCount(ctx),
  ]);
  return { gmv, completionCount, medianShipTime, avgRevisions, openThreads };
}

export async function loadCohortCreators(ctx: CohortContext, filters: { status?: string; niche?: string }) {
  // returns rows with: creator info, niche, joined, status, health flags, last AuditLog action, GMV, order counts
}

export async function loadCohortPartners(ctx: CohortContext, filters: { status?: string }) {
  // returns rows with: partner info, joined, status, accept-rate, on-time%, dispatch counts, last AuditLog action
}

export async function loadCohortActivity(ctx: CohortContext, page: number = 0, pageSize: number = 50) {
  // AuditLog filtered by cohort participants
}

export async function loadCohortMilestones(ctx: CohortContext) {
  // returns the 9 milestones with computed pass/fail/pending status
}

// Per-KPI helpers — each one a focused Prisma query
async function getBetaGmv(ctx: CohortContext): Promise<number> { /* ... */ }
async function getBetaCompletionCount(ctx: CohortContext): Promise<{ completed: number; active: number }> { /* ... */ }
async function getBetaMedianTimeToShipment(ctx: CohortContext): Promise<number> { /* ... */ }
async function getBetaAvgRevisionRounds(ctx: CohortContext): Promise<number> { /* ... */ }
async function getBetaOpenThreadCount(ctx: CohortContext): Promise<number> { /* ... */ }
```

All loaders are `async` + Prisma-only — no client-side state. The page is a Server Component per Next 15 App Router conventions.

---

## §9 Server actions

Place in `apps/admin/src/app/(dashboard)/beta/actions.ts`.

```ts
"use server";

export async function setBetaParticipantExit(participantId: string, reason: string) {
  // 1. Set isActive=false, exitedAt=now(), exitReason=reason
  // 2. Write AuditLog: entityType="BetaParticipant", action="EXIT", changeNote=reason
  // 3. revalidatePath("/admin/beta")
}

export async function setBetaCohortHeadline(cohortId: string, headline: string) {
  // updates BetaCohort.headline
  // AuditLog entry
  // revalidate
}

export async function setManualMilestone(cohortId: string, milestoneCode: string, status: "PASS" | "FAIL") {
  // upserts a BetaMilestoneOverride or stores in cohort.manualOverrides JSON
  // AuditLog
}

export async function setBetaParticipantNotes(participantId: string, field: "onboarding" | "retrospective", value: string) {
  // updates respective notes field on BetaParticipant
  // AuditLog
}
```

All actions follow platform convention: AuditLog row written via `packages/audit`, `revalidatePath` called, no inline `prisma.update` outside FSM helpers.

---

## §10 Buildability assessment

**Today, against the current schema?** No. The dashboard depends on `BetaCohort` + `BetaParticipant` models which do not yet exist. **A migration must land first.**

**Migration scope:**
- 2 new models, 2 new enums
- 2 new relation back-edges on `User` and `Partner`
- 1 new migration file
- Seed updates: an initial `BetaCohort` row (cohort 1) seeded on first run
- Zero existing-data risk; additive only per `CLAUDE.md` convention

**After migration, the rest is buildable today:**
- v2 admin surface pattern fully established and proven across `/audit`, `/partners`, `/orders`, `/products`, `/leads` — no new primitives needed
- `AuditLog` already populated with the relevant entity-typed actions
- `KpiWidget` already in `packages/ui` (per dashboard widgets foundation `2c1e73a`)
- `RowActionsMenu` primitive shipped (`#577`)
- Sort + filter URL plumbing already wired in multiple admin list pages

**Build order:**

1. Schema migration (use `prisma-migrator` subagent) — ~30 min
2. Seed cohort 1 row with planned `startDate` — ~10 min
3. `beta-data.ts` loaders + Prisma queries — ~2 hours
4. Page assembly using `v2-admin-surface-builder` — ~3 hours
5. Server actions + AuditLog wiring — ~1 hour
6. Sidebar entry + hide-until-built flag flip — ~10 min

Total: roughly a focused day's work post-migration. **No new primitives or design-system additions required.**

---

## §11 Pre-merge checklist (subagent will own)

- [ ] Migration `add_beta_cohort_and_beta_participant` runs cleanly + `prisma generate` succeeds + Next dev restarted per `ilaunchify-dev-prisma-restart.md`
- [ ] No `@db.Text` anywhere in the diff (Cockroach guardrail)
- [ ] Page uses v2 surface pattern exactly — no shadcn Card, no `@ilaunchify/ui` Card, no neon green on this light surface
- [ ] Cream `#F3EFE8` hero band matches existing list pages
- [ ] All filter chips drive `?filter=value` URL state
- [ ] All RowActionsMenu items deep-link, do not inline-mutate
- [ ] All sortable columns implement asc/desc with `aria-sort` per `R9.b`
- [ ] AuditLog rows written for all server actions
- [ ] Sidebar entry hidden until Pavel flips the flag for cohort 1 kickoff day
- [ ] `apps/admin/src/lib/beta-data.ts` returns correctly typed responses (`noUncheckedIndexedAccess` clean)
- [ ] Focus-visible rings on table headers + filter chips (pink-500)
- [ ] No function-shaped props across the RSC boundary (per `ilaunchify-rsc-boundary-config.md` — import icons inside client components)
