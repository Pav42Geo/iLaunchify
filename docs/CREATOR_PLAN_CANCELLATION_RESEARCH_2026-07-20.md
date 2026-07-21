# Creator plan cancellation: research + recommended build (2026-07-20)

Question asked: "There is no option today for Creators to cancel their plans through their accounts. What is the best functionality to build?"

## 0. Headline finding: the cancel path ALREADY EXISTS

The V1.5 tier work (`docs/builds/_V1.5_VELOCITY_PRICING.md`, tasks T4/T5) shipped a working period-end cancellation flow. Verified in the main tree today:

- `apps/creator/src/app/(dashboard)/settings/plan/page.tsx:372` renders `<CancelButton />` on the CURRENT tier card when the tier is Builder or Agency and no cancel is pending.
- `actions.ts` `cancelMyTierSubscription({reason?})` and `resumeMyTierSubscription()` wrap `packages/payments/src/tier-subscriptions.ts` `cancelTierSubscription` (Stripe `cancel_at_period_end: true`) and `resumeTierSubscription`.
- Webhook `customer.subscription.deleted` flips the profile to MAKER via `setCreatorTierWithAudit` at the actual period end; `customer.subscription.updated` mirrors the pending-cancel flag. Local mirror updates the UI immediately.
- Designer seats are auto-swept on downgrade (`enforceDesignerSeatCapForCreator` inside `setCreatorTierWithAudit`); other entitlements (brand caps, channel caps, fee bps) degrade lazily at their gates. Fee bps is snapshotted per order, so history is untouched.

### Why it can LOOK like there is no cancel option

1. **Admin-granted tiers have no Stripe subscription.** If a profile was promoted via admin (`setCreatorTierWithAudit`) or seed data, `stripeTierSubscriptionId` is null and `cancelMyTierSubscription` returns "No active tier subscription to cancel." The button still renders, then errors. Any internal test account set to Builder/Agency by hand will reproduce "creators can't cancel."
2. The Maker card for a paid user shows only a `DowngradeExplainer` ("cancel to drop back"); the actual button lives on the paid tier's own card, easy to miss.
3. The UX is placeholder: `window.confirm` + `window.prompt`, no modal, no toasts.

**First action before building anything: reproduce with a real Stripe-subscribed Builder account.** If cancel works there, this project is gap-closure, not greenfield.

## 1. Regulatory context (checked 2026-07)

- The FTC "Click-to-Cancel" (Negative Option) Rule was **vacated by the Eighth Circuit on 2025-07-08** on procedural grounds, so its specific mandates are not currently in force.
- The FTC **restarted rulemaking in March 2026** (ANPRM, comments due 2026-04-13). The same pillars are expected to return: clear disclosure, express consent, cancellation as easy as signup, no misrepresentation.
- **ROSCA and FTC Act §5 still apply** and are actively enforced against negative-option sellers.
- **California's amended Automatic Renewal Law (effective 2025-07-01)** already requires a prominently located cancel button/link in account settings and permits **at most ONE retention offer** during cancellation, shown alongside a simultaneous option to just cancel.

Design consequence: build compliant-by-default now (prominent cancel, one save offer max, no dark patterns). The existing signup consent checkbox already anticipated this; keep the symmetry.

## 2. Industry best practice (what a good flow contains)

Well-designed flows (reason capture + matched offer + pause option) save 20 to 40% of cancel-intent users; generic or offer-less flows sit under 10 to 15%. Pause is the single highest-leverage tool: ~50% acceptance among those offered it, and 60 to 80% of pausers reactivate. Exit surveys should be ONE multiple-choice question plus one optional free-text field; >40% completion means it is placed well. Punitive friction (hidden buttons, forced calls) is both a legal risk and a brand tax.

## Build status (2026-07-20, same day)

P0 and P1 (section 3 below) are BUILT. Decisions locked while building:

- **Pause keeps benefits** (Pavel 2026-07-20): sub stays active, invoices void (Stripe `pause_collection` behavior `void`). Guards: pause offered only for NOT_USING / TEMPORARY reasons (TOO_EXPENSIVE excluded to close the fee-rate leak), 1 to 3 months, one pause per rolling 365 days (`tierLastPausedAt`). Accepting a pause withdraws a pending cancel.
- **Portal is locked down**: `subscription_cancel` and `subscription_update` disabled in the portal configuration (metadata-tagged `creator_billing_v1`, lazily created + cached); cancel stays in our modal, plan changes in Checkout.
- New audit action `SUBSCRIPTION_PAUSED` (payload carries `savedFromReasonCode` for save-rate analytics). Pause state mirrors on `CreatorProfile.tierPauseResumesAt` via `customer.subscription.updated`.

Remaining P2: true downgrade via price-swap, churn dashboard on the admin Tiers console.

## 3. Recommended build (priority order)

### P0: Correct + audit-complete (small, do now)

1. **Admin-granted tier edge.** When `subscriptionTier` is Builder/Agency but `stripeTierSubscriptionId` is null, do not render `CancelButton`; render an "admin-managed plan, contact support" state. Optionally add an admin-side revoke on the tiers console (it already has `requireCapability('tiers:write')` + reason).
2. **Audit the cancel click.** Today the only audit row appears when the webhook fires at period end; the creator's decision moment is unrecorded. Add `SUBSCRIPTION_CANCEL_REQUESTED` and `SUBSCRIPTION_CANCEL_RESUMED` to `packages/audit/src/types.ts` and log them in the server actions (actor = creator). Keep the tier flip webhook-authoritative; do not downgrade at click time.
3. **Real cancel modal** replacing `window.confirm`/`prompt`: what-you-lose summary (from the existing tier entitlement tables), effective date ("you keep Builder until {periodEnd}"), structured reason select + optional text. Store the reason in a small `TierCancellationEvent` row (uuid id per the FREEZE decision) as churn analytics SSOT, and keep passing it to Stripe `cancellation_details`.

### P1: Reduce avoidable churn

4. **Stripe Billing Portal session** action ("Manage billing" in the dunning grace banner is currently dead copy). Card-update self-serve is the cheapest fix for involuntary churn, which the 7-day dunning grace currently funnels straight to auto-downgrade. Configure the portal to payment-method + invoices only; keep cancel in our own flow.
5. **One save offer, matched to reason** (CA cap: exactly one, next to a plain Cancel button):
   - "Too expensive" or "not using it enough" → offer **pause** (Stripe `pause_collection`, 1 to 3 months) or the lower paid tier.
   - "Missing feature" or "switching" → no discount; short free-text + route to support/feedback, then cancel cleanly.
   - Skip percent-off coupons in V1; pause outperforms and does not train discount-hunting.

### P2: Structural

6. **True downgrade** (Agency → Builder) via `stripe.subscriptions.update` price swap with proration, replacing the current "cancel then re-subscribe" doctrine. Removes the main legitimate reason a user is forced through the cancel flow at all.
7. **Churn dashboard** on the admin Tiers console: cancels by reason, saves by offer, pause reactivation rate, fed by `TierCancellationEvent`.

## 4. Constraints any build must follow (repo law)

- All tier writes go through `setCreatorTierWithAudit` (`@ilaunchify/auth/server`); never raw `prisma.creatorProfile.update` on `subscriptionTier`.
- Webhook is authoritative for the downgrade; server-action mirrors are UI-only. Handlers stay idempotent (ProcessedWebhookEvent dedupe).
- Stripe calls live only in `packages/payments`; creator app calls `{ok}` envelope server actions (`requireUser()` → profile → helper → `revalidatePath('/settings/plan')`).
- Pricing and fee bps come from `SubscriptionPlan`/`FeeRule`, never hardcoded (CHECK 16).
- New models use `uuid()` ids.
- Note: `.claude/worktrees/` contains in-flight branches with their own schema copies; check none already carries cancellation migrations before adding one.

## Sources

- [Jones Day: FTC revives Click-to-Cancel rule (2026-05)](https://www.jonesday.com/en/insights/2026/05/ftc-revives-clicktocancel-rule-new-risks-for-subscription-businesses)
- [Gibson Dunn: FTC restarts negative option rulemaking; ROSCA enforcement continues](https://www.gibsondunn.com/ftc-restarts-negative-option-rulemaking-after-eighth-circuit-vacatur-enforcement-under-rosca-continues/)
- [Consumer Finance Monitor: Eighth Circuit voids Click-to-Cancel (2025-07)](https://www.consumerfinancemonitor.com/2025/07/23/eighth-circuit-voids-ftc-click-to-cancel-rule/)
- [Kirkland & Ellis: FTC restarts subscription rulemaking (2026-03)](https://www.kirkland.com/publications/kirkland-alert/2026/03/ftc-restarts-subscription-rulemaking)
- [Recurflux: cancel flow optimization benchmarks](https://recurflux.com/resources/guides/subscription-cancel-flow-optimization-saas)
- [Userpilot: cancellation flow examples 2026](https://userpilot.com/blog/cancellation-flow-examples/)
- [ChurnWard: cancellation flow + exit survey guide](https://churnward.com/blog/saas-cancellation-flow/)
