# Theme Management — Architecture Recommendation

_Proposal, 2026-06-25. Answers: (1) what to name it, (2) split per app or not, (3) how to manage all design components — colors, type, cards, borders, corners — from one Admin surface, the right way._

> **Build status (2026-06-25).** Name **locked: Theme Studio**. **Phase 0 shipped** — foundation tokens (`--fs-*` type ramp + `--font-scale`, `--radius-*` + `--radius-scale`, border/elevation, Tier-3 component tokens) live in `packages/ui/src/theme.css`; Partner Add Product converted as the first adopter. **Phase 1 shipped** — all nine `@ilaunchify/ui` primitives (button, card, input, chip, badge, select, dialog, label, row-actions-menu) consume the tokens. Accessibility publish-gates added to the spec (§6.5) per [ACCESSIBILITY_LEGAL_RESEARCH.md](./ACCESSIBILITY_LEGAL_RESEARCH.md). Next: Phase 2 (surface migration), then Phase 3 (the editor) built compliant-by-construction.

---

## TL;DR

Don't fork a separate theme per app. Build **one platform token system** (single source of truth) with **scoped override layers** — the cascade already in your `theme.css` (`data-surface`, `data-density`) is exactly this pattern, just not finished. Admin edits **tokens**, not CSS. Surfaces like Design Studio / Marketplace / User Accounts become **scopes** that override only the few tokens that differ and inherit everything else.

- **Name it:** **Theme Studio** (the Admin surface) managing **Themes** made of **design tokens**. (Naming options + rationale below.)
- **Split model:** single base theme → surface/mode layers → per-area scope overrides. Not independent per-app themes.
- **Editable:** colors, typography (+ the global size scale you wanted), corners/radius, borders, cards, shadows, spacing/density — all expressed as tokens.
- **Reality check:** tokens only control a surface once that surface *consumes* tokens. Lots of the platform is hardcoded `px`/hex today (the product builder you just saw is all hardcoded). So this is two programs running together: build the token system + Theme Studio, **and** migrate surfaces to consume tokens, phased. "One knob = whole platform" becomes true as adoption rolls out.

---

## 1. Naming (best practice)

The industry splits the *data* from the *surface that edits it*:

- **The data** is universally called **design tokens**, grouped into a **theme**. Keep this vocabulary — it's the W3C Design Tokens standard (stabilized Oct 2025, backed by Adobe/Figma/Shopify/etc.) and makes the system portable.
- **The Admin surface** — common names are _Appearance_, _Theming_, _Theme Editor_, _Design System_, _Theme Studio_.

**Recommendation: "Theme Studio."** It reads as a sibling to your existing **Design Studio** and **Academy**, signals "compose/edit," and avoids the dry "Settings" framing. Put it at **Admin → top-level "Theme Studio"** (it's too big to bury under Settings). 

Avoid "Design Studio" (already the creator canvas) and "Brand" (already means per-creator Brand Kit). If you prefer a settings-style name, second choice is **"Appearance."** Don't call it "Theme Management System" in the UI — too long; that's fine as the internal project name.

---

## 2. Split per app, or not? (the core question)

**Best practice is a single base theme + scoped overrides — never independent per-app themes.** Forking per app means every future change (a new pink, a radius tweak, dark mode) has to be re-done N times and they drift apart. Spotify, Atlassian, Shopify all converged on base-plus-override after getting burned by forks.

Your `theme.css` already does the first two layers of this:

```
:root            → base platform tokens (the locked brand)
[data-surface]   → light / dark / cream overrides   ← already a scope layer
[data-density]   → creator / partner spacing         ← already a scope layer
```

So the answer to "should I split Design Studio / Marketplace / User Accounts?" is: **model them as scopes, not separate themes.** A scope overrides only the handful of tokens it needs and inherits the rest:

```
Base theme  (one source of truth — the locked iLaunchify brand)
│
├─ Surface modes   : light · dark · cream            (visual mode)
├─ Density modes   : comfortable · compact           (spacing)
└─ Area scopes     : marketing/marketplace · creator · partner · admin
                     └─ Design Studio canvas  → THEMING-EXCLUDED (see §6)
```

Concretely: Marketplace can have a slightly larger type scale and rounder cards by overriding `--font-scale` and `--radius-card` in a `[data-app="marketing"]` block; it still inherits the pink, the ink ramp, the fonts. Change the base pink once → it updates everywhere that didn't deliberately override it.

This is strictly more powerful than per-app themes and far cheaper to maintain.

---

## 3. The token model (adopt the missing third tier)

You have 2 of the 3 standard tiers. Add the third and a few scale knobs.

**Tier 1 — Primitives** (raw values; already present): `--pink-500`, `--ink-900`, spacing ramp. **Add:** a type-size ramp (`--text-xs … --text-3xl`), radius ramp (`--radius-sm/md/lg/pill`), border widths, shadow/elevation ramp.

**Tier 2 — Semantic** (intent; mostly present): `--text-primary`, `--bg-canvas`, `--border-soft`. **Add:** `--radius-default`, `--border-default`, `--elevation-card`, and a typography scale that components read.

**Tier 3 — Component** (new): the things you explicitly named — cards, borders, corners, buttons, inputs, chips:

```
--card-radius, --card-border-width, --card-border-color, --card-padding, --card-shadow
--button-radius, --button-padding, --input-radius, --chip-radius …
```

Components reference Tier 3 → which references Tier 2 → which references Tier 1. Admin editing a primitive (the pink) or a semantic (card radius) cascades automatically.

**Global multiplier knobs** (these give you the "one number" feel): `--font-scale`, `--radius-scale`, `--density-scale`. Sizes are `calc(base × scale)`, so one slider in Theme Studio nudges the whole platform's type up 15% — which is exactly what you originally asked for, done properly.

> Note: components must **consume** these tokens for any of it to take effect. Today the product builder hardcodes `font-size:15px`, `border-radius:18px`, etc. directly. Migrating those to tokens is the adoption work in §7.

---

## 4. What Admin can edit

Everything you listed, grouped the way Theme Studio would present it:

- **Color** — brand ramps + semantic roles (text, background, border, accent, success/warning/danger). Live WCAG contrast check on edit (you already have a contrast checker in the brand tooling).
- **Typography** — families (Inter / Bricolage / Fraunces), the size scale + global `--font-scale`, weights, line-heights.
- **Corners** — radius ramp + per-component radius (cards, buttons, inputs, chips).
- **Borders** — width + color, per-component.
- **Cards** — padding, radius, border, shadow.
- **Elevation/shadows** and **spacing/density**.

Each control writes a **token value**, not raw CSS — that's what keeps it safe and consistent.

---

## 5. How it reaches the apps (runtime, DB-backed, audited)

You already have the runtime-CSS-variable pattern: per-creator Brand Kit overrides variables at the canvas root (`brand-theme.ts`). Platform theming is the same mechanism, one level up:

1. **Persistence** — a `Theme` + `ThemeToken` (+ `ThemeScope`) set of Prisma models. Additive, uuid ids, Cockroach-safe — same conventions as the rest of the schema. Every edit writes an `AuditLog` row (your hard rule) and ideally goes through an FSM (`draft → preview → published`).
2. **Publish** — the active theme serializes to a block of CSS custom properties.
3. **Inject** — each app's root layout renders those variables on `:root` (+ scope selectors). Switching theme = swapping variable values; no rebuild, instant, no re-render storm (the cascade does the work).
4. **Preview** — Theme Studio previews against real screens before publish; revert = republish previous version.

This fits your existing stack (shared `theme.css`, `@ilaunchify/ui`, Auth.js role gates, audit package) with no new infrastructure.

---

## 6. Governance — because the design system is LOCKED

The brand is locked (pink `#FF2E63`, black pill CTA, neon-on-dark, Inter/Bricolage/Fraunces). A runtime editor that can recolor everything can also break brand, contrast, and accessibility. Guardrails:

- **Protected tokens** — locked brand primitives are view-only or edit-behind-a-warning, not free-for-all.
- **Curated exposure** — expose a safe, semantic set first (scale, radius, density, semantic colors), not every raw primitive.
- **Accessibility publish-gates** before publish (the §6.5 WCAG gates below); full audit log + one-click revert.
- **Theming-excluded zones** — the **Design Studio canvas** (Fabric.js coordinate math) and the **regulated label renderers** (Nutrition/Supplement/Drug Facts, INCI, AAFCO — legal artifacts, build-to-spec) must be **opted out** of arbitrary theming. They render to spec, not to the platform theme. This is the same reason I left `.facts` untouched in the font bump.

### 6.5 Accessibility publish-gates (WCAG 2.1 AA) — *the legal layer*

The token layer is the right enforcement point for a meaningful slice of US accessibility law. The legal benchmark is **WCAG 2.1 Level AA** (de facto for ADA Title III; the standard DOJ's 2024 Title II rule names; exceeds Section 508's 2.0 AA; matches the EU EAA's EN 301 549). The sharpest exposure is the **public marketing/marketplace surfaces** under a **California Unruh** ($4,000/offense) lens. Full legal analysis: [ACCESSIBILITY_LEGAL_RESEARCH.md](./ACCESSIBILITY_LEGAL_RESEARCH.md).

**A theme that fails any gate below cannot be published.** Each gate is computable from the tokens themselves:

| Gate | WCAG SC | Rule (exact threshold) | Token mechanism |
|---|---|---|---|
| Text contrast | 1.4.3 (AA) | ≥ **4.5:1** normal text, **3:1** large (≥24px, or ≥18.66px bold) | Compute contrast on every **fg/bg token *pairing*** a theme allows — not colors in isolation. No rounding (4.499 fails). |
| Non-text / UI contrast | 1.4.11 (AA) | ≥ **3:1** for borders, form-field boundaries, icons, and the **focus ring** vs its background | Gate `--border-*`, `--focus-ring`, control-state tokens against adjacent surface tokens. |
| Focus visible | 2.4.7 (AA) | A visible focus indicator that can't be removed | Ship a **mandatory `--focus-ring` token** (color + ≥2px thickness + offset) meeting the 3:1 bar; forbid `outline:none` with no replacement. |
| Resize text | 1.4.4 (AA) | Usable at **200% zoom**, no clipping | Prefer **relative units** in `--fs-*` (our ramp is px today — flagged below); enforce a sane **min base size**; no fixed-px line clamps. |
| Text spacing | 1.4.12 (AA) | Survive user line-height 1.5×, letter 0.12×, word 0.16× | **Negative constraint:** forbid fixed line-height/letter-spacing tokens that clip under overrides. |
| Target size | 2.5.8 (AA, 2.2) | Interactive targets ≥ **24×24 CSS px** | Floor `min-h`/`min-w` + hit-area padding on button/chip/icon-button/RowActionsMenu component tokens. |

**Brand pairings to validate, not assume** (the research flagged these as likely failures): **neon green `#B5FF3D` on light**, and **white text on cream `#F3EFE8`**. These should be blocked or auto-restricted by the contrast gate. Neon is already a *dark-surface-only* token by the locked rules — the gate enforces that mechanically.

**Two open items the gates surface:**
1. **`--fs-*` is px-based today** (for design parity with the existing platform). For 1.4.4 we should either move the ramp to `rem`, or guarantee the `--font-scale`/browser-zoom path satisfies 200% without clipping. Decision needed before Phase 3 locks the gate.
2. Gates are **necessary, not sufficient** — see the separate accessibility *track* in §7 for everything tokens can't reach (keyboard, ARIA, alt text, semantic HTML, screen-reader passes).

---

## 7. Phased plan

**Phase 0 — Foundation tokens ✅ DONE.** `theme.css` now has the `--fs-*` type ramp + `--font-scale`, `--radius-*` + `--radius-scale`, border/elevation tiers, and Tier-3 component tokens (card/button/input/chip). Partner Add Product converted as the first adopter (one `--font-scale` knob drives the page).

**Phase 1 — Adopt tokens in shared `@ilaunchify/ui` primitives ✅ DONE.** All nine atoms (button, card, input, chip, badge, select, dialog, label, row-actions-menu) consume Tier-3 tokens; the off-system `zinc`/`brand-primary` stragglers were unified onto `--border-soft` + the `pink-500` focus ring.

**Phase 2 — Migrate surfaces, one at a time.** Replace hardcoded `px`/hex per surface. Priority order driven by §6.5 risk: **public marketing/marketplace first** (highest legal exposure), then creator, partner, admin. Each migrated surface becomes fully theme-controlled *and* inherits the accessibility gates.

**Phase 3 — Theme Studio (Admin), built compliant-by-construction.** Prisma models (`Theme`/`ThemeToken`/`ThemeScope`) → read/preview/publish FSM → the Admin UI (locked admin v2 pattern: cream hero, etc.), with the §6 governance **and the §6.5 WCAG publish-gates wired as hard blocks** (contrast on token pairings, mandatory focus ring, ≥24px targets, relative-type/min-size, text-spacing constraint). Ships read-only/preview first, then publish.

**Phase 4 — Scopes.** Wire `data-app` / area scopes so Marketplace, Creator, Partner, Admin can override a curated subset (each scope re-checked against the §6.5 gates).

**Parallel — Accessibility *track* (non-token).** Everything the gates can't reach, owned by component/QA, not Theme Studio: semantic HTML, keyboard operability + focus order, ARIA, alt text / accessible names, form labels + error identification, `prefers-reduced-motion`, reflow/zoom integrity, and manual NVDA/JAWS/VoiceOver passes on the top public flows (marketplace browse, product detail, signup) and core authenticated flows (Design Studio, checkout). Add axe/Lighthouse to CI as a floor; do **not** ship an accessibility overlay widget (litigation magnet + FTC risk).

Sequencing matters: tokens and adoption (0–2) must exist before the editor (3) is meaningful — an editor over tokens nothing consumes does nothing.

---

## 8. Status & open decisions

**Decided / done:** Name = **Theme Studio**. Phase 0 (foundation tokens) and Phase 1 (all nine UI primitives) shipped. Accessibility approach = adopt **WCAG 2.1 AA**, enforce the token-governed criteria as publish-gates (§6.5), track the rest separately.

**Still open:**
1. **Type unit for 1.4.4 (Resize Text).** Keep `--fs-*` px-based (simpler, matches current design) and rely on `--font-scale`/browser-zoom to satisfy 200%, **or** move the ramp to `rem`. Needs a call before Phase 3 locks the contrast/resize gate.
2. **Phase 2 starting surface.** §6.5 says public marketing/marketplace carries the most legal risk, so I'd start there — confirm, or pick another surface.
3. **Commit cadence.** I can't commit from the sandbox; the shared-file token work (theme + 9 primitives + builder) is staged in the commands I gave you. Land those before Phase 2 adds more shared edits.

---

### Sources
- [W3C DTCG / three-tier token architecture (primitive · semantic · component)](https://designsystemproblems.com/token-management/token-tier-system/)
- [Design token naming best practices — Netguru](https://www.netguru.com/blog/design-token-naming-best-practices)
- [Theming architecture: multi-brand systems (base + override)](https://robertcelt95.medium.com/theming-architecture-multi-brand-design-systems-that-actually-work-ad7ed8445fed)
- [Advanced theming with design tokens — runtime CSS variables & scopes](https://david-supik.medium.com/advanced-theming-techniques-with-design-tokens-bd147fe7236e)
- [Design tokens + theming with CSS variables — Penpot](https://penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/)
