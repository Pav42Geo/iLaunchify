# Creator Onboarding — Spec

**Status:** V1 architecture locked 2026-05-24 with Pavel.
**Related:** [PARTNER_ONBOARDING.md](./PARTNER_ONBOARDING.md) (auth + role-separated signup architecture lives there) · [PLATFORM_SPEC.md](./PLATFORM_SPEC.md) · [MARKETS_AND_REGIONS.md](./MARKETS_AND_REGIONS.md) · [DESIGN_STUDIO.md](./DESIGN_STUDIO.md) · [MANUFACTURER_PRODUCT_BUILDER.md](./MANUFACTURER_PRODUCT_BUILDER.md)

## Why a separate doc

Partner onboarding is a 5-layer system-architecture exercise spanning weeks (Identity verification, structured capabilities, contract signing, FSM with 10 states). **Creator onboarding is a 5-step guided activation** with a fundamentally different goal:

> Get a new creator from signup to "I'm customizing my first product" in under 15 minutes of active time.

Creators don't need legal verification, capability profiles, or contracts. They need to set up brand context, payment, optionally connect a sales channel, define brand identity, and be guided into picking their first product. That's a stepper, not an architecture.

This pattern was already proven in FOD's `/dashboard/creator/onboarding` (a 5-step stepper, 616 lines, with progress indicator + URL routing per step + side checklist + skip-and-resume). The iLaunchify version adapts those 5 steps to our B2B production marketplace model.

## The 5 steps

| # | Slug | Title | What unlocks |
|---|---|---|---|
| 1 | `tell-us-about-you` | Tell us about you | Marketplace browse with right defaults (target market + region proximity) |
| 2 | `payment-setup` | Payment setup | Production order checkout |
| 3 | `connect-channel` | Connect your sales channel | Channel push button on product publish (#111 ChannelConnection scaffolding) |
| 4 | `brand-identity` | Build your brand identity | Design Studio template gallery filtered to brand style |
| 5 | `first-product` | Pick your first product | Lands creator in `/products/[id]/customize` with breadcrumbs back |

All 5 are individually skippable. Skipping doesn't break the dashboard — it just leaves a downstream feature gated with a clear "Complete onboarding step N to enable this" prompt at the point of use.

### Step 1 — Tell us about you

**Collected:**
- Creator name (pre-filled from auth)
- Brand name (required) — creates a `Brand` row
- 1-line pitch ("What are you building?") — stored as `Brand.elevatorPitch`, populates Design Studio context
- **Target markets** (multi-select, V1 = US auto-selected from `MARKETS_AND_REGIONS.md` — at least one required)
- **Operating region** (single-select, V1 = US states; pre-filled from inferred address if available)

**Schema writes:**
```
Brand row { id, name, elevatorPitch, operatingRegionId, creatorUserId, createdAt }
BrandTargetMarket rows { brandId, marketId, isPrimary } — one per selected market, first is primary
```

**Outcome:** Marketplace browse becomes meaningful (filters partners by market certification + proximity sorts by operating region — see `MARKETS_AND_REGIONS.md` matching algorithm).

### Step 2 — Payment setup

**Collected:**
- Stripe Checkout payment method (card or ACH) for production order funding
- Billing address
- Tax ID (optional V1; required for invoiced orders over $X in V1.1)

**Critical clarification vs FOD's creator billing:** FOD's "billing" step was about creator collecting from consumers. **In iLaunchify, creator's "billing" is about creator paying partners for production runs.** End-consumer billing happens on the creator's own channel (Shopify / Amazon / etc.) — iLaunchify never touches that money. Creator's payment method here funds production orders only.

**Schema writes:** existing Stripe Checkout integration (#54 / #55 already shipped).

**Outcome:** Unlocks the `/products/[id]/customize` "Order production" checkout button. Until done, the button shows "Set up payment to order →" linking back to this step.

### Step 3 — Connect your sales channel *(optional)*

**Collected:**
- Channel type: Shopify · WooCommerce · BigCommerce · "I'll sell on Amazon" · "Direct to consumer (manual)"
- OAuth connection for Shopify (V1.5 brings full OAuth; V1 = "Connect later" placeholder writing a stub `ChannelConnection` row)

**Important:** This step is genuinely optional. Many V1 creators are testing the platform and will fulfill manually first. Skip-for-now is a first-class option, no guilt-prompt.

**Schema writes:** `ChannelConnection` row (model from task #111). V1 only stores the choice + type; OAuth-handshake is V1.5+.

**Outcome:** Unlocks the channel push UX on product publish. Skipping means creator gets a manual "Download CSV / images" option instead.

### Step 4 — Build your brand identity (Quickstart)

This step captures the MINIMUM brand identity to make Design Studio useful. The full brand book builder lives in a dedicated [Brand Identity Studio](./BRAND_IDENTITY_STUDIO.md) destination that creators invest in over weeks. Step 4 takes 5–8 minutes; the Studio is open‑ended.

**A. Start from a Brand Style Preset (recommended) OR build from scratch**

Admin curates ~12–15 complete brand starter kits, each combining a typography pair + color palette + visual style + tagline pattern. Creator picks one → all fields auto‑populate → they tweak from there. See [BRAND_IDENTITY_STUDIO.md §3](./BRAND_IDENTITY_STUDIO.md) for the preset catalog. Picking a preset = 70% of fields filled in one click.

Examples of presets shown:
- "Modern Minimalist Wellness" — sans‑serif type pair, sage/cream/white palette, soft photography, voice=`wellness+minimalist`
- "Bold Scientific Performance" — bold sans + monospace accent, navy/electric‑blue/white, lab photography, voice=`scientific+bold`
- "Playful Artisanal Snack" — handwritten heading + sans body, warm earth tones, illustrated imagery, voice=`playful+organic`
- "Luxury Heritage" — refined serif + sans pair, deep green/gold/cream, premium photography, voice=`luxury+vintage`

[Skip presets, build from scratch →] is always available.

**B. Logo upload (required)**
SVG primary (recommended), PNG/JPG fallback. ≥ 256×256.

**C. Color palette**
- ◉ Pick a curated palette (recommended) — 10 curated palettes shown, each 3 coordinated colors. Picking guarantees colors work together.
- ○ Custom colors — HEX/RGB picker, 3 slots (primary + secondary + accent).

**D. Typography**
- ◉ Curated pair (recommended) — ~20 pre‑paired heading + body fonts from a curated library (e.g., "Inter Bold + Inter Regular," "Playfair Display + Source Sans," "Space Grotesk + IBM Plex Sans"). Picking guarantees the pair reads well together.
- ○ Custom font upload (.woff2) — V1.5+ only.

**E. Visual style** (multi‑select, max 2)

Matches `LabelDesignTemplate.styleTags` from `DESIGN_STUDIO.md` §3 — the shared vocabulary is what makes Design Studio template auto‑filtering work. Most brands aren't one archetype, they're a blend: minimalist+scientific, wellness+luxury, playful+organic. Max 2 keeps the filter meaningful while letting brand identity be honest.

| Tag | Looks/feels like |
|---|---|
| `minimalist` | Clean, lots of white space, simple geometry |
| `vintage` | Retro, distressed, classic serif type |
| `bold` | Strong colors, large type, high contrast |
| `organic` | Natural, earthy, hand‑drawn |
| `scientific` | Lab‑like, precise, technical |
| `luxury` | Elegant, premium, restrained palette |
| `playful` | Fun, bright, illustrative |
| `wellness` | Soft, calming, holistic |
| `athletic` | Performance, energetic, sport‑forward |
| `clinical` | Doctor‑recommended, evidence‑based |

10 options at V1 launch. Open Item: expand list based on creator feedback.

**F. Brand tagline** (optional)
Single line of copy, e.g., "Performance from real ingredients." Stored as `Brand.tagline`.

**G. Direction notes** (optional, free‑text)
For the designer / V2 AI Template Agent: notes about packaging direction, brand keywords, audience.

**Schema writes:**
```
Brand row updates {
  // From step 4:
  brandStylePresetId      String?              // FK to BrandStylePreset; null if built from scratch
  logoAssetId             String?              // FK to Asset (V1.1 ships full Asset model)
  colorPaletteId          String?              // FK to ColorPalette (curated picks); null if custom
  customColors            String[]             // populated if built from scratch
  typographyPairId        String?              // FK to TypographyPair (curated picks)
  brandVoiceTags          String[]             // multi-select max 2, matches LabelDesignTemplate.styleTags vocab
  tagline                 String?
  directionNotes          String?
}
```

**Outcome:** Brand Quickstart captured. Design Studio template gallery now auto‑filters using `LabelDesignTemplate.styleTags ∋ ANY(brand.brandVoiceTags)`. Brand assets (logo, palette colors, typography pair) pre‑fill in Label Designer per product. Direction notes feed the V2 AI Template Agent for per‑brand template generation (DESIGN_STUDIO.md §V2).

Creator can polish their identity further in the [Brand Identity Studio](./BRAND_IDENTITY_STUDIO.md) destination anytime after onboarding — Design Studio always reads the latest values.

### Step 5 — Pick your first product

**Surface:** Marketplace browse filtered to:
1. Partners certified for creator's target market (hard filter — from MARKETS_AND_REGIONS.md)
2. Partners with capability overlap for popular categories
3. Templates with `styleTags ∋ brand.brandVoice` (soft boost via DESIGN_STUDIO.md ranking)
4. Highest-rated / most-used products in creator's region (soft boost)

Creator picks one, clicks "Customize this product" → lands in `/products/[id]/customize` with breadcrumbs back to onboarding.

**Outcome:** Onboarding marked complete. Dashboard widget transitions from "Setup checklist" to "Your first product" status card.

## UX architecture

### URL routing

```
/creator/onboarding                    → checklist overview + resume current step
/creator/onboarding/tell-us-about-you  → step 1
/creator/onboarding/payment-setup      → step 2
/creator/onboarding/connect-channel    → step 3
/creator/onboarding/brand-identity     → step 4
/creator/onboarding/first-product      → step 5
```

Each step is URL-addressable, bookmarkable, deep-linkable. Refresh-safe.

### Progress + side panel

Left-side persistent panel shows:
- Progress bar with completion %
- Numbered checklist with current step highlighted + completed items checked
- Per-step time estimate ("3 min")
- "Skip for now" link at the bottom of each step
- "Save and continue" CTA at the bottom of each step (becomes "Complete setup" on the last)

Right-side step content fills the rest. Single-column form layout per step. No nested wizards.

### Dashboard widget post-signup

Once creator completes signup, the dashboard always shows a persistent (but dismissible-per-session) side widget:

```
┌────────────────────────────────────┐
│ Get your brand launched            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ●● 2 of 5 steps complete (40%)     │
│                                     │
│ ✓ Tell us about you                 │
│ ✓ Payment setup                     │
│ ○ Connect your sales channel        │
│ ○ Build your brand identity         │
│ ○ Pick your first product           │
│                                     │
│ [Continue setup →]                  │
│ Dismiss for today                   │
└────────────────────────────────────┘
```

Once all 5 are complete, the widget transitions to a "Welcome to iLaunchify" celebration card + reverts to a quick-access shortcut row.

### Skip vs gate behavior

| Step | Skippable? | What happens if skipped |
|---|---|---|
| 1 | No (technical floor) | Without target market + region, marketplace can't filter — would be unusable |
| 2 | Yes | Production order checkout button disabled with "Set up payment to order →" link |
| 3 | Yes | Channel push unavailable; CSV export shown instead |
| 4 | Yes | Design Studio shows unfiltered template gallery + manual brand asset entry per product |
| 5 | Yes | Onboarding marked complete anyway; creator lands on marketplace with default sort |

So Step 1 is the only hard requirement — everything else degrades gracefully.

## Schema additions

Most fields land on existing `Brand` model (already in V1 from earlier marketplace work). Net-new fields:

```prisma
model Brand {
  // ... existing (id, name, creatorUserId, etc.) ...

  // NEW for V1 onboarding stepper:
  elevatorPitch          String?              // step 1
  operatingRegionId      String?              // step 1; FK to Region
  logoAssetId            String?              // step 4; FK to Asset (V1.1) or PartnerFile (V1)
  brandColors            String[]             // step 4
  brandVoice             String?              // step 4; matches LabelDesignTemplate.styleTags vocab
  packagingDirectionNotes String?             // step 4
  onboardingCompletedAt  DateTime?            // null until all 5 done; widget hides on != null

  // Relations:
  operatingRegion        Region? @relation("BrandOperatingRegion", fields: [operatingRegionId], references: [id])
  targetMarkets          BrandTargetMarket[]  // populated by step 1
  // ... etc.
}

model CreatorOnboardingProgress {
  id                       String   @id @default(cuid())
  brandId                  String   @unique
  step1TellUsAboutYou      OnboardingStepStatus @default(NOT_STARTED)
  step2PaymentSetup        OnboardingStepStatus @default(NOT_STARTED)
  step3ConnectChannel      OnboardingStepStatus @default(NOT_STARTED)
  step4BrandIdentity       OnboardingStepStatus @default(NOT_STARTED)
  step5FirstProduct        OnboardingStepStatus @default(NOT_STARTED)
  lastActivityAt           DateTime?
  brand                    Brand @relation(fields: [brandId], references: [id])
}

enum OnboardingStepStatus { NOT_STARTED IN_PROGRESS COMPLETED SKIPPED }
```

The `SKIPPED` state matters — distinguishes "creator deliberately skipped" from "creator hasn't gotten there yet." Affects dashboard messaging ("Want to connect a channel? Step 3 is available anytime").

## Multi‑brand support (V1 architecture, no UX gymnastics)

A creator may run multiple brands (an agency creator managing 3 client brands; a serial entrepreneur with a wellness brand and a snack brand). The architecture supports this from V1 day one without forcing it into the onboarding flow.

**Schema:** `Brand` is its own model linked to `User` via `creatorUserId` (already shipped). One User → many Brand rows. No schema change required for multi‑brand.

**Onboarding behavior:** the 5‑step stepper builds **one brand at a time** — the first one. We never ask "how many brands are you planning?" during signup. Creators don't know yet, and even if they do, they should start with their most clarified concept.

**Dashboard behavior post‑onboarding:** the top navigation gets a **brand switcher** (familiar pattern from Shopify stores, Notion workspaces, Slack teams). All creator-side surfaces (products, orders, design studio, marketplace context, channel connections) are scoped to the currently‑selected brand. Switching brands changes the entire dashboard context.

**Adding a brand later:** `[+ Add another brand]` action in the brand switcher menu. Triggers the same 5‑step stepper, scoped to the new brand. Each brand has its own `CreatorOnboardingProgress` row, its own Brand Identity Studio, its own product list, its own channel connections, its own Stripe payment methods (linked to one shared Stripe customer underneath, but billed/tagged per brand).

**Visual hint of multi‑brand:**

```
┌─────────────────────────────────────────────────────────┐
│ ☰   ⌄ Verdant Wellness (Active brand)            ⓘ ⚙ 👤 │
│      ───────────────────────────────────────             │
│      ✓ Verdant Wellness                                  │
│        Aurora Snacks (50% setup)                         │
│        + Add another brand                               │
└─────────────────────────────────────────────────────────┘
```

**Why not anticipate at signup:** the "which one to start with" decision is one creators will agonize over if asked, and it's a false dichotomy — they don't have to pick a favorite, they just pick whatever's most ready to build. Anchoring on "build one, add more later" matches how every successful multi‑tenant SaaS handles this.

## Welcome flow at first signin

First time creator signs in after signup, before they see the dashboard:

```
1. One-time splash modal: "Welcome, {firstName}! Let's get your brand launched."
   CTA: [Start setup →] [Skip and explore]

2. "Start setup" → /creator/onboarding (step 1 ready to go)
   "Skip and explore" → /dashboard/creator with the persistent widget visible
```

Skip is allowed but creator returns to "Step 1 hasn't been started" widget on the dashboard. Step 1 is the soft-required step (marketplace doesn't work well without target market + region).

## V1 implementation breakdown

| Task | Scope | Estimate |
|---|---|---|
| Schema migration | Brand field additions + CreatorOnboardingProgress model | 0.5 day |
| `/creator/onboarding` shell | Checklist panel + URL routing per step + progress bar + side widget | 1 day |
| Step 1: Tell us about you | Form + Brand + BrandTargetMarket writes + region picker | 1 day |
| Step 2: Payment setup | Wraps existing Stripe Checkout flow (#55) into onboarding step | 0.5 day |
| Step 3: Connect channel | Channel type picker + stub ChannelConnection write (full OAuth V1.5) | 0.5 day |
| Step 4: Brand identity | Logo upload + color picker + voice select + notes field | 1 day |
| Step 5: First product | Wraps marketplace browse with filter pre-applied + "Customize" CTA | 0.5 day |
| Dashboard widget | Persistent dismissible card + completion celebration | 1 day |
| Welcome modal | First-signin one-time splash | 0.5 day |

Total: ~6.5 days of dedicated work.

## V1.1 / V1.5 / V2 enhancements

### V1.1
- Full Shopify OAuth in step 3 (replaces V1 stub)
- LinkedIn / Instagram OAuth for "Sales channel" expansion
- A/B test step ordering (does Brand Identity before Payment Setup improve completion?)
- Step skip-and-return nudges: gentle email at 24h, 72h, 7d after stalling per step

### V1.5
- AI brand voice analyzer — creator drops their logo + 3 sample social posts, system suggests brand voice + colors
- Multi-brand support — single creator account can manage 2+ brands (e.g., agency creators)
- Onboarding analytics for admin (where do creators drop off?)
- **Creator Team model with financial-authority gate** — mirrors `docs/PRINT_PRODUCTION_WORKFLOW.md` §2 partner team architecture. Influencer creators delegate design / print / compliance / channel work to teammates (managers, designers, brand ops) but financial authority (production orders, subscription changes, payouts) stays with the owner unless explicitly delegated per-teammate with optional spend caps. Schema mirrors partner side: `CreatorMembership` (org-wide owner flag) + `CreatorBrandMembership` (brand-scoped roles) + `CreatorMembershipPermissions` (granular financial-authority flags) + `CreatorInvite`. Full spec in [[ilaunchify-creator-team-model-v1.5]] memory note. **V1 watchouts to avoid corner-painting:** never hardcode `creatorProfile.userId === user.id` at action sites — wrap in a helper from day one. Store Stripe payment-method handles on CreatorProfile/Brand, not on User. ChannelConnection tokens belong to the Brand, not the User. These choices cost nothing in V1 but make the V1.5 migration cleanly additive instead of touch-every-file painful.

### V2
- Per-region onboarding variants (Canadian creators get bilingual brand voice options; CFIA market reminder)
- Brand-style → AI Template generation pipeline (DESIGN_STUDIO.md §V2 — creator's brand kit feeds the Generator's per-partner styling)

## Open items

1. **Step 4 brand voice vocab — is 8 options enough?** (minimalist, vintage, bold, organic, scientific, luxury, playful, wellness). Could add more (athletic, premium, casual, …). **Default: 8 for V1; expand based on creator feedback.**
2. **Step 1 — should target markets default-select all ACTIVE markets** or just one (US for V1)? **Default: US-only auto-select V1; multi-select shown but US pre-checked.**
3. **Dashboard widget dismissibility** — per-session, per-week, or permanent until complete? **Default: per-session (returns next time they log in).**
4. **Should creators see an estimated time-to-launch** somewhere? ("If you complete all 5 steps + customize first product + design label, typical first launch = 4-7 days.") **Default: include on the welcome modal as a motivational stat.**

## Changelog

- **2026-05-24** Spec written. Adapts Pavel's FOD `/dashboard/creator/onboarding` 5-step stepper (616-line CreatorOnboardingFlow.tsx) to iLaunchify's B2B production marketplace model. Key reframings: Step 2 "billing" = creator funding production orders (not collecting from consumers — that's the creator's external channel); Step 3 "connect channel" = ChannelConnection optional / graceful skip; Step 4 "brand identity" = bridge to Design Studio template filtering via `styleTags` vocabulary; Step 5 "first product" = ends with creator in `/products/[id]/customize` not at a confirmation. Persistent dashboard widget replaces FOD's dialog. PARTNER_ONBOARDING.md §1.2 reference to "creator onboarding lighter than partner" was undersized; this doc replaces it.
