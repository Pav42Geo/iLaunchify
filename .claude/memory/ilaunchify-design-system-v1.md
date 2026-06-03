---
name: ilaunchify-design-system-v1
description: "iLaunchify V1 design system LOCKED 2026-05-27 after several pivots. Pink #FF2E63 brand + black pill button (white text) + neon green #B5FF3D accent (dark surfaces only) + pink-700 accent (light surfaces) + Inter + Bricolage + Fraunces italic emphasis + dark/light section pattern. Earlier mood boards in terracotta/tangerine/Eucalyptus are SUPERSEDED."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

**Methodology (Pavel 2026-05-28):** Design is built under **Object-Oriented UX (OOUX)** — Sophia Prater's framework. Components map to objects, not to screens. The canonical object map is at `docs/OOUX_OBJECT_MAP.md`. Before adding any new component, walk the 5-step build discipline in OOUX §8 (list objects on the surface → pick view sizes → identify CTAs → set attribute priorities → compose layout). If a proposed component doesn't map to an object, it's probably a missing object or a composition pattern, not a component.

**Locked decisions (Pavel 2026-05-27):**

After exploring Terra (warm cream + terracotta — too Claude-adjacent), Eucalyptus Stone (forest green + brass — premium but didn't pop enough for influencer audience), Cherry (too loud for partner gravitas), and Tangerine (Bizee-inspired but neutral), Pavel landed on the **pink + black + neon green** system.

**Brand palette:**
- Primary brand: `pink-500 #FF2E63` (hot pink — highlights, links, active filter chips, logo mark, focus rings, accent on light surfaces use pink-700 `#C71350`)
- Signature CTA: **black pill button with white text** (`ink-900 #18181A` fill + `#fff` text + full pill radius). Same shape on dark and light sections.
- Neon green: `neon-500 #B5FF3D` — accent + emphasis on DARK SURFACES ONLY (fails contrast on light). Used for: hero italic-serif emphasis word, stats numbers in dark sections, verify-check ✓ badges, partner-type "active count" chips, dark-section CTAs (where button flips to neon-green pill with black text — the Business inverse variant).
- Canvas: white `#FFFFFF` + warm cream `#FBFAF7` for alternating bands on light pages.
- Dark anchor: `ink-900 #18181A` (button fill, primary text on light, dark canvas).
- Neutrals: cool slate `ink-50 #F8F8F9` → `ink-900 #18181A` (10-step ramp).

**Typography (3 faces, intentional):**
- **Inter** — body, UI, data tables, captions, nav, buttons (all weights 400/500/600/700).
- **Bricolage Grotesque** — bold display headlines (700/800 weights only, very tight `-0.03em` to `-0.045em` letter-spacing).
- **Fraunces** *italic only* — emphasis spans inside display headlines (one word per headline, e.g., *"on autopilot"*, *"become"*). On dark = neon green color. On light = pink color.

**The dark/light section pattern (LOCKED):**

**Header is the audience-signal — DON'T MIX:**
- **Marketplace (creator surfaces)** → WHITE header. Pink underline on active niche subnav tab. `Start launching` is black pill with white text.
- **iLaunchify Business (partner landing)** → DARK header (`ink-900 #18181A`). Logo wordmark gets `iLaunchify` (white) + `Business` (neon green). `Apply now` is neon-green pill with black text.

That header difference is the single most important visual cue separating creator vs. partner surfaces. Never put a dark header on the creator marketplace — it confuses the audience-signal.

**Business landing rhythm:**
- DARK header
- DARK hero (with pink + neon radial glows)
- LIGHT stats band (cream, pink numbers)
- DARK feature island (partner types — preserves energy)
- LIGHT explainer band (why-join + how-it-works + testimonial — pink accents)
- DARK final CTA (closing punch, neon CTA)
- DARK footer

**Marketplace rhythm:**
- WHITE header + WHITE niche subnav (pink underline on active)
- WHITE/cool-slate canvas
- Dark hero banner can appear as a feature island inside the content area (with pink glow + black/white CTA)
- Product cards are light with colored gradient image areas
- Optional dark sections only as deliberate "feature islands"; never wholesale dark page

**The colors-by-surface rule:**
- **Dark surfaces** → neon green for accent / emphasis / numbers / CTAs (neon-on-black hits 16:1 AAA)
- **Light surfaces** → pink-500 / pink-700 for accent / emphasis / numbers / CTAs (neon fails on white at 1.3:1)
- Pink works on both surfaces (white-on-pink at 3.39:1 = large/UI only; pink-700 on white at 6.21:1 = AA body)
- Never mix neon-green text on light or pink emphasis on dark — context-switch the accent color, keep the brand DNA

**Density modes (carried from earlier — still valid):**
- Creator surfaces: comfortable (24px card padding, generous whitespace, Bricolage display moments)
- Partner surfaces: compact (16px padding, dense tables, fewer animations, dark-mode default for long sessions)

**Component primitives:**
- **Button** — variants: `primary` (black pill, white text), `neon` (neon-green pill, black text — for dark sections), `pink` (pink pill, white text — pink fill for accent), `secondary` (white pill, dark text, hairline border), `ghost` (transparent, dark text on light / white text on dark). Always full pill `999px`. Height scale 32 / 40 / 48.
- **Input** — pink focus ring `0 0 0 3px rgba(255,46,99,0.15)`.
- **Card** — white surface, hairline `ink-200` border, 14px radius (marketplace cards) or 12px (general).
- **Badge** — variants: success / warning / danger / info / neutral / pink / neon (pink for "New", neon for "Live" on dark).
- **Chip** — pill filter chip, active state `pink-500` fill + white text.
- **ProductCard** (marketplace) — gradient image bg (9 pastel options), status badge top-left, neon verify-check top-right, heart bottom-right, niche-caps label + bold title + cert tag chips + footer row (MIN UNITS / LEAD TIME / PRICE — NO CTA button, NO partner identity).
- **StatusPill** — Bestseller / New / Fast ship / Low MOQ / Top rated / Popular.

**Locked artifact files:**
- `design/mood-board-neon.html` — full system reference (current direction, not the older Terra/Tangerine boards)
- `design/marketplace-mockup.html` — locked as the marketplace look (5 cards/row, filters-only sidebar, dark hero banner, niche subnav tabs with pink underline)
- `design/business-landing.html` — locked as the partner landing template (dark header + hero + final CTA + footer; light stats + why + how + testimonial; dark partner-types island)

**Forward-pointer to real implementation:**
Pavel asked 2026-05-27 if this will become a real design system. YES — next phase is `packages/ui` build:
1. Tokens (`packages/ui/src/tokens/*.ts`) — typed color/type/spacing/radius/shadow/motion exports
2. Tailwind preset (`packages/ui/tailwind.preset.ts`) — shared config every app imports
3. CSS theme file (`packages/ui/src/theme.css`) — runtime CSS custom properties for surface theming via `data-surface="dark|light|cream"`
4. Self-host fonts via Fontsource (Inter, Bricolage, Fraunces)
5. Real React components in `packages/ui/src/components/*` built on shadcn/Radix foundation
6. New `apps/marketing` Next.js app for landing pages (creator + business surfaces)
7. Swap tokens in `apps/creator`, `apps/partner`, `apps/admin` to use new design system

**Anti-patterns (DON'T):**
- ❌ Don't use neon green as text on white (1.3:1 — invisible)
- ❌ Don't use pure black (`#000`) — use `ink-900 #18181A`
- ❌ Don't add outer colored glow shadows on buttons (Pavel hated this)
- ❌ Don't make landing pages all-dark — alternate per the locked rhythm
- ❌ Don't use Fraunces in body copy — italic emphasis only, max one span per headline
- ❌ Don't reintroduce partner identity on marketplace cards (orchestration thesis still holds — see [[ilaunchify-orchestration-thesis]])
- ❌ Don't add "Inquire" or any CTA button to product cards — show PRICE in the footer row instead

**Cross-refs:**
- [[ilaunchify-orchestration-thesis]] — why product cards hide partner identity
- [[ilaunchify-business-model]] — why there are two distinct landing audiences
- `docs/DESIGN_SYSTEM.md` — full spec (needs update to match this locked direction)
- `docs/MARKETPLACE_DESIGN.md` — marketplace layout architecture
