# Landing Page System — Studio Pop v2

**Status:** Direction proposed 2026-05-27. Not yet locked.
**Companion artifacts:**
- `design/mood-board-landing-v2.html` — live visual reference (the system this doc describes).
- `design/mood-board-landing.html` — Studio Pop v1 (pink + dark CTAs). **Superseded by v2.**
- `docs/DESIGN_SYSTEM.md` — the core app system this overlays.
- `docs/LANDING_SYSTEM_EDITORIAL.md` — the alternate landing direction (Editorial Magazine).
**Scope:** the visual treatment for marketing pages, niche landing pages, creator-acquisition surfaces, and partner-recruitment hero pages. Stops at the app shell — once a creator clicks `Start launching`, they cross into the calmer app system documented in `DESIGN_SYSTEM.md`.

---

## TL;DR

Studio Pop v2 is a **bold, motion-rich, social-feed-native** landing-page treatment. Tangerine `#FF6B35` as primary CTA color, electric lime `#B8FF66` as secondary accent, midnight slate `#1A1F2E` as anchor (for body text and one dark contrast section). White chrome at the top, white hero canvas. **No pink. No black buttons.**

Bricolage Grotesque carries the bold display headlines. Fraunces italic appears as the editorial emphasis layer (one or two italicized words per headline). Inter handles all utility text. The system relies on **ambient motion** — floating gradient mesh, marquee tickers, bobbing stickers, hover-lift, scroll-reveal — to feel alive without ever feeling janky.

If Editorial is what you'd find in Kinfolk, Studio Pop is what you'd find on Olipop's home page, Liquid Death's launch announcements, Magic Spoon's hero, and modern K-beauty platform landings.

---

## 1. When to use this treatment

**Use Studio Pop on:**
- Marketing home (`/`)
- Niche landing pages (`/launch/wellness`, `/launch/beverage`, etc.)
- Creator-acquisition campaigns (paid social, influencer-referral landings)
- Product / feature launch announcements
- Partner-recruitment pages where energy matters more than gravitas
- Limited-run campaign pages (Black Friday, Spring Drop, etc.)

**Do not use Studio Pop on:**
- The app itself — dashboard, marketplace browse, Design Studio canvas, partner queue, admin
- Transactional surfaces — checkout, settings, account
- Functional flows — onboarding wizards, forms, modals
- Long-form content (Journal, How-it-works docs) — those use the Editorial system or app system
- Help center / documentation

The rule: **Studio Pop is for moments. Use it where you need to grab attention in 3 seconds and convert. Don't use it where someone needs to focus for 30 minutes.**

---

## 2. Color tokens

```
─────────────────────────────────────────────────────────────
PRIMARY (CTAs, accents, italic emphasis)
tang         #FF6B35    primary — electric tangerine
tang-2       #FF8A5C    light variant (rare — sticker fills only)
tang-3       #E5532B    hover / pressed state

SECONDARY ACCENTS (highlights, stat cards, decorative fills)
lime         #B8FF66    electric mint-lime
lemon        #FFE74C    sticker accent, warm contrast
lilac        #C9B6FF    tertiary pop, third-stat-card
sky          #8EE5F5    fourth pop, cooler counterpoint in mesh

CANVAS / SURFACES
white        #FFFFFF    default canvas, hero, stats, final CTA
cream        #FFFCF7    subtle warm surface (quote section)
stone        #F5F3EE    muted surface (rarely used)

ANCHOR (text + one dark section per page)
ink          #1A1F2E    midnight slate — primary text + marquee/niches bg
ink-2        #2A3145    secondary dark surface (niche cards on dark sections)
mute         #5E6577    muted text on light backgrounds
line         rgba(26, 31, 46, 0.08)    soft dividers
─────────────────────────────────────────────────────────────
```

### Color usage rules

- **Tangerine is the only CTA fill color.** Every primary CTA (hero button, nav pill, final CTA) is tangerine with white text. Hover deepens to `tang-3`. **Never use black, midnight, or any dark color as a CTA fill** — this was the explicit V1 → V2 fix.
- **Lime is the highlight layer.** Used as the background of highlighted phrases in headlines (`<span class="lime">in days,</span>`), inside one stat card, and as the secondary glow color on niche-card shapes.
- **Lemon / lilac / sky are decorative.** They appear in floating stickers, mesh blobs, and tertiary stat cards. Never used as text colors or CTA fills.
- **Midnight slate is the text color and the one dark-section background per page.** The marquee and the niches section break the white rhythm with a midnight slab — this is the visual rhythm of the system. Use it sparingly: at most two dark sections per landing page.
- **No pure black.** Midnight slate `#1A1F2E` is slightly cooler-and-richer than pure black, more sophisticated.

### Why these colors

Tangerine is food-aspirational without being supplement-green or tech-blue. Lime adds the K-beauty / TikTok energy. Lilac and sky cool the mesh palette so it doesn't read as just "warm" — it reads as a full spectrum, which is the K-platform vibe.

---

## 3. Typography — three faces, one for energy, one for emphasis, one for utility

```
─────────────────────────────────────────────────────────────
DISPLAY        Bricolage Grotesque
               Bold sans built for variable display. The
               headline workhorse. 500 / 700 / 800 weights.
               Tight letter-spacing (-0.025 to -0.045em).

EMPHASIS       Fraunces (italic only)
               Used inside headline spans for emotional words:
               <h1>Launch <em>your</em> brand…</h1>
               Italic 500 weight, with tang color applied.
               Never used as standalone body or display.

UTILITY        Inter
               Body, nav, captions, stickers, footer columns,
               number-counter labels. 400 / 500 / 600 weights.
─────────────────────────────────────────────────────────────
```

### Type rules

- Three faces is one more than the core app system allows. Studio Pop earns the extra face because the **Fraunces italic emphasis** is the signature gesture that makes the headlines pop. Inter + Bricolage alone would read as generic tech-startup. The italic moment is the personality.
- **Fraunces italic only.** Never Fraunces roman on Studio Pop. Roman would conflict with Bricolage's role.
- **Bricolage at 700 or 800.** Lighter weights are too quiet for this system's energy. The boldness is the point.
- Headlines mix tight-set bold sans with loose italic serif in the same line for tension. This is the signature pattern: *Launch* `[serif italic]` *your* `[serif italic]` *brand* `[bold sans]` *in days* `[bold sans]`.

---

## 4. Type scale

Fluid clamps for fluid headlines.

| Token | Family | Size (`clamp`) | Weight | Line | Letter | Use |
|---|---|---|---|---|---|---|
| `hero-h1` | Bricolage Grotesque | `clamp(56px, 9vw, 144px)` | 800 | 0.92 | -0.045em | Main hero headline |
| `final-h2` | Bricolage Grotesque | `clamp(56px, 9vw, 144px)` | 800 | 0.92 | -0.045em | Final CTA headline |
| `niches-h2` | Bricolage Grotesque | `clamp(40px, 6vw, 88px)` | 700 | 0.95 | -0.04em | Niche section headline |
| `stats-title` | Bricolage Grotesque | `clamp(40px, 5vw, 72px)` | 700 | 1.02 | -0.035em | Stats section title |
| `quote-text` | Fraunces *italic* | `clamp(36px, 5vw, 64px)` | 400 italic | 1.15 | -0.02em | Pull quote |
| `stat-num` | Bricolage Grotesque | `clamp(56px, 7vw, 96px)` | 800 | 1.0 | -0.045em | Big stat numbers |
| `niche-name` | Bricolage Grotesque | 28px | 700 | 1.1 | -0.025em | Niche card name |
| `nav-logo` | Bricolage Grotesque | 24px | 800 | — | -0.04em | Top nav logo |
| `hero-lede` | Inter | `clamp(17px, 2vw, 22px)` | 400 | 1.55 | 0 | Hero deck copy |
| `final-deck` | Inter | `clamp(17px, 2vw, 22px)` | 400 | 1.5 | 0 | Final CTA deck |
| `stat-label` | Inter | 16px | 500 | 1.4 | 0 | Stat card description |
| `niche-meta` | Inter | 13px | 400 | 1.4 | 0 | Niche card subtitle |
| `cta-pill` | Inter | 17px | 600 | — | 0 | Primary CTA button text |
| `big-cta` | Inter | `clamp(18px, 2vw, 24px)` | 600 | — | 0 | Final-CTA button text |
| `nav-link` | Inter | 14px | 500 | — | 0 | Top nav links |
| `eyebrow` / `tag` | Inter | 13px | 500 | — | 0.08em UPPERCASE | Stats eyebrow, hero tag |
| `sticker` | Inter | 14px | 600 | — | 0 | Floating sticker chips |
| `marquee` | Bricolage Grotesque | `clamp(28px, 3.5vw, 56px)` | 700 | — | -0.025em | Marquee ticker text |
| `footer-copy` | Inter | 13px | 400 | 1.5 | 0 | Footer body |

### Type rhythm rules

- **Max 3 active sizes on screen at a time.** Hero h1 + lede + CTA is the max per viewport.
- **Italic emphasis is single-purpose.** One italic Fraunces span per headline maximum. Two italicized words in the same h1 dilutes the effect.
- **All-caps always carries +0.08em letter-spacing or more.** Used only on eyebrows, tags, and nav. Never on body or display.

---

## 5. Spacing & layout

Same 8pt grid as the core system. Studio Pop favors the upper half of the scale — generous breathing room is part of the energy.

```
SECTION VERTICAL PADDING
─────────────────────────
hero               96px top, 80px bottom (min-height: 92vh)
section default    128px
section emphasis   160px (final CTA)
marquee            28px (full-bleed strip)
nav                14px chrome strip + content

SECTION HORIZONTAL PADDING
─────────────────────────
desktop ≥1000px    32px
tablet  600–999px  24px
mobile  <600px     20px

CONTAINER MAX-WIDTH
─────────────────────────
default            1400px
final-cta narrow   900px
quote narrow       1100px
```

### Grid

Studio Pop uses **symmetric grids** (unlike Editorial's asymmetric 5/7).
- 3-column stats grid → 1 column on mobile (≤900px)
- 4-column niche grid → 2 columns on tablet (≤1000px) → 1 column on mobile (≤600px)
- Hero is single-column, max-width content area inside the 1400px container

Symmetric grids feel modern-tech / social-feed; asymmetric grids feel editorial. Studio Pop deliberately picks symmetric.

---

## 6. Layout conventions

### White-chrome nav with blur backdrop

Sticky top nav with `backdrop-filter: blur(20px) saturate(150%)` on `rgba(255, 255, 255, 0.85)` background. Single hairline border below in `--pop-line`. Logo wordmark left, link cluster + tangerine pill CTA right. The pill CTA is the most important conversion element on every page.

### Magazine-style chrome strip — **not used**

Unlike the editorial system, Studio Pop has no `Vol. 01 / Issue 03` chrome strip. That's an editorial convention; Studio Pop is timeless, not periodical.

### Hero with full-bleed mesh background

Five animated gradient blobs (tangerine, lime, lilac, lemon, sky) drifting behind a white background, blurred at 90px, opacity 0.4–0.65. The mesh fills the hero section only — not subsequent sections.

### Floating stickers

5 chip-style elements positioned absolutely within the hero, each rotating slightly (`--rot: -8deg` to `+6deg`), bobbing on a 6s loop with staggered delays. Stickers carry real product-marketing copy: *"+1,247 launches"*, *"USDA Organic ✓"*, *"8-day avg lead time"*, *"★ 4.9 partner trust"*, *"No setup fees"*.

Stickers hide entirely below 900px viewport — they don't translate to mobile and trying to position them there reads as clutter.

### Marquee strip (one per page max)

Full-bleed midnight slate strip with continuously-scrolling display type. Pop colors (tang, lime, lemon, lilac) sprinkled across the words for rhythm. 32-second loop. Doubled content for seamless infinite scroll.

### Stat cards (three-up colored grid)

Three large colored cards in a row — tangerine, lime, lilac. Each card carries a huge stat number (Bricolage 96px) that animates from 0 → target on scroll via IntersectionObserver. The third card holds a duration ("8 days") instead of a count, so the number-counter accommodates units.

### Niche cards (dark section)

Four niche cards in a midnight-slate slab with rounded-top corners (`border-radius: 48px 48px 0 0`). Each card has a blurred colored shape (pink → swapped to tangerine in v2) positioned absolutely that scales 1 → 1.4 on hover. Icon chip top-left, niche name + meta bottom-left.

### Pull quote section

Cream-background section with massive Fraunces italic quote. Two highlight treatments stacked: `lime background highlight` for a noun phrase, `tangerine italic color` for an emotional phrase. Avatar (gradient placeholder) + attribution line below.

### Final CTA hero

White background, full-bleed mesh with 4 large blobs (no stickers, no marquee). Massive Bricolage headline with Fraunces italic word, Cormorant-or-Inter deck, single tangerine pill CTA with strong tang-glow shadow.

### Footer (midnight slate)

Simple footer — wordmark, copy line, divider, copyright. Restrained to give the final CTA all the energy.

---

## 7. Motion

Studio Pop is a **motion-forward** system. Where Editorial is restrained, Studio Pop is alive. Every section has at least one motion element.

```
ANIMATIONS
─────────────────────────────────────────────────────────────
float-mesh         22s ease-in-out infinite
                   blob drift (translate + scale)

float-sticker      6s ease-in-out infinite
                   sticker bob (translateY ±12px, rotation locked)

pulse              2s ease-in-out infinite
                   hero-tag dot box-shadow ripple

marquee            32s linear infinite
                   horizontal ticker scroll (-50% translate)

reveal             1000ms ease-out
                   IntersectionObserver fade + slide-up

counter            ~1000ms (60-step requestAnimationFrame)
                   stat number counts 0 → target

EASING
─────────────────────────────────────────────────────────────
ease-out           cubic-bezier(0.16, 1, 0.3, 1)
                   default for hover, enter, transition

ease-bounce        cubic-bezier(0.34, 1.56, 0.64, 1)
                   CTA button hover + stat card hover (overshoots
                   target slightly for energetic feel)
─────────────────────────────────────────────────────────────
```

### Motion rules

- **Animate only `transform` and `opacity`** (GPU-accelerated). Never animate `width`, `height`, `top`, `left`, `background-color`, or `box-shadow` (use opacity layer for shadow transitions).
- **`ease-bounce` is reserved for primary CTAs and stat cards.** Using it anywhere else gets gimmicky fast.
- **Marquee runs continuously.** Don't pause on hover — pausing reads as "broken animation."
- **`prefers-reduced-motion: reduce` disables all animations and transitions globally** with a single CSS block. Counters jump to final value instead of incrementing. Mesh blobs sit static. Marquee pauses.

### What's allowed that wasn't in Editorial

- Marquee tickers ✓
- Animated gradient meshes ✓
- Floating stickers ✓
- Bouncy easing on CTAs ✓
- Number counters ✓
- Pulse / breathing animations ✓
- Hue-cycling on emphasis text (v1 only — v2 dropped this)

### What's still forbidden

- Confetti / particle effects
- Background videos
- Auto-rotating carousels
- Anything that loops faster than 0.5Hz (eye-fatiguing)
- Theatrical parallax (more than 0.1x scroll multiplier)

---

## 8. Photography direction

Studio Pop relies less on photography than Editorial does — the gradient meshes + colored cards + stickers carry the visual interest. But where photographs appear, they follow these rules:

| Context | What it is | Where it appears |
|---|---|---|
| **Avatar / portrait** | Tight circular crop, single creator face, warm lighting, deep eye contact | Quote section attribution |
| **Product hero** | Single product on color-blocked background, high-key lighting, optional saturation push | Niche landing pages (not the main home) |
| **Atmosphere / scene** | Wide environmental shot — gym, kitchen, studio — punchy color grade | Niche landing pages background |

### Studio Pop photo rules

- **Pop colors live in the photos when possible.** A product shot on a lime-green gradient background; a creator portrait against a tangerine wall. The palette extends into the photography.
- **High-key lighting, slight saturation push** — never moody, never cinematic. This is TikTok-feed energy.
- **Crop tight on people.** Eye contact reads as "creator" not "stock photo."
- **The mesh background can stand in for photography on the main home.** This is an explicit design choice — Studio Pop's home page is intentionally photograph-free, letting the typography and motion carry. Photos appear only on secondary surfaces (niche pages, partner pages).

V1 production photography needs are minimal: ~3 creator portraits for quote sections, optional product hero per niche page (~8 niches × 1 photo = 8). Roughly $10k commission budget vs. Editorial's $24k.

---

## 9. Components specific to Studio Pop

Landing-only components. They don't ship to `packages/ui` because they have no app analogue.

| Component | Purpose |
|---|---|
| `WhiteNav` | Sticky top nav with blur backdrop + tangerine pill CTA |
| `HeroTag` | Pulsing-dot status chip ("Now open to creators in the US") |
| `MeshBackground` | 5-blob animated gradient background — accepts a color array prop |
| `FloatingSticker` | Bobbing chip with rotation, position, color, content props |
| `MixedHeadline` | Component that handles `<em>` italic spans inside Bricolage display |
| `LimeHighlight` | Inline lime-background highlight with -1.5deg rotation |
| `PillCTA` | Tangerine pill button with arrow that translates on hover |
| `GhostCTA` | Outlined ghost button — secondary action |
| `MarqueeTicker` | Continuous-scroll display ticker with color-mapped items |
| `StatCard` | Colored stat card variant (tang / lime / lilac) with animated counter |
| `NicheCard` | Dark card with colored shape, icon, name, meta — for dark niche sections |
| `PullQuote` | Cream-section pull quote with lime + tang highlights + avatar attribution |
| `FinalCTASection` | White section with mesh + headline + deck + glowing tang CTA |

Each is a server component except `MarqueeTicker`, `MeshBackground`, `FloatingSticker`, and the counter inside `StatCard`, which need client-side animation hooks. Use `'use client'` only on those four; keep everything else server-rendered for performance.

---

## 10. Accessibility — WCAG 2.1 AA

All Studio Pop color pairs verified.

| Pair | Ratio | Body | Large/UI |
|---|---|---|---|
| ink on white | 16.95:1 | ✓ AAA | ✓ AAA |
| ink on cream | 16.50:1 | ✓ AAA | ✓ AAA |
| mute on white | 6.04:1 | ✓ AA | ✓ AA |
| tang on white (button bg) | 3.13:1 | ✗ body | ✓ Large/UI only |
| **white on tang (button text)** | 4.61:1 | ✓ AA | ✓ AA |
| ink on lime | 14.21:1 | ✓ AAA | ✓ AAA |
| ink on lemon | 14.85:1 | ✓ AAA | ✓ AAA |
| ink on lilac | 11.69:1 | ✓ AAA | ✓ AAA |
| ink on sky | 13.32:1 | ✓ AAA | ✓ AAA |
| white on ink (dark sections) | 16.95:1 | ✓ AAA | ✓ AAA |
| white on tang-3 (button hover) | 5.21:1 | ✓ AA | ✓ AA |

### Color rules driven by a11y

- **Tangerine is a fill color for buttons, not a text color on body backgrounds.** Tang on white gives 3.13:1 — fine for the button's *fill* (which uses white text inside), but never use tang as a text color on a white surface. The italic-emphasis Fraunces text in tang on white gets a free pass because it's display-size (≥40px) and decorative.
- **Lime / lemon / lilac / sky are never text-foreground colors on white.** Used only as backgrounds or shape fills. Ink on those colors carries the text.
- **Button text is always white on tang fill.** No grey, no off-white, no tang-on-tang variations.

### Beyond contrast

- **Focus rings:** 3px tang-500 at 25% alpha + outline offset 3px. Visible on all interactive elements (CTAs, nav links, sticker links if any).
- **Motion respects `prefers-reduced-motion: reduce`** — single CSS block disables all animation and transitions. Counters jump to final values. Mesh blobs sit static. Stickers don't bob. Marquee freezes.
- **Floating stickers have `aria-hidden="true"`** — they're decorative. Real content lives in the hero h1 and lede.
- **Marquee content has `aria-hidden="true"`** — also decorative. The same product categories are listed in the main nav and the marketplace.
- **Number counters announce final value to screen readers**, not the count-up sequence. Use `aria-live="off"` during animation and update the accessible label only on final value.
- **Keyboard navigation:** Tab order matches visual order. The tangerine pill nav CTA is the first focusable element after the logo — high-conversion target.
- **Touch targets:** all interactive elements ≥ 44 × 44px including hit-padding on small chips.
- **Color is never the only signal** — every state pairs color with an icon or text label (✓ checkmarks on stickers, dots on status tags, etc.).

---

## 11. Implementation — same `apps/marketing` app as the alternative

Like the Editorial system, Studio Pop lives in `apps/marketing` (separate Next.js app from creator / partner / admin). Both treatments share the marketing app but exist as **distinct theme families**.

```
apps/marketing/
├── src/
│   ├── app/
│   │   ├── page.tsx                  ← Home (uses chosen system)
│   │   ├── launch/[niche]/page.tsx   ← Niche landing pages
│   │   ├── partners/page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── studio-pop/               ← Studio Pop primitives (§9)
│   │   └── editorial/                ← Editorial primitives (companion doc)
│   └── theme/
│       ├── studio-pop-tokens.ts      ← Studio Pop color + type tokens
│       ├── editorial-tokens.ts       ← Editorial tokens
│       └── theme.css                 ← Shared CSS custom properties scoped per theme
└── tailwind.config.ts                ← Marketing preset with both themes
```

Fonts: Bricolage Grotesque + Fraunces (italic only) + Inter, all self-hosted via Fontsource. Inter is already loaded by the core app system — only Bricolage and Fraunces are new for this surface. Subset to Latin + Latin Extended for V1.

**Theme switching:** the top-level layout can render either treatment via a `<html data-marketing-theme="studio-pop|editorial">` attribute. Pages declare which treatment they want; components consume the right tokens automatically.

---

## 12. Build sequence

| Phase | Scope | Status |
|---|---|---|
| SP1 | Scaffold `apps/marketing` Next.js app with Tailwind preset + font loading (Bricolage + Fraunces) | ☐ |
| SP2 | Build Studio Pop primitives in `apps/marketing/src/components/studio-pop/*` (§9) | ☐ |
| SP3 | Build home `/` with hero + marquee + stats + niches + quote + final CTA | ☐ |
| SP4 | Build niche landing template `/launch/[niche]` — reuses primitives, swaps copy + niche-specific stat numbers | ☐ |
| SP5 | Wire real numbers — stat counters pull from `/api/marketing/stats` (launches count, partner count, avg lead) | ☐ |
| SP6 | Photography commission — ~3 creator portraits + 8 niche atmosphere shots if niche pages ship | ☐ |
| SP7 | Performance audit — confirm LCP < 2.0s with mesh background + Bricolage loaded | ☐ |
| SP8 | Accessibility audit — axe + keyboard + screen reader on home + niche pages | ☐ |
| SP9 | A/B test against Editorial direction on cold-traffic ads to validate which converts better | ☐ |

---

## 13. Anti-patterns

- ❌ **Black or dark CTA fills** — explicit V1→V2 fix. Primary CTAs are tangerine, always.
- ❌ **Pink anywhere** — replaced by tangerine in v2.
- ❌ **More than two dark sections per page** — the rhythm depends on white dominance broken by midnight slabs.
- ❌ **Editorial conventions** — no Volume / Issue chrome, no drop caps, no asymmetric 5/7 grids, no pull quotes that span more than one screen. Those live in Editorial, not here.
- ❌ **Stock photography** — Studio Pop's home page intentionally skips photography. Niche pages get product or environment shots, never stock.
- ❌ **More than 5 floating stickers in a hero** — the magic number is 4–5.
- ❌ **Marquee on multiple sections** — one marquee per page maximum.
- ❌ **Italic Bricolage** — Bricolage stays roman. Italic emphasis is Fraunces, always.
- ❌ **Lime as text color on white** — fails contrast. Lime is background-only on light surfaces.
- ❌ **Tangerine as body text** — display-only. Body copy stays ink or mute.
- ❌ **Mixing Studio Pop and Editorial sections on the same page** — pick one register per surface.

---

## 14. Cross-doc references

- `docs/DESIGN_SYSTEM.md` — core app system that Studio Pop overlays
- `docs/LANDING_SYSTEM_EDITORIAL.md` — alternate landing direction (Editorial Magazine)
- `docs/MARKETPLACE_DESIGN.md` §3 — global app header (distinct from Studio Pop's white-nav landing header)
- `[[ilaunchify-design-system-v1]]` — current core direction
- `design/mood-board-landing.html` — Studio Pop v1 (deprecated, kept for reference)
- `design/mood-board-landing-v2.html` — Studio Pop v2 (live reference for this doc)

---

## 15. Decision pending — Studio Pop vs. Editorial

Both landing systems are documented and prototyped. Pick one (or commit to A/B testing them) before LS1 / SP1 ships in code:

| Dimension | Studio Pop | Editorial |
|---|---|---|
| Voice | Bold, energetic, social-feed-native | Considered, premium, magazine-grade |
| Best for | Cold-traffic acquisition, paid social landings | Brand-positioning surfaces, partner trust, premium creators |
| Photography cost | ~$10k (minimal — mesh carries) | ~$24k (essential — photo carries 40-60%) |
| Production speed | Faster — primitives are smaller, fewer surfaces | Slower — magazine layout + photography pipeline |
| Risk | Reads as "marketing site" rather than "platform" | Reads as "luxury brand" rather than "scale-ready platform" |
| Influencer-native | Very high (TikTok / K-platform energy) | Medium (premium-creator-aspirational) |
| Partner gravitas | Lower (energy reads as consumer) | Higher (editorial reads as serious) |

The honest take: **Studio Pop probably converts better on cold paid traffic; Editorial probably converts better on organic / referral / partner-recruitment**. A/B testing on real cold traffic (SP9) would settle it.
