# Theme Studio — Expansion Plan: chrome, fields, logos, studios & whole-look presets

_2026-06-25. Answers: can I control form fields, sidebars, headers/footers, logos (full vs thumbnail + sub-brand labels), the Design/Packaging Studio module chrome — and how do I swap the **entire mood board** at once. Builds on the Theme Studio already shipped (tokens · per-scope · draft/preview/publish · WCAG gate · version history)._

---

## 0. The one principle that makes all of this scale

Everything visual becomes either a **token** (a CSS variable a component reads) or a **config** (an uploaded asset / a mapping). Theme Studio edits tokens + configs; the existing **scope** system gives per-app control; the existing **draft → preview → publish → version-history** flow and **WCAG gate** apply automatically.

So every new "controllable" thing is the same three steps:

1. **Define** the token/config (in `theme.css` / a DB model).
2. **Migrate** the component to read it (replace a hardcoded value with `var(--x)`).
3. **Expose** it in the Theme Studio editor.

The real cost is always step 2 — migrating hardcoded surfaces onto tokens. Everything else is plumbing you already have.

---

## 1. What you can control TODAY vs the gaps

| Area | Today | Gap |
|---|---|---|
| Text size / colors / font family | ✅ full | — |
| Brand fills (pink, neon, ink) | ✅ | — |
| Backgrounds (canvas / surface / hero / subtle) | ✅ | — |
| Borders, card/input/button/chip **corners** | ✅ | — |
| **Form fields** — bg, text, placeholder, focus, height | ⚠️ partial (corner + border only) | field bg/text/placeholder/focus/size tokens |
| **Sidebars** — width, colors, fonts, icon size, spacing | ❌ hardcoded (`w-64`, `bg-white`, `text-[13px]`) | a sidebar token family |
| **Headers / Footers** — height, colors, fonts | ❌ hardcoded | header/footer token families |
| **Logos** — upload full / thumbnail, sub-brand labels | ❌ inline CSS square + literal text | an asset + lockup subsystem |
| **Design / Packaging Studio** module chrome, icons | ❌ mostly hardcoded | inherit global tokens + icon-size tokens + a Studio scope |
| **Whole-look swap** ("mood board") | ⚠️ manual (edit every token) | **Theme Presets** (one-click) |

The good news: the four "✅" rows already prove the model works end-to-end. Everything below is the same pattern applied to more surfaces.

---

## 2. Form fields — small, mostly already there

**Status: partial.** Inputs already read `--input-radius` and `--border-soft`. Field *labels* already follow your text-color + body-size tokens. What's missing is dedicated field tokens.

**Plan — add a "Forms" token group:**
`--input-bg`, `--input-text`, `--input-placeholder`, `--input-border` (alias of `--border-soft`), `--input-focus-ring`, `--input-height`, and reuse the body size for `--input-fs`. Migrate the shared `Input` / `Select` / `textarea` primitives (they already consume two of these) to read the rest. Add WCAG pairings (input text on input bg ≥ 4.5; placeholder ≥ 4.5).

**Effort: Small. Risk: low** (value-preserving — defaults = today's white bg / ink-900 text).

---

## 3. Sidebars · Headers · Footers — the biggest visible win

These are the chrome you most want to control, and they're 100% hardcoded today (admin sidebar `w-64 / bg-white / border-ink-200 / text-[13px]`; the `AppHeader` pink-square + wordmark; the landing footer).

**Plan — component-scoped token families** (defaults = current values, so nothing changes until you touch them):

- **Sidebar:** `--sidebar-width`, `--sidebar-bg`, `--sidebar-fg`, `--sidebar-muted`, `--sidebar-active-bg`, `--sidebar-active-fg`, `--sidebar-item-fs`, `--sidebar-icon-size`, `--sidebar-section-fs`, `--sidebar-border`.
- **Header:** `--header-height`, `--header-bg`, `--header-fg`, `--header-border`, `--header-fs`.
- **Footer:** `--footer-bg`, `--footer-fg`, `--footer-fs`, `--footer-border`.

**Migrate** the shared `AppHeader`, each app's sidebar (admin `AdminSidebarTree`, creator/partner nav), and the footers to read these vars instead of hardcoded classes. **Expose** a **"Layout / Chrome"** group in Theme Studio. Because the admin sidebar differs from the creator nav, this is exactly where your **per-scope** system pays off — set sidebar tokens per app. Add WCAG pairings (sidebar fg on sidebar bg, active fg on active bg, header fg on header bg).

**Effort: Medium** (per-app chrome migration). **Risk: medium** but contained — value-preserving defaults mean a bad token can only affect chrome, and the WCAG gate blocks unreadable combos.

---

## 4. Logos + sub-brand lockups — a small new subsystem (asset + config)

This is **not** a token — it's brand assets plus a "lockup" mapping. Today the logo is a pink CSS square + the literal word "iLaunchify", with " Business" hardcoded in neon. You want: upload a **full logo** and a **thumbnail/mark**, choose where each is used, and attach **sub-brand labels** ("Design Studio", "Packaging Studio", "Admin Mode", "Business").

**Plan:**

1. **`PlatformBrandAsset` model** — `kind` (FULL_LOGO · MARK/THUMB · WORDMARK), `variant` (light · dark), `storageKey`, intrinsic width/height. Upload via your existing `packages/storage` signed URLs (reuse the creator Brand-Kit upload flow — it already works).
2. **Lockup registry** (`ThemeLockup`, JSON or rows) — maps each **surface/app/module** → `{ logo: full | mark, label?: "Design Studio" | "Packaging Studio" | "Admin Mode" | "Business" | …, labelColorToken }`. This is what lets `[logo] + "Design Studio"` vs `[logo] + "Admin Mode"` be configured rather than coded.
3. **A shared `<Brand>` component** that renders `chosen logo (+ optional sub-label)` from the active asset + the current surface's lockup — replaces `AppHeaderBrandMark` and the inline `BusinessHeader` wordmark everywhere.
4. **Theme Studio → "Brand & Logos" sub-page:** drag-drop upload (full + thumbnail, light + dark), live preview, and a lockup editor (per app/module: pick logo variant + sub-label + label color). Fallback to the current pink-square + wordmark when no asset is uploaded (so nothing breaks pre-upload).

**Effort: Medium–Large** (asset model + upload UI + lockup editor + `<Brand>` + swapping inline logos across apps). **Risk: medium.** This is the one item that's genuinely new infrastructure rather than "tokenize what exists."

---

## 5. Design Studio / Packaging Studio module chrome — control more globally

The Studios are large canvas editors (panels, tool rails, icons). You want global control of their text size, icons, etc.

**Best solution — two layers:**

1. **Make them consume the global tokens** (free leverage): they already inherit `--font-scale`, text colors, and your radius/border tokens since they live in the creator/partner apps. Confirm the Studio chrome uses the shared primitives/tokens rather than one-off hardcoded values, and the **per-scope** (creator/partner) overrides already reach them.
2. **Add the missing global knobs they need:**
   - **Icon sizes** — an `--icon-sm / --icon-md / --icon-lg` token set + a small `<Icon size>` convention; migrate Studio (and chrome) icons onto it. Full icon tokenization is a phased per-surface sweep (icons are everywhere via lucide) — do the Studios + chrome first.
   - **A "Studio" token group** for the bits unique to the editors: `--studio-rail-width`, `--studio-panel-bg`, `--studio-tool-fs`, `--studio-icon-size`. Scoped to creator/partner.

**Effort: Large** (the Studios are big). **Recommendation: phase it** — step 1 (inherit globals) is nearly free and gets you most of the way; add Studio-specific tokens only where the global ones aren't enough.

---

## 6. Swap the WHOLE mood board at once — **Presets** (recommended), Generator (later)

This is the headline ask, and your constraint ("once we decide, we won't change it for a while") points clearly at one answer.

**Recommended: Theme Presets.** A preset is a complete, named snapshot of **all** token values — i.e., a whole mood board. You already have the snapshot machinery (`ThemeVersion`); a preset is the same idea, named and reusable.

- **`ThemePreset` model** — `name`, `tokens` (full JSON), `builtin`, optional `thumbnail`.
- **Seed 3–5 curated presets** — the current locked look ("Pink Neon"), plus alternatives ("Editorial Serif", "Mono Minimal", "Warm Cream", "Dark Neon"). Each is pre-contrast-checked.
- **A "Presets" gallery** in Theme Studio: each shows a swatch/typography preview; **Apply** loads *all* its tokens into the current scope's **draft** → you **Preview** across the apps → **Publish**. So switching the entire look = one click + publish, and it's fully reversible via version history.
- **"Save current as preset"** — capture the live theme as a named preset for later reuse.

**Why presets over a generator here:** presets are curated, locked-quality, contrast-safe, one-click, reversible, and perfect for an infrequent "pick the final look and keep it." A generator is exploratory and more engineering.

**Optional later: Theme Generator.** From a seed (primary brand color + a style + light/dark), auto-derive a full, contrast-safe token set (generate the ramps, map semantics, auto-correct pairings to pass WCAG). Great for *exploring* directions; build it **after** presets if you want a "surprise me" button. Not needed for the core goal.

---

## 7. New token families & configs (at a glance)

- **Tokens (theme.css + allowlist):** Forms · Sidebar · Header · Footer · Icon sizes · Studio.
- **Configs (DB):** `PlatformBrandAsset` (uploads) · `ThemeLockup` (logo + label mapping) · `ThemePreset` (full snapshots).

All of them flow through the machinery you already shipped: scopes, draft/preview/publish, the WCAG pairing gate, audit, and version history. No new infrastructure for any of the token work — only the logo subsystem and presets add models.

---

## 8. Recommended rollout order

| Phase | Scope | Effort | Why here |
|---|---|---|---|
| **A** | Form-field tokens + Icon-size tokens | S | Quick wins; closes the "fields" gap; icons unblock chrome + studios |
| **B** | Chrome tokens (sidebar / header / footer) + migrate chrome | M | The biggest visible control you asked for |
| **C** | **Theme Presets** (mood-board switching) | M | The headline "change the whole look" capability |
| **D** | Logos & lockups (upload + `<Brand>` + lockup editor) | M–L | New subsystem; high brand value |
| **E** | Studio module tokenization | L (phased) | Large surface; do after the shared tokens exist |
| **F** | Theme Generator (optional) | M | Exploration nicety; only if wanted |

**My recommendation:** **B + C first.** Together they deliver exactly the experience you described — control the chrome (sidebars/headers/footers) *and* swap the entire mood board in one move, preview it across all apps, and publish (or roll back). Then **D** (logos) for full brand control, then **A/E** as polish, and **F** only if you want a generator.

---

## 9. Guardrails (carried forward, unchanged)

- Every new **color** token gets a WCAG pairing (field text on field bg, sidebar fg on sidebar bg, header/footer fg on their bgs, sub-label on its surface) → publishing an unreadable chrome is blocked.
- **Locked-brand** protection stays: curated, contrast-checked presets; raw brand primitives protected.
- **Per-scope** + **version history** mean every change is reversible and roll-back-able — important precisely because you'll set a final look and keep it.

---

## 10. Direct answer to "is field control in Theme Studio already?"

Partly. Field **corners** and **border** are controllable now; field **background, text, placeholder, focus ring, and height** are the small Phase-A addition. Sidebars, headers, footers, logos, and Studio chrome are **not** controllable yet — they're Phases B/D/E above, all using the same token-or-config pattern. And the "switch the whole mood board" capability is **Phase C (Presets)**, which is the cleanest fit for a look you'll set once and keep.
