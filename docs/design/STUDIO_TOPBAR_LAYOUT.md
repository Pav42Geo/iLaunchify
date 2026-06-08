# Design Studio Top Bar — Layout Spec

Spatial arrangement of the Design Studio's top bar implementing the locked compliance UX pattern from `docs/design/COMPLIANCE_UX_PRINCIPLES.md`. Reference spec for C8 build.

## Layout

The top bar is 56px tall, full-width, sticky on the canvas surface. Three zones — left (brand + context), center (status + score), right (actions).

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  iLaunchify Studio   /   Mango Energy RTD 12oz                                              │
│  [logo]              [breadcrumb]              [● Compliant 96]      [Saved 2s] [Submit ↓] │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

Three columns at desktop widths (≥1280px):

```
┌─ LEFT (flex 1) ──────────────────┬─ CENTER (auto) ──────┬─ RIGHT (auto) ──────────────────┐
│ iLaunchify Studio  /  Product    │ [Compliance HUD pill]│ [Saved indicator] [Submit]     │
└──────────────────────────────────┴──────────────────────┴─────────────────────────────────┘
```

At narrow widths (<1024px) the center HUD moves below the breadcrumb in a second row; brand + breadcrumb stay on row 1; action cluster stays right-aligned.

## Component map

### Left zone — context

- **Wordmark** — `iLaunchify Studio` in Bricolage Grotesque 500. 14px. Click → marketing home (not creator app — Studio is its own focused surface).
- **Separator** — `/` in `var(--color-text-secondary)`.
- **Product title + breadcrumb** — current product name in Inter 500 14px. Click → product detail in marketplace (opens new tab).
- **Reapproval badge (conditional)** — small pink `A 1 edit` pill next to product title when the product is PUBLISHED and the design version has changes that will trigger PENDING_EDIT_REVIEW. Click → opens a panel explaining what changed + which sections are approval-marked.

### Center zone — Compliance HUD + Score

The load-bearing compliance feedback surface, always visible. Two adjacent elements as a single cluster:

```
[●] [Compliant]  [96]
 │      │         │
 │      │         └─ Compliance score 0-100 (small bold number)
 │      └─ Status label (Compliant / 2 warnings / 1 blocker)
 └─ Status dot — green / amber / red
```

**Three states:**

| State | Dot color | Label | Score color | Background |
|---|---|---|---|---|
| Green (≥95, no blockers) | `#3B6D11` (green-800) | "Compliant" | green | `#EAF3DE` (green-50) |
| Amber (80-94, no blockers) | `#854F0B` (amber-800) | "{n} warning(s)" | amber | `#FAEEDA` (amber-50) |
| Red (<80 OR any blocker) | `#791F1F` (red-800) | "{n} blocker(s)" | red | `#FCEBEB` (red-50) |

**Behavior:**
- Click anywhere on the cluster → expands the Compliance Panel (drawer from right) showing all issues categorized as Required / Recommended / Best-practice
- Hover → tooltip surfaces top issue + "Click for details"
- Updates live as the canvas changes (debounced 500ms on object:modified)
- Animates color transition smoothly (200ms) when state changes
- Score number animates from old to new on change

The cluster is the single source of truth for "am I in good shape." The creator learns to trust it as ambient feedback — glance up, green means freely design.

### Right zone — actions

- **Saved indicator** — small green pill `Saved 2s` when autosave succeeded; amber `Saving…` during save; red `Save failed — retry` on error. 11px.
- **Submit / Next button** — primary action. Black pill with white text, Bricolage 500 13px. Disabled state when blockers present; tooltip explains "Resolve {n} blockers to continue."
  - When in Design Studio standalone → label "Next" (proceeds to checkout per H1 flow)
  - When in checkout context → label "Continue" or "Submit"

## States by user mode

| User state | What changes |
|---|---|
| **Designing freely (all clean)** | Green dot, "Compliant", 96-100 score, Saved pill, Next enabled |
| **Has warnings only** | Amber dot, "2 warnings", 80-94 score, Saved pill, Next enabled (warnings non-blocking) |
| **Has blockers** | Red dot, "1 blocker", <80 score, Saved pill, Next disabled with tooltip |
| **First-time creator, empty canvas** | Subtle pulsing on the HUD cluster + onboarding tooltip "This shows your design's compliance status as you build. Stays green when you're following all rules." Auto-dismiss after 3s or first click. |
| **Saving** | Saved pill replaces with amber "Saving…" with spinner |
| **Save failed** | Red "Save failed" pill with [Retry] inline |
| **Cert claim pending consent** | Tiny pink dot on Next button + tooltip "1 cert claim pending your consent — finish in canvas before continuing" |

## Mobile / narrow-viewport adjustments

At <1024px, the topbar becomes two rows:

```
Row 1: [logo] [breadcrumb] ... [Saved] [Submit]
Row 2:                          [HUD cluster centered]
```

The HUD cluster takes priority over the breadcrumb on the second row. Product title can truncate with ellipsis on row 1.

At <640px (true mobile), the HUD becomes a tappable status bar at the bottom of the canvas instead of the top — better thumb reach, doesn't compete with canvas tools.

## Accessibility

- Status colors paired with icons (●/⚠/🛑) — no color-only conveyance
- Status cluster has `role="status"` and `aria-live="polite"` so screen readers announce changes
- Score change announced as "Compliance score: 96 of 100" via `aria-label`
- Submit button announces blocker count when disabled
- All interactive elements keyboard-focusable with visible focus rings
- The cluster is reachable via single Tab from the canvas; Esc closes the Compliance Panel when open

## Animations

- Color transitions: 200ms ease
- Score number: digit-rolling animation (180ms total) on change
- HUD pulse on first-time-creator state: 2s, 3 repeats, easing
- Compliance Panel drawer slide-in: 240ms ease-out

No bouncing, no celebration animation. The HUD reports state — it doesn't celebrate. Pre-flight checklist at Export is where celebration happens (subtle green check sweep).

## Component file paths

- `apps/creator/src/app/studio/topbar/StudioTopBar.tsx` — main container
- `apps/creator/src/app/studio/topbar/ComplianceHUD.tsx` — the cluster
- `apps/creator/src/app/studio/topbar/ComplianceScore.tsx` — the number
- `apps/creator/src/app/studio/topbar/SubmitButton.tsx` — primary action with disabled-state logic
- `apps/creator/src/app/studio/topbar/SavedIndicator.tsx` — autosave status
- `apps/creator/src/app/studio/topbar/BreadcrumbProductTitle.tsx` — left zone
- `apps/creator/src/app/studio/CompliancePanel.tsx` — drawer (already partially shipped per DS-55d; extend for new schema)

All client components. Icons imported inside per RSC boundary memory.

## Why this matters

The top bar is the most-seen surface in the Studio. The HUD pill + score takes up about 120px of horizontal space — small footprint, ambient presence, learnable signal. Glance up: green = free to design.

This is the visible expression of the "quiet by default" principle from the COMPLIANCE_UX_PRINCIPLES doc. The Studio doesn't push warnings; the HUD reports state. The creator either ignores it (when green) or clicks it (when not green) — that's the entire interaction model.

## See also

- `docs/design/COMPLIANCE_UX_PRINCIPLES.md` — the design rule this layout implements
- `docs/builds/certificates-c8-design-studio-asset-rules.md` — the implementation slice
- `.claude/memory/ilaunchify-design-system-v1.md` — design tokens (pink, black, neon green, Inter, Bricolage)
- `.claude/memory/ilaunchify-compliance-ux-pattern.md` — pattern lock
