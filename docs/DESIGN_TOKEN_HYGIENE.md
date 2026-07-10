# Design Token Hygiene — hardcoded-color audit + lint spec

**Created 2026-07-09 (Cowork).** Companion to `DESIGN_SYSTEM.md` (LOCKED). This is the enforcement layer: it defines what counts as a real token violation, what is legitimate raw hex, and the narrow lint rule that catches the former without drowning in the latter.

## TL;DR — the count was misleading

A raw `grep "#[0-9a-fA-F]{6}"` across `apps/*/src` returns a scary number (~570 lines). **Almost all of it is legitimate.** When inspected line-by-line, the hex falls into four legit buckets and one real-violation bucket:

| Bucket | ~share | Verdict |
|---|---|---|
| **SVG hero-illustration art** — `stopColor`, `<path fill>`, `<g stroke>`, gradient defs, the `Pouch({ hue })` art component | large | **Legit.** SVG paint attributes cannot take Tailwind classes; self-contained illustrations may carry their own hex. |
| **Color-picker / swatch data** — `STAPLE_INK`, `STAPLES`, `STAPLE_BG`, `BackgroundDrawer`, `PalettesSection`, `TextFormatToolbar` arrays | medium | **Legit.** The hex is user-selectable *content*, not chrome. |
| **Hex-input defaults & placeholders** — `n.accentHex || '#FF2E63'`, `placeholder="#FF2E63"`, `colorPrimary ?? '#FF2E63'` | medium | **Legit.** Fallback for DB/user-driven color fields. |
| **Comments / help text** — JSDoc, `ExportModal` CMYK note | small | **Legit.** |
| **Chrome hardcoding a brand hex where a token class exists** — `bg-[#B5FF3D]`, `bg-[#B5FF3D]/30`, `bg-[#FF2E63]` on real UI elements | **~13 occurrences** | **VIOLATION.** This is the only bucket to lint. |

The real fixable debt was **~13 occurrences**, not ~570. Ten were fixed in this pass; three remain in Code-owned hot zones (below).

## The rule (what a violation is)

> A violation is an **arbitrary-value Tailwind color class** (`bg-[#..]`, `text-[#..]`, `border-[#..]`, `ring-[#..]`) whose hex equals a **known brand token** (`#FF2E63`, `#B5FF3D`, `#C71350`, `#FFE9F0`, and the `pink-*` / `neon-*` scale), where the equivalent token class already exists.

Everything else — SVG paint attributes, JS color arrays/strings, `placeholder=`, `?? '#hex'` fallbacks, comments — is **not** a violation.

Token map:

| Hex | Token class |
|---|---|
| `#FF2E63` | `pink-500` |
| `#E91E5A` | `pink-600` |
| `#C71350` | `pink-700` |
| `#FFE9F0` | `pink-50` |
| `#B5FF3D` | `neon-500` |
| `#9EE61F` (≈ `#A4F127`, `#9be62a`) | `neon-600` (hover) |

Alpha works: `bg-neon-500/30`. Both `pink-*` and `neon-*` are exposed by `packages/ui/tailwind.preset.ts` via `channelScale`.

## Narrow lint rule (recommended)

Add to `scripts/check-invariants.mjs` (the existing deterministic floor). Do **not** ban raw hex globally — it would fire ~300 false positives and get switched off.

```js
// Flag ONLY arbitrary-value color classes matching a brand token.
const BRAND = 'ff2e63|e91e5a|c71350|ffe9f0|b5ff3d|9ee61f';
const VIOLATION = new RegExp(
  `(bg|text|border|ring|from|to|via)-\\[#(${BRAND})\\]`, 'i'
);
// Run over apps/*/src/**/*.tsx, EXCLUDING the allowlist globs below.
// Fail with: "Use the token class (bg-neon-500) not bg-[#B5FF3D]. See docs/DESIGN_TOKEN_HYGIENE.md"
```

Because it targets the `class-[#hex]` shape, it inherently ignores SVG `fill=`, JS arrays, `placeholder=`, and comments — no allowlist needed for those. The allowlist below is only for the rare file that legitimately uses a brand-hex *class* (none today).

## Allowlist globs (legit raw hex — never lint these paths for raw hex)

If you ever add a broader raw-hex check, exclude:

```
apps/*/src/app/**/design/canvas/**        # Design Studio — color pickers, swatches, canvas paint
apps/*/src/**/*Chart*.tsx                 # chart series colors
apps/*/src/app/global-error.tsx           # renders outside the theme provider
apps/creator/src/app/**/brands/**/assets/PalettesSection.tsx  # palette editor
apps/*/src/**/*Drawer*.tsx                # studio drawers = swatch data
**/*  where hex appears only in: fill= stroke= stopColor= placeholder= or a // comment
```

## Fixed in this pass (2026-07-09)

`bg-[#B5FF3D]` / `bg-[#B5FF3D]/30` / hover hex → `bg-neon-500` / `bg-neon-500/30` / `hover:bg-neon-600`:

- `apps/admin/.../packaging-studio/[id]/PackagingDetailClient.tsx` (×3)
- `apps/admin/.../asset-management/die-cut-templates/DieCutTemplatesClient.tsx` (×1)
- `apps/creator/.../checkout/success/page.tsx` (×1)
- `apps/creator/.../orders/[orderId]/page.tsx` (×1, + hover)
- `apps/creator/.../orders/page.tsx` (×1, + hover)
- `apps/marketing/src/components/BusinessPromoCard.tsx` (×2)
- `apps/marketing/src/components/DecorationPicker.tsx` (×1)

## Handed to Code (hot zones — single-writer, not touched here)

- `apps/creator/.../design/canvas/drawers/FlavorLabelSections.tsx` — `bg-[#B5FF3D]/30` (×2). Design Studio canvas = Code's zone.
- `apps/partner/.../products/new/TurnkeyProductFlow.tsx:575` — `bg-[#FF2E63]` (×1). Partner New-Product builder = hot zone.

## Dead code to remove

`apps/marketing/src/app/proto/page.tsx` — an **unlinked** prototype route (nothing hrefs `/proto`; `ProcessSteps.tsx` already carries its own extracted copy). ~83 hex occurrences, all illustration. Remove with `git rm` (the Cowork sandbox can't delete files).
