# Design System — V1 Spec

**Status:** Locked 2026-05-27 after exploration of multiple directions (Terra/Eucalyptus/Cherry/Tangerine — all superseded).
**Owner:** Pavel + Claude
**Methodology:** Object-Oriented UX (OOUX) per `OOUX_OBJECT_MAP.md` — components map to platform objects, not to screens. Read OOUX first when adding anything new.
**Companion artifacts:**
- `design/mood-board-neon.html` — full visual reference, all tokens rendered
- `design/marketplace-mockup.html` — creator-surface canonical example (white header)
- `design/business-landing.html` — partner-surface canonical example (dark header)
**Companion docs:** `OOUX_OBJECT_MAP.md` (object inventory + relationships + content priorities), `MARKETPLACE_DESIGN.md`, `DESIGN_STUDIO_REBUILD.md`, `PRODUCTION_ORCHESTRATION.md`, `PRINT_PRODUCTION_WORKFLOW.md`.
**Scope:** the visual language for every iLaunchify surface — creator marketplace, business partner landing, app shells (creator/partner/admin), Design Studio canvas chrome. Locks color, type, spacing, radius, motion, components, iconography, photography direction, accessibility.

---

## TL;DR

**Pink brand · Black pill button (white text) · Neon green accent · Inter + Bricolage + Fraunces italic emphasis.**

Three colors carry the whole identity: hot pink as the brand, near-black as the primary button fill, electric neon green as the accent on dark surfaces only. White (creator) or solid black (partner) headers signal which audience a surface is for. The platform serves two audiences through one design DNA, switched by surface attributes — not by ripping up the system.

Earlier exploration (warm terracotta, Eucalyptus forest green, cherry red, tangerine) is documented in superseded mood boards. Don't reach back to those — they're not the system.

---

## 1. The two-audience thesis

iLaunchify has two audiences that share the platform but never share a surface:

| | Creator surfaces | Partner surfaces |
|---|---|---|
| Audience | Influencers, F&B/culinary/fitness creators, brand launchers, agencies | Manufacturers, label printers, co-packers, warehouses, logistics |
| Goal | Belief → action. Aspirational, fast to "Start launching." | Daily-tool clarity. Operational throughput. |
| **Header** | **WHITE** with pink logo mark, dark text | **SOLID BLACK** with pink logo mark, white text + neon "Business" wordmark |
| Primary CTA | Black pill, white text | Neon-green pill, black text (the inverse) |
| Surfaces | Marketing (`/`) · Marketplace · Brand Assets · Design Studio · Niche landing | Business landing (`business.ilaunchify.com`) · Partner app · Order inbox · Verification queue |
| Density | Comfortable (24px card padding, generous whitespace) | Compact (16px padding, dense tables, dark-mode default for long sessions) |
| Editorial layer | Fraunces italic emphasis on hero moments | Same — but tighter, fewer pop accents |

**The single most important visual rule:** never put a dark header on a creator surface, and never put a white header on a partner surface. The header color is the audience-signal. Confuse it and the dual-audience system collapses.

---

## 2. Color system

### 2.1 Pink (brand)

```
50   #FFE9F0   subtle wash · active filter chip bg
100  #FFD0E0
200  #FFB3CC
300  #FF7FA8
400  #FF5285
500  #FF2E63   ★ BRAND — logo mark, active filter chip fill, focus rings, hero glows
600  #E91E5A   hover for pink fills
700  #C71350   ★ accent TEXT on white (passes AA 6.21:1)
800  #9E0E40
900  #6E0A2D
```

### 2.2 Neon green (accent — DARK SURFACES ONLY)

```
300  #D4FF7A   pale neon
400  #C2FF4D   hover state
500  #B5FF3D   ★ ACCENT — italic emphasis on dark, neon CTA fill, verify ✓, stat numbers on dark
600  #9EE61F   pressed
```

**Critical rule:** neon green is illegible on white (1.3:1 contrast). It only ever appears on dark surfaces. On light surfaces, pink-700 takes its place as the accent.

### 2.3 Ink (cool near-neutral)

```
50   #F8F8F9   subtle canvas
100  #EEEFF1   subtle surface fill
200  #E0E1E5   border-soft
300  #CBCCD3   border-firm
400  #9A9CA6
500  #6B6D78   tertiary text on light
600  #474954   secondary text on light
700  #33343C   subtle dark surface
800  #232327   dark elevated surface
900  #18181A   ★ PRIMARY TEXT on light / PRIMARY CANVAS on dark / button fill
```

### 2.4 Semantic

| Token | Hex | On white | Use |
|---|---|---|---|
| `success-500` | `#1E7C4A` | 4.71:1 ✓ AA | verified, success states |
| `success-50` | `#E5F2EC` | — | success badge bg |
| `warning-500` | `#B07A0A` | 4.55:1 ✓ AA | pending, attention |
| `warning-50` | `#FBEFD3` | — | warning badge bg |
| `danger-500` | `#B33636` | 5.13:1 ✓ AA | rejected, destructive |
| `danger-50` | `#F8E1E1` | — | danger badge bg |
| `info-500` | `#1F4D8F` | 8.34:1 ✓ AAA | informational, Premier tier |
| `info-50` | `#E1ECF8` | — | info badge bg |

### 2.5 The surface-driven color rules

```
LIGHT surface (white / cream canvas):
  brand accent  →  pink-500 (fill) / pink-700 (text)
  emphasis      →  Fraunces italic in pink-500 or pink-700
  primary CTA   →  black pill, white text  (.btn-primary)
  big numbers   →  pink-500 or pink-700

DARK surface (ink-900 canvas):
  brand accent  →  pink-500 still works (white-on-pink 3.39:1 = large/UI only)
  emphasis      →  Fraunces italic in NEON-500
  primary CTA   →  NEON-500 pill, ink-900 text  (.btn-neon)
                   (creator app keeps white pill black text on its dark sections;
                    business surfaces use neon — it's the audience-differentiation)
  big numbers   →  NEON-500
```

### 2.6 Anti-patterns

- ❌ Neon green text on white (1.3:1 — invisible)
- ❌ Pink text on white at small size without using pink-700 (3.39:1 fails AA)
- ❌ Pure `#000000` or `#FFFFFF` — use `ink-900` and `white` semantically
- ❌ Outer colored glow shadows on buttons (explicitly disliked)
- ❌ Black header on creator surface OR white header on partner surface (breaks audience-signal)

---

## 3. Typography — three faces, strict role separation

```
Inter            workhorse — UI, body, data tables, forms, captions, nav, button labels
Bricolage        bold display headlines (700/800 only, very tight letter-spacing)
Fraunces         italic emphasis ONLY (single span per headline, color = pink-700 on light / neon-500 on dark)
```

Self-hosted via Fontsource (no CDN dependency in prod). Subset to Latin + Latin Extended for V1.

### 3.1 Type scale

| Token | Family | Size | Weight | Line | Letter-spacing | Use |
|---|---|---|---|---|---|---|
| `display-xl` | Bricolage | 64px | 800 | 1.0 | -0.035em | Welcome moments, big hero moments inside app |
| `display-lg` | Bricolage | 44px | 700 | 1.05 | -0.03em | Empty states, hero cards, section heroes |
| `display-md` | Bricolage | 34px | 700 | 1.05 | -0.02em | Section heads |
| `heading-lg` | Inter | 28px | 700 | 1.2 | -0.02em | Page titles, detail page product name |
| `heading-md` | Inter | 20px | 600 | 1.3 | -0.01em | Card titles, modal titles |
| `heading-sm` | Inter | 16px | 600 | 1.4 | 0 | Subsection heads |
| `body-lg` | Inter | 18px | 400 | 1.6 | 0 | Lead paragraphs |
| `body-md` | Inter | 15px | 400 | 1.55 | 0 | Default body |
| `body-sm` | Inter | 13px | 400 | 1.5 | 0 | Helper text, metadata |
| `label-sm` | Inter | 11px | 600 | 1.4 | +0.06em UPPERCASE | Eyebrows, table column heads, niche caps labels |

### 3.2 Italic emphasis pattern

The signature headline pattern across both audiences:

```html
<h1>
  Find your product. <em>Make it yours.</em> Launch it.
</h1>
```

- `<em>` renders Fraunces italic, 500 weight.
- Color: `pink-700` on light surfaces / `neon-500` on dark.
- One `<em>` per headline maximum.

### 3.3 Rules

- Max 4 active sizes per surface.
- ALL CAPS always carries +0.06em letter-spacing minimum.
- Bricolage roman only (no italic Bricolage — italic is Fraunces's job).
- Body never uses Bricolage or Fraunces.

---

## 4. Spacing — strict 8pt grid

```
s-1   4px    fine-tune inside components
s-2   8px    minimum component-internal spacing
s-3   12px   button/input internal padding
s-4   16px   compact card padding (partner mode)
s-5   24px   comfortable card padding (creator mode)
s-6   32px   between distinct content blocks
s-7   48px   section breathers
s-8   64px   hero / major section gaps
s-9   96px   landing page section gaps
s-10  128px  marketing surface section gaps
```

**Internal-≤-external rule:** spacing inside a component never exceeds spacing around it. Single most-broken rule in early drafts; enforce on every new component.

### 4.1 Density modes

| | Creator mode | Partner mode |
|---|---|---|
| Card padding | s-5 (24px) | s-4 (16px) |
| Section gap | s-7 (48px) | s-5 (24px) |
| Stack gap | s-4 (16px) | s-2 (8px) |
| Table row padding | n/a | 10–12px vertical |

Toggled by `<html data-surface="creator">` / `<html data-surface="partner">` at the root.

---

## 5. Radius

```
xs    4px     nested elements (badges inside cards)
sm    6px     small tags, sample chips
md    8px     buttons (when not pill), inputs, default
lg    12px    cards, modals
xl    16px    marketplace product cards
pill  999px   ★ ALL PRIMARY BUTTONS — full pill is the system signature
```

Buttons are always full pill. The visual signal "this is iLaunchify" lives partly in the pill shape.

Nested elements always have *smaller* radius than parent.

---

## 6. Shadows

```
shadow-sm   0 1px 2px rgba(24,24,26,0.06)
            inputs at rest, subtle hairline lift

shadow-md   0 4px 10px rgba(24,24,26,0.08)
            elevated cards, dropdowns

shadow-lg   0 12px 28px rgba(24,24,26,0.12)
            modals, marketplace card hover

shadow-xl   0 24px 48px rgba(24,24,26,0.16)
            sticky panels, full-screen overlays
```

**No colored glow shadows.** Explicitly rejected during exploration. Buttons get no outer glow.

Dark mode: shadows mostly disappear. Use lighter surfaces for elevation (ink-800 over ink-900).

---

## 7. Motion

```
duration-quick  120ms    button press, micro-feedback
duration-base   220ms    most state changes, hover
duration-slow   320ms    modal enter/exit, drawer slide

ease-out        cubic-bezier(0.16, 1, 0.3, 1)    entering
ease-in         cubic-bezier(0.7, 0, 0.84, 0)    leaving
ease-bounce     cubic-bezier(0.34, 1.56, 0.64, 1)  CTAs only — sparingly
```

**Rules:**
- Animate only `transform` and `opacity` (GPU-accelerated).
- `ease-bounce` is for the primary CTA hover and nothing else. Decorative bounce is forbidden.
- `prefers-reduced-motion: reduce` globally disables transitions and animations.

---

## 7.5 Components map to objects, not screens (OOUX rule)

Every component in this system maps to one of the platform's objects (per `OOUX_OBJECT_MAP.md`). When adding a component, identify the object it renders first — only then design the visual treatment. A `ProductCard` and `ProductDetailHero` are different *sizes* of the same `ProductTemplate` object view; they share data, attribute formatting, and CTAs and differ only in which attributes render at which fidelity.

If a proposed component doesn't map cleanly to an object, stop — it's probably either a missing object (add to OOUX inventory) or a composition pattern (belongs in a parent surface spec, not a component).

The component list below is organized by primitive first (the building blocks), then by object-component (the things that render an object). See `OOUX_OBJECT_MAP.md` §6 for the full Object → Component map.

---

## 8. Component primitives

### 8.1 Button

Built on shadcn/Radix `Slot`. Five variants, all full pill.

| Variant | Fill | Text | Use |
|---|---|---|---|
| `primary` | `ink-900` | `#fff` | Default CTA on light surfaces — marketplace `Start launching`, creator app actions |
| `neon` | `neon-500` | `ink-900` | Primary CTA on dark surfaces — business landing `Apply now` |
| `pink` | `pink-500` | `#fff` | Secondary brand action (rare — most actions use `primary`) |
| `secondary` | `#fff` | `ink-900` + hairline border | Cancel, secondary actions |
| `ghost` | transparent | inherits | Tertiary, low-priority |

Height scale: `sm 36px` / `md 44px` (default) / `lg 52px`.

**One primary or neon button per screen section.** Supporting actions are secondary / ghost.

### 8.2 Input

```
height       44px (matches button md)
border       1px ink-300 at rest
focus ring   3px pink-500/15% alpha + border-color pink-500
radius       md (8px)
```

### 8.3 Card

Default padding: `s-5 (24px)` creator mode, `s-4 (16px)` partner mode.
Border: `1px ink-200`.
Radius: `lg (12px)` general, `xl (16px)` marketplace product cards.

### 8.4 Badge

Pill shape (`r-pill`), 11px / 600 weight, +0.02em letter-spacing.

Variants: success / warning / danger / info / neutral / pink (new) / neon (live — dark sections only).

### 8.5 Chip (filter)

Pill shape, 13px regular.
Default: outlined (`border-firm` + `#fff` bg).
Active: filled (`bg pink-500` + white text).

### 8.6 ProductCard (marketplace signature)

The richest component in the system.

```
Image area (1:1, colored gradient):
  - Status badge top-left (Bestseller / New / Fast ship / Low MOQ / Top rated / Popular)
  - Verify check top-right (neon-500 ✓ circle)
  - Centered product emoji/icon
  - Heart favorite bottom-right

Body:
  - Niche caps label (11px UPPERCASE, ink-500)
  - Title (14px / 700 / -0.01em, ink-900)
  - Cert tag chips (USDA Organic chip = neon-500 fill; others = neutral pill)
  - Footer row: MIN UNITS · LEAD TIME · PRICE (price in pink-700, NO CTA button)
```

Gradient palette for image area: 9 pastels — lime, pink, purple, yellow, cyan, coral, mint, blush, sky.

5 cards per row on desktop, responsive down to 1.

### 8.7 StatusPill

Used on ProductCard top-left. Variants: Bestseller / New / Fast ship / Low MOQ / Top rated / Popular. Default = white background, dark text; `pink` variant = pink-500 background, white text; `dark` variant = ink-900 background, white text.

### 8.8 HeroBanner

Dark slab with pink radial glow, used as a feature island inside marketplace and as the hero on partner landing. Bricolage display copy, neon "eyebrow" caps label, white or neon CTA depending on audience.

### 8.9 Navigation

| | Creator marketplace | Business landing |
|---|---|---|
| Top bar height | 56px | 56px |
| Background | white | ink-900 |
| Logo mark | pink square | pink square |
| Logo wordmark | `iLaunchify` (ink-900) | `iLaunchify` (white) + `Business` (neon-500) |
| Primary CTA | `Start launching` — black pill, white text | `Apply now` — neon pill, black text |
| Subnav | Niche tabs (pink underline on active) | Plain text nav links (white) |

---

## 9. Iconography

Lucide line icons throughout. `lucide-react` already in the stack.

```
default      20px, stroke 1.75
dense        16px (table cells, inline metadata)
marketing    24px (hero accents, marketing surfaces)
color        currentColor (inherits)
```

Never mix Lucide with another icon family.

---

## 10. Photography direction

Three contexts, all warm and crafted (never stock-photo glossy).

| Context | What it is | Where it appears |
|---|---|---|
| **Creator** | Tight portrait crops, punchy daylight, products on pop-color gradient backgrounds | Marketplace hero banners, niche landing pages, creator testimonials |
| **Product** | Single product on a color-blocked pop background (pink / lime / lilac / yellow / cyan / coral) | Marketplace card hover state, detail page hero |
| **Partner studio** | Equipment + people, clean composition, cool neutral palette | Business landing partner-feature, partner-recruitment surfaces |

V1 commission: ~12 photographs (3 creator portraits + 4 product hero shots + 3 partner studio + 2 lifestyle). Roughly $10–15k commission budget.

---

## 11. Dark mode

Two distinct dark-mode contexts:

1. **Business landing dark sections** — explicitly dark by design (header, hero, partner types, final CTA). Not a "mode" the user toggles; just the surface's nature.
2. **Partner app dark mode** — opt-in / default-for-long-sessions, V1.5 target.

### 11.1 Dark surface tokens

```
bg-canvas    →  ink-900 (#18181A)
bg-surface   →  ink-800 (#232327)   ← lighter to create elevation
bg-subtle    →  ink-700 (#33343C)
border-soft  →  rgba(255,255,255,0.06)
border-firm  →  rgba(255,255,255,0.12)

text-primary    →  #FFFFFF (or off-white #EEEFF1 for long-reading surfaces)
text-secondary  →  ink-300
text-tertiary   →  ink-400

accent          →  neon-500 (button text on neon button — see §2.5)
emphasis-italic →  Fraunces italic in neon-500
```

### 11.2 Rules

- Elevation = lighter surface, never more shadow.
- Off-white for text on long-reading surfaces (`#EEEFF1`), pure white only for very short text moments.
- Saturated colors stay 500 on dark (no desaturation needed — pink-500 and neon-500 both hold up on ink-900).
- Borders are semi-transparent white, never solid gray.

---

## 12. Accessibility — WCAG 2.1 AA

### 12.1 Verified contrast pairs

| Pair | Ratio | Body 4.5:1 | Large/UI 3:1 |
|---|---|---|---|
| ink-900 on white | 17.1:1 | ✓ AAA | ✓ AAA |
| ink-900 on cream `#FBFAF7` | 16.5:1 | ✓ AAA | ✓ AAA |
| ink-600 on white | 8.9:1 | ✓ AAA | ✓ AAA |
| ink-500 on white | 4.92:1 | ✓ AA | ✓ AA |
| white on ink-900 (button text) | 17.1:1 | ✓ AAA | ✓ AAA |
| neon-500 on ink-900 (button text) | 16.4:1 | ✓ AAA | ✓ AAA |
| pink-700 text on white | 6.21:1 | ✓ AA | ✓ AA |
| pink-700 on pink-50 (badge) | 5.74:1 | ✓ AA | ✓ AA |
| white on pink-500 (pink button) | 3.39:1 | ✗ body | ✓ Large/UI only |
| success-500 on white | 4.71:1 | ✓ AA | ✓ AA |
| danger-500 on white | 5.13:1 | ✓ AA | ✓ AA |
| info-500 on white | 8.34:1 | ✓ AAA | ✓ AAA |
| neon-500 on white | 1.3:1 | ✗ FAIL | ✗ FAIL — never |

### 12.2 The two contrast traps to remember

1. **Neon green is dark-surface-only.** On white it's invisible.
2. **Pink-500 fails body-text on white** (3.39:1). For pink text on light, always use `pink-700`. Pink-500 is for fills only.

### 12.3 Beyond contrast

- **Focus rings:** 3px `pink-500 / 15%` on light surfaces, 3px `neon-500 / 25%` on dark.
- **Touch targets:** ≥ 44 × 44px on touch surfaces.
- **Color never alone:** every state pairs color with an icon or text.
- **Semantic HTML:** `<button>` for actions, proper heading hierarchy, landmark regions.
- **`prefers-reduced-motion: reduce`** globally disables transitions and animations.
- **Skip link** as the first focusable element on every page.

---

## 13. Implementation — file layout

```
packages/ui/
├── src/
│   ├── tokens/
│   │   ├── colors.ts          ★ typed color exports (pink, neon, ink, semantic)
│   │   ├── typography.ts      ★ font-family + type scale
│   │   ├── spacing.ts         ★ 8pt grid
│   │   ├── radii.ts
│   │   ├── shadows.ts
│   │   ├── motion.ts
│   │   └── index.ts
│   ├── theme.css              ★ :root + [data-surface="dark"] + [data-surface="cream"] CSS vars
│   ├── primitives/
│   │   ├── button.tsx         (refactored to use platform tokens — DS-3)
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx          (DS-4)
│   │   ├── chip.tsx           (DS-4)
│   │   └── ...
│   ├── components/
│   │   ├── ProductCard.tsx    (DS-5 — the marketplace signature)
│   │   ├── HeroBanner.tsx     (DS-6)
│   │   ├── StatusPill.tsx     (DS-4)
│   │   └── VerifyCheck.tsx    (DS-4)
│   └── index.ts
└── tailwind.preset.ts         ★ shared Tailwind config every app imports

apps/marketing/                 (new in DS-7)
├── src/app/
│   ├── page.tsx                creator marketplace home
│   ├── business/page.tsx       business partner landing
│   └── ...
└── tailwind.config.ts          imports @ilaunchify/ui preset

apps/creator, apps/partner, apps/admin
└── tailwind.config.ts          imports @ilaunchify/ui preset (DS-9 swap)
```

The ★ files are this phase's deliverable (DS-1 + DS-2).

---

## 14. Build sequence

| Phase | Scope | Status |
|---|---|---|
| **DS-1** | Rewrite `docs/DESIGN_SYSTEM.md` for the locked direction | ✓ this file |
| **DS-2a** | `packages/ui/src/tokens/*.ts` — typed token exports | ⏳ this sprint |
| **DS-2b** | `packages/ui/src/theme.css` — CSS custom properties + `data-surface` theming | ⏳ this sprint |
| **DS-2c** | `packages/ui/tailwind.preset.ts` — shared Tailwind config | ⏳ this sprint |
| DS-3 | Self-host Inter + Bricolage + Fraunces via Fontsource | ☐ |
| DS-4 | Refactor `Button` to use platform tokens + add `neon` and `pink` variants; add `Badge`, `Chip`, `StatusPill`, `VerifyCheck` | ☐ |
| DS-5 | Build `ProductCard` component | ☐ |
| DS-6 | Build `HeroBanner` component | ☐ |
| DS-7 | Scaffold `apps/marketing` Next.js app | ☐ |
| DS-8 | Build the marketplace page in `apps/marketing` using real components | ☐ |
| DS-9 | Build the business landing page in `apps/marketing` using real components | ☐ |
| DS-10 | Swap tokens in `apps/creator` / `apps/partner` / `apps/admin` to use the new preset | ☐ |
| DS-11 | Smoke-test all surfaces · accessibility audit · visual diff vs. mood boards | ☐ |

---

## 15. Cross-doc references

- [[ilaunchify-design-system-v1]] — locked memory note with full rules
- [[ilaunchify-orchestration-thesis]] — why ProductCard hides partner identity
- [[ilaunchify-business-model]] — why two distinct landing audiences exist
- `MARKETPLACE_DESIGN.md` — marketplace layout architecture (Option C hybrid header + filter sidebar + niche subnav)
- `LANDING_SYSTEM_STUDIO_POP.md` — the Studio Pop landing system spec (superseded by this — Studio Pop was an earlier exploration that fed into the locked design)

---

## 16. Anti-patterns (one place, easy to find)

- ❌ Black header on creator surface — breaks audience-signal
- ❌ White header on partner surface — breaks audience-signal
- ❌ Neon green on white (1.3:1 — invisible)
- ❌ Pink-500 for body text on white — fails AA; use pink-700
- ❌ Outer colored glow shadows on buttons
- ❌ Pure `#000` or `#FFF` — use `ink-900` and `white`
- ❌ More than one Fraunces italic emphasis per headline
- ❌ Bricolage in body text — display only
- ❌ Italic Bricolage — Fraunces does italic
- ❌ Mixing icon families with Lucide
- ❌ Stock photography
- ❌ Marquee tickers, animated meshes, decorative bounce (existed in early Studio Pop drafts — dropped)
- ❌ Reintroducing partner identity on marketplace cards — orchestration thesis still applies
- ❌ "Inquire" or any CTA button on the product card — price displays instead
- ❌ Random spacing values — 8pt grid always
- ❌ Random font sizes — type scale always
- ❌ Internal spacing greater than external spacing
