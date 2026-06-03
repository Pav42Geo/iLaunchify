---
name: ilaunchify-brand-identity
description: "Brand Identity is split into Onboarding Step 4 (Quickstart minimum for Design Studio) + dedicated Brand Identity Studio destination (7 tabs, deep brand book). Multi-brand-per-creator from V1."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

In iLaunchify, brand identity is captured in TWO surfaces (intentional split):

**1. Onboarding Step 4 — Brand Quickstart** (5-8 min)
Captures the MINIMUM identity for Design Studio to be useful. Brand Style Preset picker (~12 admin-curated complete starter kits — picking auto-fills 70% of fields) OR build-from-scratch. Logo upload required. Curated ColorPalette OR custom HEX. Curated TypographyPair (no custom font upload V1; V1.5+). Visual style multi-select MAX 2 from 10-tag controlled vocab (minimalist|vintage|bold|organic|scientific|luxury|playful|wellness|athletic|clinical) — matches LabelDesignTemplate.styleTags vocab EXACTLY for auto-filtering. Tagline + direction notes optional.

**2. Brand Identity Studio** (open-ended, weeks of polish)
Dedicated destination at /creator/brand/[brandId]/identity. 7 tabs: Logo Suite (primary + 6 variants), Typography (heading/body/accent + type scale ratio), Color System (11 semantic roles + WCAG contrast checker), Imagery (photography/illustration style + pattern + hero uploads), Voice & Tone (4 writing tone words + brand keywords + persona paragraph), Taglines & Copy (primary + secondary + banned words), Usage Guidelines (auto-generated + override). Computed brand health score (0-100%). Brand book PDF export V1.5+.

**Multi-brand from V1 (architectural, not anticipated):**
One creator → many Brand rows (schema already supports). Onboarding builds ONE brand. Dashboard has brand switcher in top nav. "Add another brand" re-runs the 5-step stepper scoped to new Brand row. Each brand has its own Brand Identity Studio. NEVER ask "how many brands?" at signup.

**Critical load-bearing detail: brand voice multi-select max 2 (not single-select).**
Real brands are blends: minimalist+scientific (Element Brewing), wellness+luxury (Goop), playful+organic (Olipop). Single-select forces wrong choice. Max 2 keeps Design Studio template filter meaningful while letting brand identity be honest. The styleTags vocabulary is the SHARED CONTRACT between Brand.brandVoiceTags and LabelDesignTemplate.styleTags — if they drift, auto-filtering breaks.

**How Design Studio consumes Brand Identity (every field drives behavior):**
- brandVoiceTags → auto-filter LabelDesignTemplate gallery
- logo + variants → auto-insert in brand zone, variant chosen by available space
- colorSystem → pre-fill picks, WCAG hard-fail on primary text combos
- typographyPair + ratio → pre-fill type system
- tagline → pre-fill brand-tagline zone
- bannedWords → lint label copy + product descriptions
- personaDescription + brandKeywords → V2+ AI Template Generator system prompt
- patternAssetIds → available as background fills

**Why:** Pavel pushed back 2026-05-24 that the original Step 4 (logo + 2-3 colors + 8-voice picker + notes) was undersized to actually help creators in Design Studio. Real brand identity needs typography systems, color systems with neutrals, imagery style, voice, taglines, usage guidelines — proper brand book content. Couldn't cram into 5-step stepper without ballooning Step 4 to 30+ minutes. Solution: split into Quickstart (5-8 min minimum-viable) + Studio (open-ended deep).

**How to apply:** When designing anything that touches brand identity, route the data through Brand model + the 7-tab Studio. NEVER add fields to Onboarding Step 4 beyond Quickstart minimum. NEVER let brandVoiceTags drift from LabelDesignTemplate.styleTags vocab (10 strings). NEVER hard-require Studio completion (brand health score is motivational, not gating — even a 30% brand can ship products). Brand Style Presets are the "give me a smart default 80% there" pattern that mirrors product-builder starter templates and design-studio template gallery.

Related: [[ilaunchify-creator-onboarding]] (Step 4 captures the Quickstart subset), [[ilaunchify-business-model]], [[ilaunchify-partner-onboarding]] (different ceremony entirely — no equivalent identity ceremony for partners).

Canonical specs: `docs/BRAND_IDENTITY_STUDIO.md` + `docs/CREATOR_ONBOARDING.md` §Step 4.
