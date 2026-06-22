# Admin RBAC — End-to-End Verification

Companion to `docs/ADMIN_RBAC.md`. Two layers of verification:

1. **Automated (logic):** `node scripts/verify-rbac.mjs` — proves each role's
   suggested preset yields the intended allow/deny across all 30
   capability-gated surfaces. Re-run any time you add a gate or change a preset.
   Last run: **all passed** (Agent 1/30, Lead 13/30, Billing 6/30, Super 30/30).
1b. **Unit suites:** `node scripts/run-pure-tests.mjs` — actually executes the
   `runAll()` aggregators that ship as type-check-only files: the RBAC capability
   matrix, admin-invite acceptance, ownership guards, partner-status FSM, and the
   niche + phrase suggestion engines. Zero install. Last run: all six suites passed.
2. **Manual (live):** the click-through below, run against the app on your Mac.

---

## Setup — create one test admin per role

You can't fully test the fence as Super admin (Super sees everything). Make a
disposable admin for each role:

1. Have (or sign up) three throwaway accounts, e.g. `agent@test.dev`,
   `lead@test.dev`, `billing@test.dev`.
2. **Admin → Users & Roles → Admins → Grant admin access** — enter each email,
   pick the matching role (Support agent / Support lead / Billing admin).
3. **Admin → Users & Roles → Roles & Permissions** — for each role click
   **Apply preset** (roles start empty, so without this they can do *nothing*).
4. Log in as each test account (separate browser / incognito) and walk its column.

> Reminder: your own backfilled account is `SUPER_ADMIN`, so it is the control —
> it should pass every "CAN" and have nothing fenced.

---

## What every admin can do (by design)

Read/list pages are intentionally open to **all** admin roles — agents get
read-only full detail (no field redaction; the fence is on writes + sensitive
modules, backed by audit). So for all roles, confirm they CAN reach:
dashboard, /orders (read), /creators (read), /partners (list/read), /audit,
/support-tickets (inbox + detail).

---

## Support Agent — expect **fenced to tickets + propose-only refunds**

CAN:
- Work tickets: open, reply, internal note, change status/assignee.
- On an Order-linked ticket, **propose** a refund (RefundPanel shows "Propose").

CANNOT (sidebar item hidden, and direct URL → redirected to `/login?error=forbidden`):
- `/order-settings`, `/tiers`, `/security`, `/settings/product-domains`,
  `/label-formats`, `/channels`, `/settings/support-policy`,
  `/support-tickets/refund-requests`, `/admins`, `/roles`.
- **Approve** a refund (RefundPanel shows propose only, no approve/reject).
- Approve/reject products, verify ingredients, review certs/packaging/accessories.
- Approve/verify/activate partners.

## Support Lead — expect **ops owner: refunds approve + review queues + partner approval**

CAN (everything Agent can, plus):
- **Approve / reject** refund requests; see the `/support-tickets/refund-requests` queue.
- Review queues: approve/reject **products**, verify **ingredients**, review
  **certificate requests**, set **cert-instance status**, review **accessories**,
  approve/reject **packaging**.
- Approve / verify / activate / strike **partners**.
- `/settings/support-policy` (edit tier SLA policy).
- Review **cancellations**.
- See `/orders` with write actions; **billing is read-only** (can read payout
  info, cannot change config).

CANNOT:
- `/order-settings` (billing:write), `/tiers` (tiers:write).
- Catalog writes: product marketing/marketplace/niches/phrases/lifestyle,
  certificate-type create/update, ingredient promote-to-library.
- `/channels`, `/settings/product-domains`, `/label-formats` (platform:admin).
- `/security`, `/admins`, `/roles`.

## Billing Admin — expect **money owner**

CAN:
- `/order-settings` (fees, routing, shipping, cancellation config).
- `/tiers` (+ plan / partner / creator tier pages) and all tier-write actions.
- **Approve / reject** refund requests; review cancellations.

CANNOT:
- Work tickets as admin (`tickets:admin`), review queues (`reviews:write`),
  catalog writes, platform config, security, or `/admins` + `/roles`.

## Super Admin — control

- Passes every CAN above. Nothing fenced. `/roles` editable for the other three
  roles; the Super column is always-on and disabled.

---

## Edge cases worth a click

- **Self-lockout guard:** as Super on `/admins`, your own row's role select is
  disabled ("Ask another super admin…").
- **Grant guard:** on `/admins`, granting admin access to a creator/partner
  email is rejected ("belongs to a creator/partner account").
- **Empty-role guard:** assign a role but DON'T apply its preset — that user
  should be denied every gated surface until you grant capabilities.
- **Refund money safety:** approving a refund runs the existing flag-gated
  `executeOrderRefund`. With `STRIPE_REFUNDS_ENABLED` unset/false it records the
  intent (dry-run) and does not move money. Confirm the audit row appears.
- **Audit trail:** each gated action writes an AuditLog row stamped with the
  acting admin's `actorAdminRole`. Spot-check `/audit` after a few actions.
