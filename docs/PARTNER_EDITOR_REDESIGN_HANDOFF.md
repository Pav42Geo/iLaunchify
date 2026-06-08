# Partner New Product editor — redesign handoff (single-writer)

**Status:** redesign IS in the working tree (uncommitted) as of 2026-06-05 · Code owns this file going forward
**File:** `apps/partner/src/app/(dashboard)/products/[id]/edit/EditorShell.tsx` (+ siblings `LabelPreview.tsx`, `SubmitReadiness.tsx`)
**Why this doc exists:** EditorShell.tsx got edited by two authors in parallel and a working-tree reset wiped the redesign once already. To stop the thrash, **Code is the sole writer of EditorShell.tsx from here.** This doc captures the redesign intent so Code can (a) commit the current working-tree version as-is, and (b) maintain it.

## Action for Code

1. The three-column redesign is already in the working tree and typechecks clean (filtered `next/link`/ui noise only). **Commit it as-is** — do not regenerate from scratch. Use literal pathspecs because the path contains `[id]`:
   ```bash
   GIT_LITERAL_PATHSPECS=1 git add "apps/partner/src/app/(dashboard)/products/[id]/edit/"
   git commit -m "feat(partner): three-column New Product editor"
   ```
   `LabelPreview.tsx` and `SubmitReadiness.tsx` are untracked — include them or the build breaks.
2. Own EditorShell.tsx going forward. Cowork will hand future editor changes as specs, not direct edits.

## The design (reference)

Matches the approved mockup `partner_new_product_editor_polished.html`. Locked design system: Bricolage display, `#FF2E63` pink, `#F3EFE8` cream hero, black-pill CTAs, Inter.

Layout = top bar + cream hero + a **three-column grid** `lg:grid-cols-[180px,1fr,330px]`:

- **Top bar** (white, rounded-2xl): `iLaunchify Partner` mark · breadcrumb `Products / {name}` · live save chip (Saving…/Saved/failed) · Archive · black-pill Submit (disabled until required gates met).
- **Cream hero** (`bg-[#F3EFE8]`): eyebrow `Manufacturing · Product editor` · display `{template.name}` · `{subcategory} · {category}` · 🅰 re-approval pill + status pill.
- **Left col — section navigator** (sticky): a progress card (`navPct`% with a `#FF2E63` bar, "N of M complete") + a `Sections` list. Each section's state is `done | warn | todo | opt`, derived from the same data as the readiness rail (e.g. ingredients = warn until ≥1 slot). Clicking a row calls `jumpToCard(key)` → opens + smooth-scrolls to `#section-{key}`.
- **Middle col** — the existing EditorCard stack, unchanged (Basics, Niches, Ingredients, Allergens, Label phrases, Packaging, Variants, Certificates, Media, Custom meta, Weight, Notes).
- **Right rail** (sticky, 330px): (1) `LabelPreview` Nutrition/Supplement Facts panel; (2) **Compliance scan** card — structural checks live, FDA-pipeline checks render `pending` until #131; (3) pink **Ready to submit?** panel (`bg-[#FBEAF0]` / `border-[#F4C0D1]` / `text-[#BE185D]`) listing unresolved readiness items (click to jump) + black-pill Submit.

## Invariants to preserve

- Server is the source of truth: the three `required` readiness checks mirror `submitProductForReview`'s gates (≥1 ingredient slot, ≥1 packaging, ≥1 variant). Submit stays disabled (`canSubmit`) while any required item is missing; server still re-validates.
- Honesty rule (operational-trust memo): never fabricate nutrient numbers or compliance verdicts client-side — `LabelPreview` shows em-dashes and the compliance scan shows `pending` until the #131 recipe→compliance→label pipeline lands. Real data (serving info, ingredient statement, allergens, section presence) is live now.
- `section-{cardKey}` ids live on the EditorCard wrapper (always in the DOM), not the open-only body — the jump links depend on it.
