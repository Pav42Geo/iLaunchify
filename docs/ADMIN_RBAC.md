# Admin RBAC — scoped support-team access

Status: SPEC (Pavel locked the 4 shaping decisions 2026-06-21; not yet built).
Owner surface: `apps/admin` + `packages/auth` + `packages/db`.
Builds on docs/SECURITY_ARCHITECTURE.md (LOCKED 2026-06-05) — tenant isolation is
threat #1; new server actions use centralized guards, never ad-hoc checks.

## Problem

`UserRole` is `ADMIN | CREATOR | PARTNER`. Admin pages gate on
`requireRole('ADMIN')` — binary. **Every admin is therefore a superadmin.** We
need a support team that can work tickets (and read order/partner context) while
being fenced out of money, platform config, partner approval, compliance/legal,
and admin-team management.

## Locked decisions (Pavel 2026-06-21)

1. **Named role presets** — a fixed set of roles, each a fixed capability bundle.
   NOT per-person custom capability grants (deferred; see Extensibility).
2. **Refunds = propose → lead approves** — agents can request a refund/goodwill
   credit on a ticket; it stays pending until a Lead/Billing admin approves.
   (Aligns with "operational trust > margin optimization in V1".)
3. **Read-only, full detail** — agents see amounts, payout, contact info as
   read-only. We rely on the role fence + audit, NOT field redaction.
4. **Spec first** — this doc, to lock before code.

## Model: capabilities, roles are presets

The enforcement primitive is a **capability** (`tickets:write`, `billing:write`,
…). A **role is a named bundle of capabilities** — exactly how creator/partner
tiers map to feature gates today. Roles are for humans; capabilities are what the
guards actually check.

`User.role = ADMIN` stays the app boundary (which app you can sign into). A new
nullable `User.adminRole` refines what an ADMIN can do. Capability sets live in
**code** (`ROLE_CAPABILITIES`), so there's no join table and no migration churn
when we tune them.

### Capability taxonomy (namespaced `module:verb`)

| Capability | Gates |
|---|---|
| `tickets:read` / `tickets:write` | View / reply-assign-transition-attach on support tickets |
| `tickets:admin` | Ticket categories, saved replies, Support Policy (SLA/tiers) |
| `orders:read` | Read orders + dispatches (context for a ticket) |
| `orders:write` | Admin order mutations (reroute, cancel review) |
| `refunds:propose` | Request a refund / goodwill credit (pending) |
| `refunds:approve` | Approve a pending refund/credit |
| `refunds:execute` | Directly issue a refund (no approval) |
| `creators:read` / `partners:read` | Read creator/partner records |
| `partners:approve` | Verification, activation, strikes |
| `reviews:write` | Operational queues: product approvals, cert reviews, ingredient queue, packaging/accessory/phrase review |
| `catalog:write` | LOCKED taxonomy: marketplace, niches, categories, lifestyle tags, packing types |
| `assets:write` | Asset libraries (symbols, mockups, fonts, graphics, dielines) |
| `academy:write` | Academy courses/lessons/topics |
| `billing:read` / `billing:write` | Fees & commissions, Order Settings, routing, shipping, payments/payouts |
| `tiers:write` | Creator tier management (money) |
| `compliance:read` / `compliance:admin` | Document access log, label-claim consents, erasure requests, sub-processors (legal) |
| `users:admin` | **Admin team management — assign admin roles** (most sensitive) |
| `security:admin` | Security settings, rate-limit config |
| `audit:read` | Audit logs |

### Role → capability matrix (V1 presets)

| Role | Capabilities | Backfill |
|---|---|---|
| `SUPPORT_AGENT` | tickets:read/write, orders:read, creators:read, partners:read, refunds:propose, audit:read | — |
| `SUPPORT_LEAD` | …agent + tickets:admin, refunds:approve, orders:write, **billing:read**, **reviews:write** | — |
| `BILLING_ADMIN` | billing:read/write, tiers:write, refunds:approve/execute, orders:read, audit:read | — |
| `SUPER_ADMIN` | `*` (all) | **existing admins backfilled here** |

The matrix is one code table; add roles (e.g. `REVIEW_OPS` for the approval
queues, `CATALOG_ADMIN` for taxonomy) without schema changes.

## Enforcement — 3 layers (mirrors Tier 0/1)

1. **Page + server-action guard — THE security boundary.** New
   `requireCapability(cap)` in `packages/auth` (calls `requireRole('ADMIN')`,
   loads `adminRole`, checks `ROLE_CAPABILITIES[role]` includes `cap`; redirect
   `/login?error=forbidden` on miss). Every admin loader/action gets the right
   capability. This is what actually stops an agent calling a refund/settings
   action. (~77 `requireRole('ADMIN')` call sites — migrate by sensitivity, see
   Rollout; the un-migrated ones keep the old coarse gate meanwhile.)
2. **Sidebar filtering — UX only.** `sidebar-config.ts` nav items gain an
   optional `capability` field; the renderer hides items the viewer lacks.
   Never the security layer — just keeps the console uncluttered.
3. **Middleware path-prefix gate — defense in depth.** Coarse edge check: e.g.
   `/settings/*`, `/users-roles/admins`, payments routes require an elevated cap.
   Backs up layer 1; can't do per-row, so layer 1 remains authoritative.

## Refund propose → approve flow

Reuse existing refund infra (`planRefund` engine, gated `executeOrderRefund`,
`OrderDispute`/cancellation paths) — do NOT build a parallel money path.

- Agent (with `refunds:propose`) on a ticket → `proposeRefund({ orderId,
  amountCents, reason, ticketId })` writes a **pending** `SupportRefundRequest`
  (additive model: requester, order, amount, reason, status PENDING/APPROVED/
  REJECTED, linked ticket) + a `TicketEvent` + `AuditLog`. No money moves.
- Lead/Billing (with `refunds:approve`) sees pending requests (a queue +
  inline on the ticket) → `approveRefund(id)` calls the existing gated
  `executeOrderRefund` (still behind `STRIPE_REFUNDS_ENABLED`), or `rejectRefund`.
- Everything audited; the ticket thread shows "Refund requested → approved by X".

(Open: a configurable small auto-approve cap is a fast-follow, not V1 — Pavel
chose strict propose→approve.)

## Audit

`AuditLog` already has `actorId` + `actorRole` (the coarse `AuditActorRole`). Add
nullable `actorAdminRole AdminRole?` so "which kind of admin did this" is
answerable. The admin-team page (assign roles) is itself audited under a new
`AdminRole` / `User` entity action.

## Admin team management UI (SUPER_ADMIN only, `users:admin`)

`/users-roles/admins` v2 surface: list admins + their role chip; assign/change
role (dropdown); invite (creates an ADMIN user with a chosen `adminRole`, never
SUPER_ADMIN by default). Every change audited. New admins default to **least
privilege** — they get nothing until explicitly elevated.

## Schema (all additive — CockroachDB-safe, no DROP)

```prisma
enum AdminRole { SUPPORT_AGENT SUPPORT_LEAD BILLING_ADMIN SUPER_ADMIN }

model User {
  // …
  adminRole AdminRole? // only meaningful when role = ADMIN; null elsewhere
  // adminCapabilityOverrides String[]  // deferred (per-person grants)
}

model AuditLog { /* … */ actorAdminRole AdminRole? }

model SupportRefundRequest {
  id        String   @id @default(uuid())
  orderId   String
  ticketId  String?
  requestedById String
  amountCents Int
  reason    String
  status    RefundRequestStatus @default(PENDING)
  decidedById String?
  decidedAt DateTime?
  createdAt DateTime @default(now())
  // relations + @@index([status]) …
}
enum RefundRequestStatus { PENDING APPROVED REJECTED }
```

**Backfill migration:** set `adminRole = SUPER_ADMIN` for every existing
`role = ADMIN` user, so current behavior is 100% preserved on day one.

## packages/auth additions

```
export type Capability = 'tickets:read' | 'tickets:write' | … // union
export const ROLE_CAPABILITIES: Record<AdminRole, Capability[] | '*'>
export function hasCapability(user, cap): boolean         // pure
export async function requireCapability(cap): Promise<User> // guard
export async function getAdminCapabilities(user): Capability[]
```

Unit-test the matrix (every role → expected caps; `SUPER_ADMIN` ⊇ all; agent
excludes billing/users/security) the same way the FSM/tier tables are tested.

## P0 — SHIPPED (2026-06-21, sandbox-verified)

Substrate only, zero behavior change. What landed:
- Schema: `AdminRole` enum + nullable `User.adminRole` (additive).
- `packages/auth/src/capability-rules.ts` — PURE matrix (zero imports):
  `Capability` union, `ALL_CAPABILITIES`, `ROLE_CAPABILITIES`,
  `resolveCapabilities`, `hasCapability`. 7-case vitest (`capability-rules.test.ts`),
  also node-verified (9/9).
- `packages/auth/src/capabilities.ts` — `requireCapability(cap)` server guard
  (re-exports the rules). Cast-guarded prisma read (**ADMIN-RBAC-CAST**).
- Exported from `@ilaunchify/auth`.
- `null` adminRole → SUPER_ADMIN, so existing admins are unaffected before the
  backfill even runs.

### Mac steps
```bash
pnpm db:push           # additive: AdminRole enum + User.adminRole (decline reset)
pnpm db:generate
rm -rf apps/*/.next     # transpilePackages stale-client gotcha
# backfill existing admins to SUPER_ADMIN (explicit, belt-and-suspenders):
#   UPDATE "User" SET "adminRole" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN' AND "adminRole" IS NULL;
pnpm --filter @ilaunchify/auth test   # capability matrix
```
Post-generate: drop the **ADMIN-RBAC-CAST** in `capabilities.ts` (plain
`prisma.user.findUnique({ where:{id}, select:{ adminRole:true } })`).

## Rollout (phased; each phase ships green + audited)

- **P0 — substrate (no behavior change):** ✅ shipped (above).
- **P1 — lock the sensitive set:** `requireCapability` on Settings/* (fees,
  tiers, order settings, routing, shipping), Users & Roles/admins,
  Compliance & Data Rights, partner approval, refund/payout actions, security.
  Sidebar filter. This alone delivers the fence.
- **P2 — support-agent surfaces:** confirm tickets + read-only orders/creators/
  partners work end-to-end for `SUPPORT_AGENT`; tighten any write actions.
- **P3 — refund propose→approve:** `SupportRefundRequest` + actions + ticket
  surface + lead queue.
- **P4 — admin team page:** assign roles + `actorAdminRole` audit + middleware
  path-prefix gate.

## Extensibility (deferred, no-regret hooks)

- Per-person capability overrides (`adminCapabilityOverrides String[]`) — land
  the column when a real exception appears.
- More roles (`REVIEW_OPS`, `CATALOG_ADMIN`) — pure code additions to the matrix.
- "View as creator/partner" impersonation — explicitly OUT of V1 (audit + abuse
  surface); revisit separately.

## Resolved (Pavel 2026-06-21)

1. **Review queues** (product approvals, cert/ingredient/packaging review) →
   `SUPPORT_LEAD` + `SUPER_ADMIN` own them via `reviews:write`. A dedicated
   `REVIEW_OPS` role stays a clean later add (pure matrix addition).
2. **Support Lead gets read-only billing** (`billing:read`) — can answer payout
   questions, cannot change fees/tiers/settings.

## Still open

3. Invite flow: email invite + set-password, or create-then-share-credentials?
   (Touches the prohibited "create accounts / set passwords" area — the human
   completes credential setup; we only assign the role.) Doesn't block P0–P2.
