---
name: ilaunchify-creator-onboarding
description: "Creator onboarding is a 5-step guided stepper after first signin, NOT a lightweight signup form. Goal = signup to \"customizing first product\" in <15 min. Fundamentally different from partner onboarding."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

In iLaunchify, creator onboarding is a **5-step guided stepper** that runs immediately after first signin — patterned after Pavel's FOD `/dashboard/creator/onboarding` (616-line CreatorOnboardingFlow). Goal: signup → "customizing first product" in <15 min of active time.

**The 5 steps:**

1. **Tell us about you** — creator name, brand name, 1-line pitch, target markets (US auto-V1), operating region. Creates Brand + BrandTargetMarket rows. Unlocks marketplace browse with right defaults.
2. **Payment setup** — Stripe Checkout for creator FUNDING production orders (NOT for collecting from end-consumers — that's external channel). Unlocks production order checkout button.
3. **Connect your sales channel** (genuinely optional) — Shopify / WooCommerce / BigCommerce / Amazon / Direct manual. Writes ChannelConnection stub (#111). V1.5+ full Shopify OAuth.
4. **Build your brand identity** — logo upload + 2-3 color picker + brand voice single-select from 8-option controlled vocab (minimalist/vintage/bold/organic/scientific/luxury/playful/wellness — matches LabelDesignTemplate.styleTags) + packaging direction notes. Bridge to Design Studio (template gallery auto-filters by styleTags ∋ brand.brandVoice).
5. **Pick your first product** — marketplace browse pre-filtered + "Customize this product" CTA → /products/[id]/customize with breadcrumbs back. Ends in action, not confirmation.

**UX architecture:**
- URL-routed steps (/creator/onboarding/[step]) — bookmarkable, resumable
- Persistent dismissible-per-session dashboard widget tracking completion %
- Welcome modal at first signin: "Welcome {name}! Let's get your brand launched." [Start setup] [Skip and explore]
- Only Step 1 is hard-required (target market + region needed for marketplace to work)
- Steps 2-5 are skippable with graceful degradation: payment-not-set → order button disabled, channel-not-set → CSV export shown, brand-not-set → unfiltered Design Studio

**Why:** Pavel pushed back 2026-05-24 that creator onboarding should be more substantial than the "brand name + logo + target markets" I initially proposed in PARTNER_ONBOARDING.md. He showed his FOD 5-step stepper as the right model. I audited it and adapted to iLaunchify (Step 2 = creator-pays-partner not creator-collects-from-consumer; Step 5 ends in customizer not dashboard).

**Architectural difference from partner onboarding:** partner onboarding is system architecture (5-layer model + 10-state FSM + contract signing). Creator onboarding is guided activation (5-step stepper, no contract, no admin verification). Same parent concept "onboarding" but completely different ceremonies. Keep them in separate specs (PARTNER_ONBOARDING.md and CREATOR_ONBOARDING.md).

**How to apply:** When designing anything that touches first-time creator UX, route them through the 5-step stepper. Don't add to the stepper — anything beyond the 5 belongs in the dashboard or in product-specific flows. Step 4 brand voice controlled vocab MUST match LabelDesignTemplate.styleTags vocab exactly — that's the load-bearing bridge between brand identity and design filtering. Step 5 ends in /products/[id]/customize, not on a confirmation page.

Related: [[ilaunchify-partner-onboarding]] (the parent onboarding doc; references this one for the creator path), [[ilaunchify-business-model]], [[ilaunchify-markets-and-regions]] (target markets in Step 1).

Canonical spec: `docs/CREATOR_ONBOARDING.md`.
