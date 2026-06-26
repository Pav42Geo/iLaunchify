# Landing-page tokenization → Theme Studio

**Goal (Pavel 2026-06-26):** every adjustable style on the public landing pages
(`/`, `/business`, `/influencers`, `/how-it-works`, marketplace, partner
get-started) is driven by design tokens that an admin can manage in **Theme
Studio** and **publish live** — with the existing WCAG 2.1 AA publish-gates.

This is delivered in phases. The Theme Studio token system already supports the
mechanics: tokens are declared in `packages/db/src/theme-tokens.ts`
(`EditableThemeToken[]`, grouped + typed `color | rgb | length | scale | font`),
defaults live in `packages/ui/src/theme.css`, the editor renders any token by
group (`apps/admin/.../theme-studio/ThemeEditor.tsx`), and publish writes per
scope+mode overrides served as CSS vars. So each phase = add tokens + wire the
consuming CSS, and they appear in Theme Studio automatically.

## Phase 1 — Buttons ✅ (shipped 2026-06-26)

- Added 8 size tokens to the **Buttons** group: `button-h-{sm,md,lg,xl}` +
  `button-px-{sm,md,lg,xl}` (kind `length`, px sliders).
- Defaults in `theme.css`; `packages/ui/src/primitives/button.tsx` now reads
  `h-[var(--button-h-*)] px-[var(--button-px-*)]` for every size.
- New `xl` size (default 60px) = the large landing-hero CTA. All landing CTAs
  (influencers, business, how-it-works heroes + final CTAs, partner
  get-started) use it, so a single Theme-Studio slider resizes them everywhere.
- Colors + radius were already tokenized; sizes now join them in the same panel.

## Phase 2 — Type scale + spacing/surfaces (next)

- **Type:** landing hero/section heading + deck sizes → tokens
  (`landing-h1`, `landing-h2`, `landing-deck`, …) layered on the existing
  `--fs-*` scale, so heading rhythm is adjustable. HeroBanner + section
  components consume them.
- **Spacing:** section vertical rhythm (`landing-section-py`) + hero padding as
  tokens, so density is tunable per the `--space-scale` knob already in Studio.
- **Surfaces:** the dark/light/cream band treatments → surface tokens so the
  alternating-section pattern is themeable.
- Add a **"Landing"** group (or extend Foundations) in the editor.

## Phase 3 — Polish

- Per-scope presets for the public marketing surface.
- Motion tokens (reveal distance/duration) if we want `Reveal`/`Parallax`
  tunable.

## Conventions

- Every new token: declare in `theme-tokens.ts` (right group), default in
  `theme.css`, consume via `var(--token)`; never hardcode the value in app code.
- Keep WCAG pairings in `theme-tokens.ts` updated when adding color tokens.
- Sizes/lengths are mode-independent; set the same value in light + dark.
