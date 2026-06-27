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

## Phase 2 — Type scale + spacing/surfaces ✅ (shipped 2026-06-27)

New **Landing** group in `theme-tokens.ts` (rendered under the editor's
*Foundations* tab via `CATEGORY.foundations`), defaults in `theme.css`:

- **Type (multipliers, default 1 = no change):** `landing-heading-scale`,
  `landing-deck-scale`. The key lesson from the earlier revert — never replace a
  responsive `clamp()` with a fixed size. Instead headings/decks now read
  `text-[calc(<original clamp|rem>*var(--landing-heading-scale))]`, so the fluid
  sizing is preserved and the slider just scales it. Consumed by the shared
  `HeroBanner` (business + marketplace-island heroes) and the home `/` hero
  headline + deck.
- **Spacing:** `landing-hero-py` (96px) drives `HeroBanner`'s page-hero padding;
  `landing-section-py` (96px) drives the home dark niche band. Both default to
  the prior value.
- **Surfaces:** `landing-surface-dark` (#18181A) drives the `HeroBanner` slab +
  the home dark band. (Cream dropped — cream was killed on public surfaces, so a
  cream token would be dead; light = page white, already covered.)

Everything defaults to the exact current values → zero visual change until an
admin moves a slider. Remaining landing surfaces (how-it-works hero, the eight
step bands, `/influencers`) can adopt the same tokens incrementally — the tokens
exist and publish today.

## Phase 3 — Polish

- Per-scope presets for the public marketing surface.
- Motion tokens (reveal distance/duration) if we want `Reveal`/`Parallax`
  tunable.

## Conventions

- Every new token: declare in `theme-tokens.ts` (right group), default in
  `theme.css`, consume via `var(--token)`; never hardcode the value in app code.
- Keep WCAG pairings in `theme-tokens.ts` updated when adding color tokens.
- Sizes/lengths are mode-independent; set the same value in light + dark.
