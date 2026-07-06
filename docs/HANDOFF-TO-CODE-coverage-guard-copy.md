# HANDOFF → Code: coverage-drop guard copy (Studio / checkout)

**From:** Cowork · **Date:** 2026-07-06 · **Depends on:** PS-8a–d (built, committed) + the PS-8
`db:push` (see bottom). **Spec:** `docs/PRINT_PROVIDER_SELECTION.md` §10.1 / §10.3 + §10.5 (PS-8d).

## Why this is yours, not mine

This is the one PS-8 item that lands in the **Design Studio canvas / checkout** — the single-writer
hot zone that belongs to Code (per CLAUDE.md §Multi-agent + the two-agent hot-file memory). Cowork
built everything around it (coverage engine, RFQ broadcast, publish gate, partner claim flow, admin
dashboard); this is the last, creator-facing polish and it's small.

## What it is

When a template's print coverage **drops to 0 after it's already published**, the nightly sweep
auto-PAUSES it (`ProductTemplate.status → PAUSED`) and re-broadcasts a capability RFQ (already built,
PS-8b). A creator who is **mid-design** on that template should see honest copy instead of a dead
end: keep designing, but ordering is paused for a moment.

This is **defense-in-depth**, deliberately rare: §10.1's activation gate means a creator can never
*start* designing an uncoverable product, and the §8 UNRESOLVED validator at Pay is the hard backstop.
So this is a friendly banner, not a load-bearing gate — low risk, low urgency.

## Trigger (exact)

Show the banner when **both** hold for the template the creator is designing/checking out:

1. `ProductTemplate.status === 'PAUSED'`, **and**
2. an `OPEN` or `CLAIMED` `PrintCapabilityRequest` exists for it (i.e. it was paused *for coverage*,
   not manually by an admin for some other reason).

Detection query (drop into your surface's loader — no cross-package export needed):

```ts
const pausedForCoverage =
  template.status === 'PAUSED' &&
  (await prisma.printCapabilityRequest.count({
    where: { productTemplateId: template.id, status: { in: ['OPEN', 'CLAIMED'] } },
  })) > 0
```

(If you'd rather import a helper than inline the query, say the word and I'll add
`isTemplateCoveragePaused(templateId)` to `@ilaunchify/orders` — I kept it out for now to avoid
churning `packages/orders/src/index.ts`, which is currently co-edited.)

## Copy (approved wording)

> **Printing for this product is being re-arranged.** You can keep designing — ordering is paused for
> a moment while we line up a printer. We'll email you the moment it's back.

Tone: reassuring, no blame, no jargon ("coverage", "RFQ", "printer churn" stay internal). The email
promise is real — when a claim's offering activates, `resolveCapabilityClaimOnOfferingActivated`
already un-pauses the template (PS-8c); a "coverage restored" creator email is a noted follow-up, so
you can wire the banner now and the email lands later without changing this copy.

## Placement

- **Design Studio:** a non-blocking banner at the top of the canvas shell (keep the canvas usable —
  the creator should still be able to design/save). Disable only the "order / checkout" CTA, not the
  editor.
- **Checkout entry** for that template: same banner + block the pay step (the §8 validator will also
  catch it, but the friendly copy should come first).

Both are your surfaces; I haven't touched either. Marketplace **listing/detail already handles PAUSED**
(the loader filters `status === 'PUBLISHED'`, so paused templates simply don't list) — no change needed
there.

## What's already done (so you don't re-build it)

- Coverage engine + RFQ broadcast + auto-PAUSE cron — `packages/orders` + `apps/admin/api/cron/print-coverage`.
- Auto-unpark on claim activation — `resolveCapabilityClaimOnOfferingActivated` (PS-8c).
- Admin visibility — `/print-coverage` dashboard (PS-8d).

## Migration dependency

None of PS-8 (including anything you build here) is live until Pavel runs the single series migration:

```bash
pnpm db:push && pnpm db:generate && rm -rf apps/*/.next
```

It lands the `PrintCapabilityRequest` / `PrintCapabilityClaim` models + the `PARTNER_CAPABILITY_RFQ`
notification enum value. Your detection query above reads `PrintCapabilityRequest`, so it needs that
push first.
