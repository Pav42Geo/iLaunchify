# Partner Lifecycle FSM — 4 open decisions

**Status:** DRAFT for Pavel · created 2026-07-06 · blocks flipping `pnpm check:invariants --strict`
**Context:** The build-monitoring work left exactly 4 invariant warnings, all partner-status transitions that bypass the FSM. They are **not** independent bugs — they are four symptoms of **one unresolved question**, plus a duplicate submit path. This doc frames the root question, recommends a model, and gives the exact edit for each of the four once you decide.

Nothing here changes behavior yet. These sites all currently work; they just route around `assertPartnerTransition`, so the checker can't prove they're legal.

---

## The root question

The **canonical model** (`PartnerStatus` enum + `PARTNER_ALLOWED_TRANSITIONS`) is `LEAD`-first:

> `LEAD → IDENTITY_PENDING_REVIEW → IDENTITY_VERIFIED → OPS_PENDING_REVIEW → OPERATIONALLY_CONFIGURED → ACTIVE`

But the **actual code** runs a *pre-`LEAD` invite handshake* using statuses the canonical model calls "legacy":

| Step | Where (code) | Status move |
|---|---|---|
| Lead applies (public form) | `partners/apply/actions.ts` | → `DRAFT` (or `LEAD`) |
| Admin qualifies / invites | `admin/leads/[leadId]/actions.ts:30`, `admin/partners/actions.ts:65` | → **`INVITED`** |
| Partner's first login | `(onboarding)/layout.tsx:21` | `INVITED` → **`IN_PROGRESS`** |
| Partner submits onboarding | `onboarding/actions.ts:369` **and** `onboarding/review/actions.ts:30` | → `IDENTITY_PENDING_REVIEW` **or** `UNDER_REVIEW` |

So `INVITED` and `IN_PROGRESS` are **live operational states** in the real flow, but the canonical table treats them as legacy (source-only) — which is exactly why guarding these four sites would throw.

**Decision 0 (the one that resolves the rest): is the invite handshake canonical or legacy?**

**Model A — Bless the handshake (recommended).** Accept that the real lifecycle starts before `LEAD`:
`DRAFT → INVITED → IN_PROGRESS → IDENTITY_PENDING_REVIEW → …`. Add those edges to `PARTNER_ALLOWED_TRANSITIONS`. Minimal code churn — you're documenting what already happens. Cost: the "10-state model" is really ~13 states; the "legacy" label on those enum values is wrong and should be dropped.

**Model B — Collapse to LEAD-first.** Retire `INVITED`/`IN_PROGRESS`/`DRAFT`/`UNDER_REVIEW`. "Invite" becomes `LEAD` + an `invitedAt` timestamp; first login stops mutating status; both submit paths go to `IDENTITY_PENDING_REVIEW`. Cleaner end-state, but a real refactor: data migration for existing rows in legacy states, plus touching the onboarding gating that reads `IN_PROGRESS`.

**Recommendation: Model A.** It matches the operational-trust principle (schema preserves the distinctions that already exist; don't refactor a working flow to satisfy a diagram). Model B is a fine V2 cleanup once partner volume justifies a migration. Everything below assumes A; each item notes the B variant.

---

## Decision 1 — Admin "invite" target (`leads:30` + `partners:65`)

**Now:** both flip `→ INVITED` (leads from `DRAFT`/`INVITED`; partners re-invite from any non-`ACTIVE`). Both already write AuditLog. They only trip the FSM invariant.

**Question:** is `INVITED` a legal target, or should invite go somewhere canonical?

- **Model A:** yes — add edges `DRAFT → INVITED` and `LEAD → INVITED` (+ allow `INVITED → INVITED` re-invite; the `from===to` short-circuit already covers it). Then add `assertPartnerTransition(partner.status, 'INVITED')` before each update. One line each.
- **Model B:** invite target becomes `LEAD`; set `invitedAt` instead; guard `→ LEAD`.

**Recommended:** Model A. Edit `PARTNER_ALLOWED_TRANSITIONS`:
```ts
DRAFT:   ['INVITED', 'IDENTITY_PENDING_REVIEW', 'TERMINATED'],
LEAD:    ['INVITED', 'IDENTITY_PENDING_REVIEW', 'TERMINATED'],
INVITED: ['IN_PROGRESS', 'LEAD', 'IDENTITY_PENDING_REVIEW', 'TERMINATED'],
```
then guard both admin sites.

---

## Decision 2 — First-login flip in a render (`layout.tsx:21`)

**Now:** the onboarding **layout** (a Server Component) does `INVITED → IN_PROGRESS` on first render. Two problems: (a) it bypasses the FSM + writes no audit, and (b) **mutating in a layout render is a smell** — it fires on any render, isn't a user action, and can double-fire.

**Question:** keep the auto-advance, and if so where?

- **Recommended:** move it into a tiny server action (`markOnboardingStarted`) called from the onboarding entry, or fold it into the first onboarding step-save. Guard `INVITED → IN_PROGRESS` (add the edge per Decision 1) + `logAuditAs`. Removes the render-time write entirely.
- **Cheaper interim:** leave it in the layout but wrap the mutation in the guard + audit and add an idempotency check. Still not ideal (write-in-render remains).
- **Model B:** delete the flip; first login doesn't change status.

**Recommended:** move to a server action. This is the only one of the four that's a genuine (small) refactor rather than a one-liner.

---

## Decision 3 — Duplicate submit path (`onboarding/review/actions.ts:30`)

**Now:** there are **two onboarding UIs**, and `onboarding/page.tsx`'s own header comment documents it: *"Legacy step pages at /onboarding/company, /service, /documents, /stripe, /review still exist for back-compat but the primary UX is now this accordion."*

- **New — accordion** (`/onboarding`, `page.tsx` → `OnboardingAccordion.tsx` → `onboarding/actions.ts:326 submitForReview()`) → **`IDENTITY_PENDING_REVIEW`**. Primary UX. Now guarded + audited.
- **Legacy — step wizard** (`/onboarding/company → service → documents → stripe → review`; the final `/onboarding/review` step's `SubmitForReviewButton.tsx` → `onboarding/review/actions.ts:30 submitForReview({partnerId})`) → **`UNDER_REVIEW`**. No guard; audit was just added. `review/page.tsx` even keys its "already submitted" copy off `partner.status === 'UNDER_REVIEW'`.

This is **active drift**: both UIs are still routable, so which review state a partner lands in depends on whether they finished via the new accordion or the old wizard's `/review` step — an inconsistency the admin review queue absorbs.

**Question:** is the legacy step-wizard retired, and where does its `/review` submit go?

- **Recommended:** the accordion → `IDENTITY_PENDING_REVIEW` is canonical. Then either **(a)** retire the legacy wizard's back-compat pages (`company/service/documents/stripe/review`) if the accordion has fully replaced them — removing `SubmitForReviewButton` + `review/actions.ts` and letting `UNDER_REVIEW` die; or **(b)** if the wizard is still a supported path, repoint `review/actions.ts submitForReview` to `IDENTITY_PENDING_REVIEW` (guarded) and fix `review/page.tsx`'s status check. Either way `UNDER_REVIEW` stops being a submit target.
- **Model B:** same conclusion; `UNDER_REVIEW` retired outright.

**Recommended:** consolidate to `IDENTITY_PENDING_REVIEW`; choose (a) retire vs (b) repoint the legacy wizard based on whether those step pages are still part of the supported onboarding IA — a UX call, since both are live.

---

## Decision 4 (bookkeeping) — the "legacy" label

If you pick **Model A**, the enum comment calling `DRAFT/INVITED/IN_PROGRESS/UNDER_REVIEW` "Phase-A legacy values" is misleading — `INVITED`/`IN_PROGRESS` are canonical. Recommend: keep the enum values, update the comment in `schema.prisma` + `partner-fsm.ts` to mark `INVITED`/`IN_PROGRESS` as **canonical early-lifecycle**, and reserve "legacy" for `UNDER_REVIEW` (retired per Decision 3) and any truly dead value.

---

## Once you decide (→ flip `--strict`)

Assuming the recommended path (Model A + consolidate submit):

1. Add the three edges to `PARTNER_ALLOWED_TRANSITIONS` (`packages/orders/src/partner-fsm.ts`) — Decision 1.
2. Guard the two admin invite sites with `assertPartnerTransition` — Decision 1.
3. Move the first-login flip to a server action, guarded + audited — Decision 2.
4. Repoint `review/actions.ts` to `IDENTITY_PENDING_REVIEW` (or delete it) — Decision 3.
5. Update the enum/FSM comments — Decision 4.
6. `pnpm check:invariants` → 0 warnings → change CI + husky to `check:invariants --strict`.

Estimated effort: ~30–45 min once the model is chosen. Items 1, 2, 4 are one-liners; item 3 is a small function extraction; item 3/Decision-3 may just be a deletion.

**Open sub-question for you (Decision 3):** is the `(onboarding)/onboarding/review/` screen (`SubmitForReviewButton`) still part of the onboarding IA, or has the accordion replaced it? If replaced → delete the `review/` action + button. If still used → repoint it to the canonical `submitForReview()`. It is confirmed **live** (wired to a button), so this is not a silent-dead-code removal — check the UX before deleting.
