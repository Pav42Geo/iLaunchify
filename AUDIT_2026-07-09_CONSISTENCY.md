# iLaunchify Platform Consistency Audit — 2026-07-09

**Scope:** whole monorepo (`apps/{admin,creator,partner,marketing}` + `packages/*` + `services/*`), focused on **inconsistency in values, enums, and schemas**, plus a broader code-health pass on "what else should we be watching." Read-only. Excludes `node_modules`, `.next`, `FOD-reference`, `docs`.

**Method:** ran the existing deterministic guard (`scripts/check-invariants.mjs` — all 5 invariants pass), then four independent deep-search passes (enum drift, numeric/config drift, schema conventions, general code-health). The three highest-stakes findings below were re-verified by hand against source.

**Bottom line:** the mechanical invariants are healthy and type discipline is genuinely strong. The real exposure is concentrated in **four places**: (1) a live disagreement between the production fee *advertised* and the fee *charged*; (2) 136 tables on `cuid()` against a documented `uuid()` mandate — a CockroachDB write-hotspot risk on the hottest tables; (3) zero tests on `audit`/`security`/`compliance-client`; (4) a dev-login bypass load-bearing in the real signup/login path. Everything else is duplication/convention debt worth cleaning before it grows.

---

## CRITICAL / HIGH — act on these

### H1 · Advertised creator fee (15/12/8%) ≠ fee actually charged (5%) — **verified**
The creator subscription page sells a tier-tapered production fee, but checkout charges a flat 5% and never applies the tier discount the creator is paying for.

- **Advertised:** `apps/creator/src/app/(dashboard)/subscriptions/page.tsx:41,56,72` → `feePct: 0.15 / 0.12 / 0.08`; line 87 renders the table row `'15%' '12%' '8%'`; line 232 "% production fee". Also `settings/plan/page.tsx:86` ("12% platform fee") and `PlansSavingsCalculator.tsx:17`.
- **Charged:** `apps/creator/src/app/(checkout)/products/[productId]/checkout/cart-actions.ts:76` → `const PLATFORM_FEE_BPS = 500` (5%); the checkout uses `orderSettings.productionFeeBps ?? PLATFORM_FEE_BPS` and then layers the *manufacturer's* merit badge (4.5/2.5/0), **never** the creator's 15/12/8 tier rate.
- **Why it matters:** a Maker is quoted 15% and billed 5%; the paid tier discount (15→12→8) is not applied at the money seam at all. This needs an explicit decision on which number is canonical, then derive the other. (The seeded creator FeeRules at 15/12/8 in `seed-subscription-plans.ts:73,95,117` are consumed by the *marketplace quote* path in `apps/marketing/src/lib/pricing.ts:466`, deepening the split.)

### H2 · Partner plan FeeRule seed (15/12/8%) contradicts canonical merit fees (4.5/2.5/0%) — **verified**
- Canonical partner fees: `packages/orders/src/merit.ts:105` `{ VERIFIED: 450, TRUSTED: 250, PREMIER: 0 }` (bps), mirrored in `MeritPolicy` schema defaults. This is the live source.
- Contradicting seed: `packages/db/prisma/seed-subscription-plans.ts:159,188,217` seeds Verified/Trusted/Premier `production_order_subtotal` at **15% / 12% / 8%** ("commission"). The seed comment even says these "mirror the creator side" — i.e. stale copies of the *old* creator numbers.
- **Live leak:** `apps/admin/src/app/(dashboard)/tiers/PlansTab.tsx:151` renders partner commission as `meritFeeBps ?? productionFee.ratePercent` — when `meritFeeBps` is null it **displays 15/12/8%**, contradicting the 4.5/2.5/0 shown on the Merit console (`.../merit/page.tsx:43`). Two admin pages can show different partner fees for the same tier.
- **Fix:** delete or correct the partner FeeRule seed so it can't shadow the merit fees; make `PlansTab` fall back to the merit value, not the stale seed.

### H3 · 136 models use `@default(cuid())` against the documented `uuid()` mandate — **verified**
- Counts in `schema.prisma`: `cuid()` = **136**, `uuid()` = **84**. CLAUDE.md is explicit: *"id is `String @id @default(uuid())` not `cuid()` … (no sequential hotspots)."*
- The append-only, highest-insert tables are the offenders: `AuditLog` (`schema:4639` — hottest table in the system; a row per mutation), `Order` (`:2882`), `OrderDispatch` (`:3267`), `Notification` (`:4768`), `ShipmentLeg` (`:8810`), `NicheAssignmentAudit` (`:7602`).
- **Why it matters:** cuid v1 carries a leading monotonic component; on CockroachDB's range-partitioned KV that funnels inserts into one key range → single-range write hotspot, the exact failure `uuid()` was mandated to prevent. Newer models were fixed forward (a comment at `:5309` codifies the uuid convention) but 136 pre-existing tables were never backfilled.
- **Decision needed (Pavel):** backfill strategy vs. formally narrow the rule to "uuid for new models only" and add a `check-invariants` rule that fails on any *new* `cuid()`.

### H4 · Zero tests on `audit`, `security`, `compliance-client` (and `notifications`, thin `plans`)
- 112 test files overall, well-placed in `orders` (34), `nutrition` (7, FDA math), `shipping` (7). But:
  - `packages/audit` — **0 tests**. Every mutation is supposed to write an AuditLog row; the writer itself is unguarded. Forensic/compliance risk.
  - `packages/security` — **0 tests**. Tenant isolation is threat #1 per the security spec; the guards have no unit tests.
  - `packages/compliance-client` — **0 tests**. FDA surface.
  - `packages/notifications` — 0 `.test.` (only `.selftest.` files, not in the vitest suite). `packages/plans` — 1 (money-adjacent, thin).
  - Apps: `apps/partner` and `apps/marketing` have **0** test files despite partner carrying billing + dispatches + the product builder.
- **Fix:** prioritize `audit`, `security`, `plans`, `compliance-client` before launch — exactly the money/auth/compliance packages.

### H5 · `/api/dev/login` bypass is load-bearing in the real signup/login flow
- Exists in creator/partner/admin and directly encodes an Auth.js JWT cookie, skipping sign-in. It **is** env-guarded (`NODE_ENV === 'production'` → 403), but it's wired into real flows: `apps/creator/src/app/api/auth/signup/route.ts:88`, partner `signup/route.ts:92`, and `LoginForm.tsx:48`. `guest-gate-actions.ts:114` carries `TODO(prod): swap /api/dev/login for the real magic-link`.
- **Implication:** signup/login only actually work in non-prod today. Real auth (magic-link/passkey per `AUTH_ENTRANCE_SECURITY`) is unwired — treat as launch-blocking, and confirm `NODE_ENV` is authoritative in every deploy target.

---

## MEDIUM — clean up before it spreads

### M1 · Money represented in two incompatible units (cents vs Decimal dollars)
- Internal ledger is integer **cents** everywhere (~90 fields: `amountCents`, `subtotalCents`, `unitCostCents`…). But the channel layer stores **`Decimal @db.Decimal(10,2)` dollars**: `ChannelProductLink.price` (`schema:5281`), `ChannelVariantLink.price` (`:5338`), `ChannelOrder.totalPrice` (`:5371`), `ChannelOrderLine.unitPrice` (`:5398`).
- Any reconciliation of a channel order (dollars) into a production `Order` (cents) crosses a ×100/rounding boundary — a classic money-bug seam. These are the *only* Decimal money fields, so it's isolated and fixable.

### M2 · Fragmented creator-tier representation (3 shadow types, one latent billing bug)
Canonical is `TierKey = 'maker'|'builder'|'agency'` (`@ilaunchify/auth`), with `normalizeTier` bridging the UPPERCASE DB enum. But the concept is re-declared:
- `packages/support/src/intake-policy.ts:13` → `'MAKER'|'BUILDER'|'AGENCY'` (uppercase)
- `packages/imagegen/src/metering.ts:19` → `'maker'|'builder'|'agency'` (lowercase); `DEFAULT_TIER_LIMITS` is keyed lowercase. **If any caller passes a raw DB value (`'MAKER'`) without `normalizeTier`, `tierLimits()` spreads `undefined` → all generation/billing limits become `undefined`.** Only the compile-time type guards this.
- `apps/creator/src/app/(studio)/studio/ai-create/AiCreatePanel.tsx:42` → adds a non-canonical `'admin'` member.
- **Fix:** import `TierKey` from `@ilaunchify/auth` everywhere; delete the hand-rolled unions.

### M3 · Duplicate platform-fee constant + divergent rounding + a bypassed path
- `PLATFORM_FEE_BPS = 500` is hardcoded twice: `cart-actions.ts:76` and `channels/orders/route-actions.ts:24` (both self-flag "moves to PlatformFeeConfig").
- The channel-reorder path (`route-actions.ts:199`) does **not** read `getOrderSettings().productionFeeBps` and does **not** call `resolveOrderProductionFeeBps` — so admin fee changes and merit layering never reach channel reorders.
- Rounding differs for the *same* computation: checkout uses `Math.floor(...)` (`cart-actions.ts:636`), channel path uses `Math.round(...)` (`route-actions.ts:199`).

### M4 · Money formatters copy-pasted ~13× (rounding-divergence risk)
Same cents→"$" helper under different names with no shared util: `formatCents` / `usd` / `formatDollars` / `formatCurrency` / `money` / `fmtMoney` across `apps/creator` checkout (`OrderSummary.tsx:260`, `CheckoutStep.tsx:981`, `ProductionStep.tsx:662`, `SubscribeChoiceRail.tsx:620`), `apps/partner` (`billing/page.tsx:49`, `settings/storage/actions.ts:73`), `apps/admin` (`orders/[orderId]/page.tsx:1602`, `partners/[partnerId]/page.tsx:1320`), `packages/ui` (`FavoriteRow.tsx:51`, `ProductCard.tsx:110`). **Consolidate to one `formatCents` in `packages/ui` or `packages/plans`.** (Good news: fee *math* is single-source in `merit.ts` and tested — keep it that way.) Same pattern, lower stakes: 150 inline `toLocaleDateString` + 12 local `formatDate` helpers.

### M5 · Enum name collisions across differently-valued types
- `DisputeStatus`: the Prisma enum (`schema:512`) is the **Stripe** set `NEEDS_RESPONSE|UNDER_REVIEW|CHARGE_REFUNDED|WON|LOST`, but `apps/admin/.../disputes/page.tsx:19` declares a local `type DisputeStatus = OPEN|UNDER_REVIEW|RESOLVED|REJECTED` — actually the members of `OrderDisputeStatus` (`schema:3191`). Correct values, misleading name; easy to conflate.
- `TemplateStatus`: Prisma enum is `DRAFT|PUBLISHED|DEPRECATED` (backs `DesignTemplate`); `packages/notifications/src/center-types.ts:93` reuses the name for an in-memory `DRAFT|PUBLISHED` override. Different concept, shared name.
- `packages/payments/src/webhook-handlers.ts:440` casts `'CREATOR_PAYMENT_FAILED' as unknown as NotificationEvent` — forces an event that isn't in the enum. Reconcile the enum (payments path).

### M6 · Rate/percentage naming + representation drift (4 conventions for "a rate")
Within the schema the same "rate" concept appears as: `Bp` singular (`baseRateBp:585`, `feeRateOverrideBp:766,959`, `discountBp:2842`) vs `Bps` plural (`verifiedFeeBps:1517`, `productionFeeBps:3020`, …); as Int-percent with `Pct` (`capabilityWeightPct:3028`, `fcCostWeightPct:3060`, `slotSharesPct:1649`); as `Decimal(5,2)` `ratePercent:865`; and as `Float` `maxCoveragePct:2295`. Grep-hostile and easy to mis-scale. Pick one bps convention + one percent convention and document it.

---

## LOW — consistency/readability debt (correct today, will rot)

- **Duplicate/near-duplicate enums** worth consolidating: `NicheAssignmentSource` (`:7578`) is byte-identical to `PhraseAssignmentSource` (`:8179`); `PartnerCertInstanceStatus` (`:6100`) == `PartnerDocumentStatus` (`:7967`) member set; `TicketRequesterRole` == `PlanAudience` == `AcademyAudience` (`CREATOR|PARTNER`).
- **Packing/flavor taxonomy sprawl:** 5+ overlapping enums model one physical fact at different granularities — `ProductType` (`:1117`), `StructuralPackType` (`:1178`), `PackStructure` (`:1187`), `PackingType` (15 members, `:3862`), `FlavorArrangement`/`FlavorMode`/`LabelTopology`. Memory confirms a "15→6" consolidation in flight; all generations still coexist as live field types, so different code paths key off different enums. Finish the consolidation.
- **Content-lifecycle vocabulary drift:** 9+ `{DRAFT, PUBLISHED/ACTIVE, DEPRECATED/ARCHIVED/RETIRED/DISCONTINUED}` enums with slightly different terminal-state words. Publish a canonical `{DRAFT/ACTIVE/ARCHIVED}` + `{PENDING/APPROVED/REJECTED}` vocabulary to stop new near-duplicates.
- **Faithful-but-fragile shadow unions** (correct now, silently rot on enum change): `apps/creator/.../products/page.tsx:71` (`ProductStatus`/`ComplianceOutcome`), `packages/db/src/admin-invites.ts:8`, `packages/orders/src/sample-credit.ts:9`. Prefer `import type { X } from '@ilaunchify/db'` over hand-written unions.
- **Env-var name fragmentation:** the same host is read via 2–3 names — creator URL as `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_CREATOR_URL` / `CREATOR_LOGIN_HOST`; marketing as `NEXT_PUBLIC_MARKETING_URL`; partner/admin split between `*_LOGIN_HOST` (notifications) and `NEXT_PUBLIC_*_URL` (apps). Set one in prod, miss another → silent drift. (Ports themselves are consistent: creator 3000 / partner 3002 / admin 3003 / marketing 3010.)
- **React 18 vs documented React 19:** all four apps pin `react ^18.3.1`, but CLAUDE.md/memory say "React 19." Next 15.0.2 defaults to React 19 → you're on a supported-but-not-default combination and a docs/reality mismatch. `packages/ui/package.json` also lists `next` and `react` twice. Decide which is true and align.
- **Debug noise:** ~40 `console.error` in `apps/partner/.../products/new/build-actions.ts` alone — route through `packages/logger`.
- **Dead code in a money path:** `SubscribeChoiceRail.tsx:634` keeps a deprecated, unrendered component with `eslint-disable react-hooks/rules-of-hooks` "for reference" inside the checkout tree — delete it.
- **Minor schema gaps:** `ChannelOrderLine` (`:5390`) lacks createdAt/updatedAt while its siblings carry both; a write-in-render in `apps/partner/.../onboarding/layout.tsx:28`.

---

## What's genuinely healthy (verified, not assumed)

- **All 5 architecture invariants pass:** no `@db.Text`, no `@default(autoincrement())`, no `Int @id` outside legit config singletons, cross-app `<Link>` clean, server-action audit-write heuristic clean, FSM-bypass clean, Prisma client fresh.
- **Zero `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`** in the entire codebase; only 4 real `as any`. Uniform strict tsconfig (all 27 packages extend root; none relax `strict`/`noUncheckedIndexedAccess`/`noImplicitAny`).
- **No TypeScript `enum` shadows** of Prisma enums anywhere; status lifecycles centralized in FSM helpers with valid-member transition tables.
- **Fee/threshold config is well-centralized** where it counts: merit weights + thresholds (`merit.ts`), FC scorer weights (`order-settings.ts`), Bayesian prior (`partner-rating.ts`) — single-source and mostly tested. Timestamps consistent (`@default(now())` / `@updatedAt`). No dead enums found in a 45-enum sample.
- **Only 19 TODO/FIXME markers** total — very low for a platform this size.

---

## Recommended top-5, ordered by blast radius

1. **Reconcile the production fee** — decide whether creators pay 15/12/8% or 5%, make checkout apply the canonical number, and delete/fix the stale partner 15/12/8% FeeRule seed (H1, H2, M3).
2. **Add tests to `audit`, `security`, `plans`, `compliance-client`** before launch (H4).
3. **Wire real auth and retire `/api/dev/login`** from the signup/login path (H5).
4. **Decide the `cuid()` question** — backfill the hot tables to `uuid()` or narrow the rule + add a `check-invariants` guard on new `cuid()` (H3).
5. **Consolidate the ~13 money formatters** into one shared util and import `TierKey` everywhere (M4, M2).

*Two cheap, high-leverage guardrails to prevent regrowth: add invariant checks that fail on (a) any new `@default(cuid())` and (b) any new `Decimal` money field, and lint against hand-rolled tier unions / local money formatters.*
