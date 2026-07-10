# Activation "Launch Console" — Build Handoff

**Status:** Spec ready to build · **Owner surface:** partner app · **Route:** `/activation`
**Prototype (canonical UX contract):** `design/activation-launch-console-tokens.html` — wired to `packages/ui/src/theme.css` (channel-var raw ramps + semantic / component / chrome tokens, `data-surface="dark"` hero, `data-density="partner"`). Build against this file's class→token mapping.
**Prototype (self-contained palette, visual reference only):** `design/activation-launch-console.html`
**Supersedes:** the v1 read-mostly overview in `apps/partner/src/app/(dashboard)/activation/page.tsx`
**Related specs:** `docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md` §5B · `docs/BUILD_CHECKLIST_ONBOARDING_2026-07.md` (lines 55, 67–68)
**Date:** 2026-07-09

![Activation Launch Console — dark launch hero with per-service launchpads (Manufacturing & Fulfillment live, Print & Co-packing counting down), the "next best step" focus banner, the Print track with inline steps + "where this lands" routing tags, and the "what launching unlocks / already earning" rail.](../design/activation-launch-console.png)

*Thumbnail of the Launch Console (Print track selected). Open the canonical token build `design/activation-launch-console-tokens.html` for the full clickable reference — all four tracks + shared tail, wired to the design-system tokens.*

---

## 0. Start here

We are redesigning `/activation` from a flat link-out checklist into a **service-composed launch console**. The engine, schema, and status readers already exist and **do not change** in Phase 1 — this is primarily a **UI rebuild** on top of `activation-tracks.ts` + `activation-status.ts` + the existing `setActivationStepComplete` action, plus two net-new capabilities: **inline step drawers** (capture data without leaving the page) and the **FSM auto-advance** to `OPERATIONALLY_CONFIGURED` (currently unbuilt).

Three ideas the build must preserve from the prototype:

1. **Per-service launchpads with independent go-live.** Each service is its own pad; it "ignites" (LIVE) the moment its own track + the shared tail are complete. A partner can be live on Manufacturing while still finishing Print. This is the existing D8 hybrid gate — surface it, don't re-invent it.
2. **Inline capture, not link-out.** Each step opens an in-place drawer with the real form. "Set up →" no longer navigates away. Deep links to the full surfaces remain available as a secondary "Open full editor" affordance.
3. **"Where this lands."** Every step renders its `routesTo` chain as first-class reassurance ("Substrates → marketplace facet → match engine"). This is the platform-not-directory payoff.

**Non-goals for Phase 1:** changing the activation engine's step keys or composition rules; changing the approval gate; building new capture backends that don't already exist (reuse the server actions the current deep-link surfaces already call).

---

## 1. What exists today (reuse verbatim)

| Concern | File | Reuse as-is? |
|---|---|---|
| Pure step engine (keys, labels, `routesTo`, `href`, composition) | `apps/partner/src/lib/activation-tracks.ts` | ✅ yes |
| Status reader + auto-detection + limited-nav resolver | `apps/partner/src/lib/activation-status.ts` | ✅ yes |
| Completion action + hybrid go-live flip + audit | `apps/partner/src/app/(dashboard)/activation/actions.ts` | ✅ extend (add auto-advance) |
| Step record | `PartnerActivationStep` (`schema.prisma:9302`) | ✅ yes |
| Per-service live flag | `PartnerService.activationCompletedAt` + `ServiceStatus` | ✅ yes |
| FSM enum | `PartnerStatus` (`schema.prisma:164`) | ✅ yes (wire auto-advance) |
| Limited nav during activation | `PartnerSidebar.limitedActivationNav()` | ✅ yes |
| Page shell / gating | `layout.tsx:112–139` | ✅ yes |

**Engine contract already available (do not re-derive):**

```ts
// activation-tracks.ts
activationStepsFor(serviceTypes: PartnerServiceType[]): ActivationStep[]   // union + shared tail, stable order
trackFor(type): ActivationStep[]                                            // one service, no shared tail
isServiceActivationComplete(type, completedKeys): boolean                  // D8 gate
activationProgress(serviceTypes, completedKeys): {
  total, done,
  perService: Record<serviceKey, { done, total, live }>
}

// activation-status.ts
getPartnerActivationStatus(partnerId): {
  serviceTypes, completedKeys, autoCompletedKeys,
  progress, liveServiceTypes, allLive
}
```

Each `ActivationStep` already carries: `key`, `serviceKey` (`MANUFACTURING|COPACKING|LABEL_PRINTING|WAREHOUSE|SHARED`), `title`, `description`, `routesTo: string[]`, `href`.

---

## 2. Route & IA

- **Route:** `/activation` (unchanged). Server component stays the data-loader; a new client island renders the interactive console.
- **Gating (unchanged):** if `partner.status ∈ PRE_APPROVAL_STATUSES` → render the existing "Activation Setup opens after approval" notice and stop. Else render the console.
- **Nav:** `NAV_ACTIVATION` (Rocket) already in the org-admin block; `limitedActivationNav()` already strips the shell during activation. No change.

---

## 3. Component tree

```
activation/page.tsx                       (server: loads status, passes props)
└─ <LaunchConsole>                         (client island — new)
   ├─ <LaunchHero>                         dark band (ink-900), neon accents
   │   ├─ <LaunchMeter>                    overall ring + "N of M services live" + ETA
   │   └─ <Launchpads>                     4 pads, one per selected service
   │       └─ <Launchpad svc=…>            progress, status (LIVE | "k steps left"), selectable
   ├─ <FocusBanner>                        "next best step" → opens that step's drawer
   ├─ <ServiceTrack svc=selected>          card: header + step list for the selected service
   │   └─ <ActivationStepRow step=…>
   │       ├─ header row (num/✓, title, routesTo tags, right affordance)
   │       └─ <StepDrawer>                 inline; renders <WhereThisLands> + a per-key form
   │           └─ <StepForm key=…>         one component per stepKey (see §6)
   ├─ <SharedTail>                         certs · pricing · review (rendered after tracks)
   └─ <RailSummary>                        "what launching X unlocks" · "already earning" · help
   └─ <GoLiveCelebration>                  overlay, fired on a service transitioning to LIVE
```

**Rendering note:** `page.tsx` stays a server component (keeps `force-dynamic`, `requireUser`, and the `getPartnerActivationStatus` call). It passes a fully-resolved, serializable `ConsoleModel` (below) into `<LaunchConsole>` as a client island. All mutations go through server actions + `revalidatePath('/activation')`.

---

## 4. Data contract (server → client island)

Build this in `page.tsx` from the existing readers; **no new queries required for Phase 1** beyond what `getPartnerActivationStatus` already does.

```ts
type ConsoleModel = {
  partnerStatus: PartnerStatus;
  services: Array<{
    key: PartnerServiceType;              // MANUFACTURING | COPACKING | LABEL_PRINTING | WAREHOUSE
    label: string;                        // SERVICE_LABEL[key]
    accent: 'pink'|'success'|'warning'|'info';  // token accent per service (see §7)
    live: boolean;                        // progress.perService[key].live
    done: number; total: number;         // progress.perService[key]
    steps: Array<{
      key: string;                        // e.g. 'print.specs'
      title: string; description: string;
      routesTo: string[];                 // "where this lands" chips
      href: string | null;               // secondary "Open full editor"
      done: boolean;                      // key ∈ completedKeys
      auto: boolean;                      // key ∈ autoCompletedKeys (locked; no manual toggle)
    }>;
  }>;
  shared: Array<StepView>;                // shared.certs / shared.pricing / shared.review
  overall: { done: number; total: number; liveServices: number; totalServices: number; allLive: boolean };
  nextBestStep: { serviceKey: string; stepKey: string } | null;  // first incomplete non-auto step, engine order
};
```

`nextBestStep` = first step in `activationStepsFor(serviceTypes)` order that is not `done` and not `auto`. Drives `<FocusBanner>`.

---

## 5. Server actions

### 5.1 Existing — reuse
`setActivationStepComplete(stepKey, complete)` (in `activation/actions.ts`): ownership-checked upsert/delete of `PartnerActivationStep`, recompute per-service completeness, hybrid `DRAFT→ACTIVE` flip on the affected `PartnerService`, `activateReadyNominations`, `revalidatePath('/activation')`, audit (`ACTIVATION_STEP_COMPLETED` / `_REOPENED`, `SERVICE_WENT_LIVE`).

The drawer's **"Save & mark done"** = (optional) call the step's real capture action (§6) **then** `setActivationStepComplete(key, true)`. Auto-detected steps never call this (they're derived).

### 5.2 New — FSM auto-advance (the one missing backend piece)
Extend the tail of `setActivationStepComplete` (or a shared helper it calls):

```
after recomputing completeness:
  if getPartnerActivationStatus(partnerId).allLive
     && partner.status === 'IDENTITY_VERIFIED' | 'OPS_PENDING_REVIEW'
     && partner.status !== 'OPERATIONALLY_CONFIGURED':
        assertPartnerTransition(partner, 'OPERATIONALLY_CONFIGURED')   // forward-only
        audit('PARTNER_OPERATIONALLY_CONFIGURED')
```

Rules: forward-only (never regress a partner already `ACTIVE`/beyond); idempotent; guarded by the same ownership check. This closes the `[~]` item in `BUILD_CHECKLIST_ONBOARDING_2026-07.md` line 68 ("partner-stage FSM auto-advance … on all-complete").

### 5.3 Response for the celebration
`setActivationStepComplete` should return `{ ok, serviceWentLive?: PartnerServiceType, partnerAdvanced?: boolean }` so the client can fire `<GoLiveCelebration>` for the exact service that just ignited (rather than re-diffing on the client).

---

## 6. Step drawer forms (per stepKey)

Each `<StepForm>` renders inside the drawer. **Reuse the capture logic behind the existing deep-link surface** — do not build parallel write paths. Where a step's home surface is heavy (e.g. Design Studio die-lines), the drawer shows a compact capture + a "Open full editor →" deep link to `step.href`.

| stepKey | Drawer form (compact) | Backing store / action (existing surface) |
|---|---|---|
| `mfr.products` | category chips + format multiselect | `PartnerService.capabilities.categories[]` (`/products`, service caps action) |
| `mfr.specs` | formulation capability toggles + sample-capable switch | `PartnerService.capabilities` (`/products`) |
| `mfr.moq` | MOQ min/max, lead repeat/first-run, blackout | service caps / `/services` |
| `copack.formats` | container-format multiselect (`ContainerCategory`) | `PartnerPackagingOffering` / caps (`/packaging/offerings`) |
| `copack.fill` | fill-type chips (powder/liquid/capsule/cream) | caps (`/packaging/offerings`) |
| `copack.supply` | "Do you supply packaging?" segmented (supply / print-only) | `PartnerPackagingOffering.suppliesContainer` |
| `print.materials` | **one-row-at-a-time table**: name, `SubstrateCategory`, food-contact ✓, domains | `PartnerServiceSubstrate` (`/packaging/offerings`) |
| `print.specs` | process chips, color (CMYK/Pantone/white ink/ICC), finishes, max print area | `PartnerService.capabilities` → `print-eligibility.ts` (`/print-spec`) |
| `print.dielines` | added-templates list + "Upload" + "Open Studio →" | `PackagingDieline` / `PartnerServiceDieCut` (`/packaging/dielines`) |
| `print.runs` | MOQ min/max, production + **sample** lead, cutoff, blackout | `PartnerPackagingOffering` + lead fields + `PartnerBlackoutDate` (`/print-spec`) |
| `fc.storage` | storage-class chips (`StorageClass`) + hazmat | `PartnerService.storageClasses[]` / `hazmatAccepted[]` (`/services`) |
| `fc.capacity` | weekly pallet capacity + geo | `PartnerService.weeklyPalletCapacity` (`/services`) |
| `fc.vas` | value-added services (kitting/returns) + pick/pack fees | `PartnerService` fee fields (`/services`) |
| `shared.certs` | per-domain cert declare + upload + expiry | `PartnerCertificateInstance` vs `CertificateType` (`/certifications`) |
| `shared.pricing` | confirm price tiers + payout terms | `PartnerCommercialTerms` (`/settings`) |
| `shared.review` | read-only completeness recap + "Go live" CTA | derived; flips remaining eligibility |

**`<WhereThisLands>`** renders above every form: the `routesTo` chips plus, where useful, an explicit flow chain (`Substrate row → PartnerServiceSubstrate → Marketplace facet → Match engine`). Copy comes from a small `ROUTES_COPY[stepKey]` map (new, presentational only).

**Auto-detected steps:** drawer shows the detected data read-only with a "✓ We already found this from your catalog" note and no "mark done" button (matches `deriveAutoCompletedKeys`).

---

## 7. Visual spec (design system)

Follow `packages/ui/theme.css`. The console is **dark hero → light body** (the established pattern), density `partner`.

- **Hero band:** `--ink-900` canvas, neon accents (`--neon-500`) for the progress ring fill, the "Approved" eyebrow, and LIVE pad glow. Radial pink+neon glows + faint grid overlay (decorative; keep under `prefers-reduced-motion`). Display type **Bricolage Grotesque**; one `serif-em` (Fraunces italic, neon) accent in the H1.
- **Launchpads:** translucent white cards on the dark hero. Progress fill = `--pink-500` while in progress, **flips to `--neon-500` when LIVE**. Selected pad gets a `--pink-400` ring.
- **Body:** `--ink-50` canvas, white cards, hairline `--ink-200` borders, `--r-xl` radii. Per-service accent tokens: Manufacturing = pink, Fulfillment = success/green, Print = warning/amber, Co-packing = info/blue, Shared = ink/gray (matches the current page's accent choices).
- **Step states:** done = `--success-500` numbered circle with check; auto = `--info` tint; pending = neutral. `routesTo` chips = neutral pill with a pink arrow glyph.
- **CTAs:** primary in-body = black pill (`btn-dark`) or `btn-pink`; on the dark hero, primary = neon (`btn-neon`). Never neon on light.
- **Go-live celebration:** dark modal, neon rocket, confetti in brand colors. Gate the confetti/animation behind `prefers-reduced-motion` (show a static success card instead).
- **Accessibility:** each step row is a real `<button>`/disclosure with `aria-expanded`; drawer content focus-trapped when open; ring/meter values also present as text; contrast ≥ WCAG AA (neon only on ink-900). Run `pnpm check:colors` — no raw brand hex; use tokens/utilities.

---

## 8. Interaction states

1. **Select service** → swap `<ServiceTrack>` to that service's steps; update pad selection ring.
2. **Open step** → expand one drawer at a time (accordion); `aria-expanded=true`; scroll into view.
3. **Save & mark done** → call capture action (if any) → `setActivationStepComplete(key,true)` → optimistic row → done; if the response reports `serviceWentLive`, fire `<GoLiveCelebration>` for that service and update the pad to LIVE + the rail "unlocks" to fulfilled.
4. **Reopen** (`done → not done`) → allowed for non-auto steps; never yanks an already-LIVE service (forward-only flip in the action already enforces this) — surface a tooltip: "This service is already live; edits won't take it offline."
5. **All services live** → hero shows 100%, partner auto-advanced to `OPERATIONALLY_CONFIGURED`; console shows a terminal "You're fully operational" state and the limited nav gives way to full nav (existing `resolveActivationLimited` sticky flag).
6. **Focus banner** → jumps to `nextBestStep` and opens its drawer.

---

## 9. Telemetry / audit

Reuse existing audit events (`ACTIVATION_STEP_COMPLETED/_REOPENED`, `SERVICE_WENT_LIVE`) and add `PARTNER_OPERATIONALLY_CONFIGURED` on auto-advance. Add lightweight analytics: `activation_step_opened`, `activation_step_saved`, `activation_service_went_live`, `activation_all_live` (via `log_analytics` / existing partner analytics hook).

---

## 10. Build phases

**P0 — Console shell (no backend change).** Convert `page.tsx` to pass `ConsoleModel`; build `<LaunchConsole>`, `<LaunchHero>`, `<Launchpads>`, `<ServiceTrack>`, `<ActivationStepRow>`, `<RailSummary>` reading existing status. Keep the current manual "mark done" behavior (drawer optional). Ships the visual upgrade with zero risk.

**P1 — Inline drawers.** Add `<StepDrawer>` + per-key `<StepForm>` wired to the existing capture actions behind each `href`. `<WhereThisLands>` copy map. "Save & mark done" chains capture + `setActivationStepComplete`.

**P2 — Go-live moment + FSM auto-advance.** Extend `setActivationStepComplete` to return `serviceWentLive`/`partnerAdvanced`; implement the `OPERATIONALLY_CONFIGURED` forward-only transition; build `<GoLiveCelebration>` (reduced-motion safe).

**P3 — Polish.** Analytics, empty/edge states (0 services, single service, all-auto-complete), mobile pass, "Book a setup call" hook, and remove the v1 static list.

---

## 11. Acceptance criteria

- [ ] `/activation` renders the console for post-approval partners; pre-approval notice unchanged.
- [ ] Launchpads show correct per-service `done/total` and LIVE state from `activationProgress`; a service can be LIVE while others are in progress.
- [ ] Every step shows its `routesTo` chips; auto-detected steps are read-only with the "already found" note and no toggle.
- [ ] Opening a step reveals its inline form; "Save & mark done" persists via the existing capture action + `setActivationStepComplete`; page revalidates.
- [ ] Completing a service's full track (own keys + shared tail) flips its `PartnerService` `DRAFT→ACTIVE` and fires the celebration; reopening never takes a live service offline.
- [ ] When `allLive`, the partner auto-advances to `OPERATIONALLY_CONFIGURED` (forward-only, idempotent, audited).
- [ ] Tokens only (no raw brand hex); `pnpm check:colors`, `pnpm typecheck`, `pnpm lint` green; reduced-motion respected; step rows keyboard-operable.

---

## 12. File-touch list

- `apps/partner/src/app/(dashboard)/activation/page.tsx` — build `ConsoleModel`, render island.
- `apps/partner/src/app/(dashboard)/activation/LaunchConsole.tsx` *(new)* + child components (`LaunchHero`, `Launchpads`, `ServiceTrack`, `ActivationStepRow`, `StepDrawer`, `StepForm.*`, `WhereThisLands`, `RailSummary`, `GoLiveCelebration`).
- `apps/partner/src/app/(dashboard)/activation/routes-copy.ts` *(new)* — `ROUTES_COPY[stepKey]` presentational strings.
- `apps/partner/src/app/(dashboard)/activation/actions.ts` — add auto-advance + richer return shape.
- `apps/partner/src/lib/activation-tracks.ts` / `activation-status.ts` — **no change** (Phase 1).
- `packages/audit` — register `PARTNER_OPERATIONALLY_CONFIGURED` if not present.

**Do not** add a `Lead`/duplicate step model, change step keys, or collect approval-gate documents (incorporation/license/COI) here — those live in onboarding.
