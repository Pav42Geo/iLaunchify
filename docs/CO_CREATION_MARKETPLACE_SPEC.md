# Co-Creation Marketplace — Engineering Spec

**Status:** DRAFT v1 · authored 2026-07-09 · owner: Pavel
**Kind:** New feature domain (net-new surfaces + models). Additive to V1.
**Prototype (source of truth for UI/UX):** [`../iLaunchify-cocreation-demo.html`](../iLaunchify-cocreation-demo.html) — also mirrored at `design/co-creation-demo.html`.
**Rationale / market research:** `design/co-creation-strategy-brief.html`.

> This is the kickoff doc for a fresh development session. Read §0 first, then the
> prototype, then build P0 in §16. Everything below is written to the repo's locked
> conventions (see root `CLAUDE.md` + `AGENTS.md`).

---

## 0. How to use this doc (new session start-here)

1. **Read, in order:** this §0 → open the branded prototype in a browser and click through **both roles** → §1–§5 (model + flow) → §6 (data model) → §16 (build checklist).
2. **Pre-reqs to skim** (already in repo): `docs/PLATFORM_SPEC.md` (tiers/fees/FSMs), `docs/MARKETPLACE_DESIGN.md` (4-layer taxonomy), `docs/PRODUCTION_ORCHESTRATION.md` (multi-partner graph), `docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md` (H1 approval), `docs/SECURITY_ARCHITECTURE.md` (tenant isolation), `docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md`.
3. **The prototype is the UX contract.** Screen structure, states, copy tone, and the brand system in it are the intended design. It uses the real tokens (`packages/ui/src/tokens/colors.ts`, `theme.css`) and the real taxonomy (`apps/marketing/src/lib/niches.ts`, `packages/db/prisma/seed-categories-locked.ts`). Build to match it; deviate only with a noted reason.
4. **Use the subagents:** `prisma-migrator` for schema, `partner-editor-card-builder` for partner cards, `v2-admin-surface-builder` for admin pages, `marketplace-taxonomy-guardian` before touching taxonomy.
5. **Respect the hot-file rule** (`CLAUDE.md` §Multi-agent): the partner New-Product builder and Design Studio canvas are single-writer. Commit after every change.

---

## 1. What we're building

A **creator-originated production channel**. Today creators order templates and tweak recipes. This lets a creator **originate their own product** — bring a recipe, or just an idea — and get it formulated, branded, and produced by a matched iLaunchify manufacturer, entirely **on-platform and under the creator's control**.

**Thesis (consistent with the orchestration model):** the moat is not "matching." It is the **on-platform collaboration workspace** where recipe / label / packaging move as *structured, approvable objects* (not email attachments), with staged IP reveal, milestone escrow, and a decision log. Leaving for email must feel like a downgrade.

**One-liner:** *A creator's idea becomes a shippable product through a guided, trustworthy, on-platform collaboration.*

---

## 2. Personas (both funnel into one `ProductBrief`)

- **P1 — "The Formulator":** has a recipe/formula or key ingredients (chefs, food nomads, wellness/cosmetic enthusiasts). On-ramp: **"I have a recipe."** Fear: recipe theft / dilution.
- **P2 — "The Visionary":** has an idea + audience, no formulation knowledge (the passion-fruit-protein-water creator). On-ramp: **"I have an idea."** Needs a guide, wants to stay in control. AI-assist rescues them from the blank form.

Design implication: **one entry, two doors**, both producing the same `ProductBrief` object with different amounts pre-filled.

---

## 3. Scope & phasing

**V1 (this build — "Direct co-creation, Mode 1"):**
- Two-door **Brief Builder** (creator).
- **Opportunity Pool** (partner) — niche/capability-matched feed + **Expression of Interest** (fit + terms, **no recipe**).
- **Shortlist & Selection** (creator) — compare, select → mutual NDA + private room + first milestone to escrow.
- **Collaboration Room** (both) — structured objects (recipe/label/packaging/sample) with per-object FSM, versioning, per-line/pin comments, approve / request-changes, activity/decision log, messages.
- **Admin** oversight surfaces (briefs, rooms, disputes) in the v2 pattern.

**V1.5:** AI brief-assist for novices (concept/claims/benchmark), label/compliance pre-check hook (reuse `packages/compliance`), self-design on maker dieline (Design Studio bridge), sample logistics via `packages/shipping`.

**V2 (moat, later):** pooling + buffer inventory; multi-partner co-creation graph (formulator + printer + co-packer in one brief) via `packages/orders` orchestration.

**Non-goals (do NOT build):** consumer storefront; open **contest/auction** bidding (rejected — see §4); a `Lead` model (leads ARE Partner rows); selling partner badges (Merit Engine owns `Partner.tier`).

---

## 4. The matching model (decided)

**Adopt: Curated RFQ + Expression of Interest → paid Discovery.**

- Creator posts a **brief** → platform routes to **fit-matched, verified** manufacturers → makers send a lightweight **Expression of Interest** (capabilities, indicative price band, MOQ, lead time, claim-fit, one pitch — **never a formula**) → creator **shortlists & selects one** → a **paid Discovery/Sample milestone** begins in the room.
- **Cheap to express interest, expensive to actually build.** Real formulation work is a paid milestone *after* selection.
- **Creator always decides.** Platform matches/ranks; never auto-assigns.

**Rejected — open bidding / 99designs contest:** free spec formulation work makers won't do; races to cheap; erodes trust. (Rationale in strategy brief.)

---

## 5. End-to-end flow + stage FSM

Brief lifecycle (creator-side): `DRAFT → POSTED → INTEREST_OPEN → SHORTLISTING → MATCHED → IN_ROOM → IN_PRODUCTION → COMPLETED` (+ `CANCELLED`, `EXPIRED`).

```
Creator          Platform (auto)            Manufacturer
── Post brief ──▶ structure + fit-route ──▶ appears in Opportunity Pool
                                            ── Express Interest (terms only)
── Review/shortlist ◀── rank by fit/merit ──┘
── Select one ──▶ mutual NDA + room + escrow milestone 1
                                            ── formulate + submit objects
── Approve / request changes ◀── object sync + decision log ──┘
── Confirm order ──▶ milestone release + PO ──▶ produce & fulfil
```

Each **build object** (recipe/label/packaging/sample) runs its own FSM:
`DRAFT → SUBMITTED → IN_REVIEW → CHANGES_REQUESTED → APPROVED → LOCKED` (re-open sends `APPROVED/LOCKED → IN_REVIEW`).

All transitions go through an FSM helper (pattern: `packages/orders/src/*-fsm.ts`) and write an `AuditLog` row (`packages/audit`). **No inline `prisma.update` for state changes.**

---

## 6. Data model (Prisma — CockroachDB-safe)

Add to `packages/db/prisma/schema.prisma`. **Conventions (from `CLAUDE.md`):** additive only; `id String @id @default(uuid())` for new models (note: some legacy models use `cuid()` — new co-creation models use `uuid()`, confirm with `prisma-migrator`); **no `@db.Text`** (bare `String`); every mutation writes `AuditLog`; apply via `pnpm db:push` → `pnpm db:generate` → `rm -rf apps/*/.next` → restart.

**New enums:**
```prisma
enum BriefStatus { DRAFT POSTED INTEREST_OPEN SHORTLISTING MATCHED IN_ROOM IN_PRODUCTION COMPLETED CANCELLED EXPIRED }
enum BriefOrigin { HAVE_RECIPE HAVE_IDEA }          // the two doors
enum FormulationMode { CREATOR_PROVIDED MAKER_FORMULATES }
enum InterestStatus { SUBMITTED SHORTLISTED SELECTED PASSED WITHDRAWN }
enum RoomStatus { ACTIVE PAUSED CLOSED_WON CLOSED_CANCELLED }
enum BuildObjectKind { RECIPE LABEL PACKAGING SAMPLE SPEC_SHEET }
enum BuildObjectStatus { DRAFT SUBMITTED IN_REVIEW CHANGES_REQUESTED APPROVED LOCKED }
enum MilestoneKind { DISCOVERY SAMPLE TOOLING PRODUCTION }
enum MilestoneStatus { PENDING FUNDED_ESCROW RELEASED REFUNDED DISPUTED }
```

**New models (fields abbreviated; FKs + `createdAt/updatedAt` on all):**
```prisma
model ProductBrief {
  id              String   @id @default(uuid())
  creatorId       String                       // -> CreatorProfile
  origin          BriefOrigin
  status          BriefStatus @default(DRAFT)
  title           String
  nicheSlug       String                       // Layer-1 (8 locked) — match seed
  category        ProductCategory              // reuse existing enum (13 locked)
  claims          String[]                     // must-have claims
  targetVolume    Int?
  budgetLow       Decimal?
  budgetHigh      Decimal?
  timelineWeeks   Int?
  formulationMode FormulationMode
  // PRIVATE payload — NOT in the public projection (staged reveal, §9):
  privateFormula  Json?                         // creator-provided ingredients/targets
  privateNotes    String?
  attachments     BriefAttachment[]
  interests       BriefInterest[]
  room            CoCreationRoom?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([status, nicheSlug])
  @@index([creatorId])
}

model BriefAttachment { id String @id @default(uuid()) briefId String isPrivate Boolean @default(true) assetId String kind String }

model BriefInterest {
  id            String @id @default(uuid())
  briefId       String
  partnerId     String                          // -> Partner (a verified manufacturer)
  serviceId     String?                         // -> PartnerService (the matched line)
  status        InterestStatus @default(SUBMITTED)
  fitScore      Int                             // 0..100 (see §8)
  priceLow      Decimal?
  priceHigh     Decimal?
  moq           Int?
  leadTimeWeeks Int?
  claimFit      Json                            // which claims they can meet
  offersSample  Boolean @default(false)
  pitch         String                          // short "why us" — capped
  createdAt DateTime @default(now())
  @@unique([briefId, partnerId])
  @@index([briefId, status])
}

model CoCreationRoom {
  id           String @id @default(uuid())
  briefId      String @unique
  partnerId    String                           // the selected maker
  status       RoomStatus @default(ACTIVE)
  ndaSignedAt  DateTime?
  objects      BuildObject[]
  milestones   RoomMilestone[]
  messages     RoomMessage[]
  events       RoomEvent[]                       // decision log
  createdAt DateTime @default(now())
}

model BuildObject {
  id          String @id @default(uuid())
  roomId      String
  kind        BuildObjectKind
  status      BuildObjectStatus @default(DRAFT)
  currentVersion Int @default(1)
  versions    BuildObjectVersion[]
  comments    BuildObjectComment[]
  @@unique([roomId, kind])
}

model BuildObjectVersion {
  id         String @id @default(uuid())
  objectId   String
  version    Int
  payload    Json                                // recipe rows / label proof ref / pack spec
  submittedByPartner Boolean
  createdAt  DateTime @default(now())
  @@unique([objectId, version])
}

model BuildObjectComment {
  id        String @id @default(uuid())
  objectId  String
  anchor    String?                              // formula line key OR label pin "x,y"
  authorRole String                              // CREATOR | PARTNER
  body      String
  resolved  Boolean @default(false)
  createdAt DateTime @default(now())
}

model RoomMilestone {
  id        String @id @default(uuid())
  roomId    String
  kind      MilestoneKind
  status    MilestoneStatus @default(PENDING)
  amount    Decimal
  stripeRef String?                              // via packages/payments (escrow)
  releasedAt DateTime?
}

model RoomMessage { id String @id @default(uuid()) roomId String authorRole String body String createdAt DateTime @default(now()) }
model RoomEvent   { id String @id @default(uuid()) roomId String kind String data Json createdAt DateTime @default(now()) } // decision/activity log
```

**Reuse, don't duplicate:** on `CLOSED_WON`, the approved `RECIPE` BuildObject payload materializes into the existing `Recipe` + `RecipeIngredient` models and an `Order` via `packages/orders` — do not fork recipe storage. The room's recipe form **is the same schema** the partner Add-Product flow uses.

---

## 7. Structured build objects (the moat) — reuse Add-Product forms

- The manufacturer submits a recipe/label/packaging using the **exact forms from the partner New-Product builder** (`apps/partner/src/app/(dashboard)/products/new/*` — HOT ZONE, single-writer). Extract those form bodies into shared components in `packages/ui` so the room and the builder render the same fields. This is the key reuse win and the reason submission feels native to makers.
- Object states + versioning per §5; comments anchor to a formula line key or a label pin coordinate.
- **Label proofing** = pinned annotations + version compare (Frame.io/Ziflow pattern in prototype screen ⑥). Creator can also self-design on the maker's dieline via the Design Studio bridge (V1.5).

---

## 8. Matching & fit engine

- Reuse `packages/marketplace` (`suggestNiches()` + capability signals) to compute `BriefInterest.fitScore` and to decide which briefs surface in a partner's pool.
- **Hard filters** (never weighted): niche eligibility, temp-class/hazmat capability, allergen/cert gates, MOQ floor. (Mirror the logistics rule: temp class + hazmat are HARD filters — `LOGISTICS_AND_FULFILLMENT.md`.)
- **Weighted score:** capability match, format match (e.g., can vs glass), volume vs capacity, merit/rating (Bayesian, `FEEDBACK_MODULE.md`), location bias.
- Ranking in the creator's shortlist blends fit + merit + track record — **not price alone**.

---

## 9. Trust, IP, staged reveal, escrow

- **Staged reveal:** public brief projection excludes `privateFormula`, `privateNotes`, private attachments. These reveal **only** after selection + mutual NDA, inside the room. Enforce with a server-side projection function; never send private fields to the pool/interest APIs.
- **NDA ≠ ownership.** On room creation: auto **mutual NDA** (confidentiality) **plus** explicit IP terms — creator owns recipe/brand/label; maker background IP stays theirs; improvements assigned per policy. Counsel dependency: coordinate with `docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md` (same anti-circumvention / e-sign concerns as nomination D7 — **do not ship IP/NDA copy without counsel sign-off**).
- **Milestone escrow** via `packages/payments` (Stripe Connect + escrow). Milestones: Discovery → Sample → Tooling → Production. Funds held; released on creator approval of the tied object. Decision log (`RoomEvent`) is the dispute evidence trail.
- **Anti-disintermediation:** in-room actions must be *easier and safer* than email; tie escrow, IP protection, and dispute support to staying on-platform.

---

## 10. Surfaces & routes (per app)

| App (port) | Route | Screen | Prototype ref |
|---|---|---|---|
| `apps/marketing` (3010) | `/launch/co-create` | Explainer / entry | strategy brief |
| `apps/creator` (3000) | `/products/new/brief` | **Brief Builder** (two doors + wizard + live preview) | screen ① |
| `apps/creator` (3000) | `/briefs/[id]/interests` | **Shortlist & Selection** (compare + select) | screen ③ |
| `apps/creator` (3000) | `/rooms/[id]` | **Collaboration Room** (creator view) | screen ④/⑤/⑥ |
| `apps/partner` (3002) | `/opportunities` | **Opportunity Pool** (matched feed + Express Interest) | screen ② |
| `apps/partner` (3002) | `/rooms/[id]` | **Collaboration Room** (maker view) | screen ④ |
| `apps/admin` (3003) | `/briefs`, `/rooms`, `/co-create/disputes` | Oversight (v2 pattern) | — |

Cross-app links use `marketingUrl()` / `creatorUrl()` / `partnerUrl()` + plain `<a href>` (never `<Link>` across apps). Admin pages MUST follow the v2 surface pattern (`bg-[var(--bg-hero)]` hero band, KPI strip, URL-driven filter chips, sortable table, RowActionsMenu, 50/page) — use `v2-admin-surface-builder`.

---

## 11. Package reuse map

| Need | Package | Notes |
|---|---|---|
| State machines | `packages/orders` | New `brief-fsm.ts`, `room-object-fsm.ts` alongside existing `*-fsm.ts` |
| Audit trail | `packages/audit` | Every mutation; add co-creation entity types in `src/types.ts` |
| Notifications | `packages/notifications` | New categories: interest received, shortlisted, selected, object submitted, approval requested, milestone released (align with `seed-notification-categories.ts` — `proofs`, `orders`) |
| Payments/escrow | `packages/payments` | Milestone escrow on Stripe Connect |
| Ownership/tenant guards | `packages/auth` | Centralized guards — creator owns brief/room; partner owns interest; **no ad-hoc checks** (`SECURITY_ARCHITECTURE.md`, threat #1) |
| Fit/matching | `packages/marketplace` | `suggestNiches()` + capability signals → `fitScore` |
| Ratings/merit | feedback modules | Blend into shortlist ranking (`FEEDBACK_MODULE.md`) |
| Sample logistics | `packages/shipping` | V1.5 — sample shipment + tracking |
| Label compliance | `packages/compliance` | V1.5 — pre-check label object |
| Shared form bodies | `packages/ui` | Extract recipe/label/pack forms from partner builder for room reuse |

---

## 12. Notifications (events → categories)

`interest.received` (→ creator), `interest.shortlisted` / `interest.selected` / `interest.passed` (→ partner), `object.submitted` / `object.changes_requested` / `object.approved` (both), `milestone.funded` / `milestone.released` (both). Route through `packages/notifications` dispatcher; respect the preference matrix.

---

## 13. Security

- **Tenant isolation is threat #1.** Every server action uses centralized ownership guards in `packages/auth`. A partner may only read a brief's **public projection** until selected; the private formula is gated on room membership + NDA.
- Watermark/log any export of the raw formula from the room (need-to-know).
- Rate-limit Express-Interest to keep the pool clean; verified-partner gate on the pool.

---

## 14. Analytics / success metrics

Emit events for: brief posted, interests per brief, time-to-first-interest, shortlist size, selection rate, room activation, object approval cycles, milestone release, brief→production conversion. These validate liquidity (cold-start risk) and the funnel.

---

## 15. Open decisions (need Pavel before/within build)

- **D-CC1 — Fee model:** platform take-rate % on milestones vs. partner pool subscription vs. both. (`packages/plans` / `PARTNER_TIER_VS_MERIT.md` alignment.)
- **D-CC2 — Interest limits:** max concurrent interests per partner per tier; anti-spam throttle.
- **D-CC3 — Reversibility:** can a creator switch makers after selection but before the Sample milestone? (Prototype implies yes.)
- **D-CC4 — IP/NDA copy:** blocked on counsel (D7 cluster). Ship room with placeholder + gate go-live on legal.
- **D-CC5 — `uuid` vs `cuid`:** confirm new-model id default (CLAUDE.md says `uuid`; legacy models use `cuid`).
- **D-CC6 — Merit in matching weight:** how heavily merit/rating ranks the pool + shortlist.
- **D-CC7 — Category scope for launch:** concierge-MVP in ONE category first (recommend Functional & Wellness Beverages) vs. all 13.

---

## 16. Build checklist

**P0 — Concierge MVP (prove the loop, one niche/category):**
- [ ] Schema: `ProductBrief`, `BriefInterest`, `CoCreationRoom`, `BuildObject(+Version/Comment)`, `RoomMilestone`, `RoomMessage`, `RoomEvent` + enums (`prisma-migrator`; `db:push` → `db:generate` → clear `.next`).
- [ ] `brief-fsm.ts` + `room-object-fsm.ts` in `packages/orders` (+ tests) with audit writes.
- [ ] Creator **Brief Builder** (`/products/new/brief`) — two doors, wizard, live preview, private-field split. Match prototype ①.
- [ ] Public-projection function (staged reveal) + fit routing (`suggestNiches`).
- [ ] Partner **Opportunity Pool** (`/opportunities`) + **Express Interest** (terms only). Match prototype ②.
- [ ] Creator **Shortlist & Selection** (`/briefs/[id]/interests`) + select → NDA + room + milestone-1 escrow. Match ③.
- [ ] **Collaboration Room** (both views) — objects, versioning, comments, approve/request-changes, decision log, messages. Reuse Add-Product form bodies. Match ④/⑤/⑥.
- [ ] Notifications for the P0 events.
- [ ] Admin: `/briefs` + `/rooms` (v2 pattern, read-only oversight).

**P1 — Self-serve + escrow depth:** milestone escrow (Discovery→Production) + release-on-approval; two-sided reviews into ranking; dispute surface; open 2nd/3rd category.

**P2 — Scale/moat:** AI brief-assist (V1.5), label compliance pre-check, self-design on dieline, sample logistics, then V2 pooling + multi-partner graph.

---

## 17. Acceptance (P0 "done")

A creator posts a brief (either door) → it surfaces to ≥1 matched verified partner → partner expresses interest (no formula leaked) → creator shortlists, compares, selects → NDA + room + escrowed Discovery milestone → maker submits a recipe object → creator approves/requests changes → decision log + audit rows exist for every transition → on approval the recipe materializes into `Recipe`/`RecipeIngredient` and an `Order` draft. Tenant-isolation tests pass (a non-member partner cannot read private formula).

---

## 18. References

- **Prototype (UX contract):** `iLaunchify-cocreation-demo.html` (repo root) · mirror `design/co-creation-demo.html`
- **Strategy / market research:** `design/co-creation-strategy-brief.html`
- **Conventions:** root `CLAUDE.md`, `AGENTS.md`, `packages/ui/registry.json`
- **Adjacent specs:** `PLATFORM_SPEC.md`, `MARKETPLACE_DESIGN.md`, `PRODUCTION_ORCHESTRATION.md`, `MULTI_PARTNER_APPROVAL_WORKFLOW.md`, `SECURITY_ARCHITECTURE.md`, `PARTNER_ONBOARDING_STRATEGY_2026-07.md`, `FEEDBACK_MODULE.md`, `LOGISTICS_AND_FULFILLMENT.md`, `legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md`
- **Subagents:** `prisma-migrator`, `partner-editor-card-builder`, `v2-admin-surface-builder`, `marketplace-taxonomy-guardian`
