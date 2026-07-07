---
name: ilaunchify-cowork-owns-marketplace-search
description: Cowork owns the marketplace instant-search surface — Code stays off these files.
metadata:
  type: project
---

Cowork built the marketplace **instant / federated typeahead search** (2026-07-07) and owns these files as **single-writer**. Code must not edit, move, or refactor them without a hand-off:

- `apps/marketing/src/components/MarketplaceSearchBar.tsx` — the header field (kept expand-on-focus) + live dropdown.
- `apps/marketing/src/lib/marketplace-search.ts` — pure, client+server-safe helpers (Levenshtein typo tolerance, category/niche matchers, `didYouMean`, `highlightSegments`, `TRENDING_QUERIES`). No `server-only`, no Prisma.
- `apps/marketing/src/app/api/marketplace/search/route.ts` — federated typeahead endpoint (products/categories/niches/suggestions/didYouMean).

**How it works:** debounced (~140ms) `fetch('/api/marketplace/search?q=')`. The route reuses `getMarketplaceTemplates({ q, take: 6 })` so typeahead products share the exact PUBLISHED scope + merit ranking as the `/marketplace` grid — search is NOT a second source of truth. Every selection routes into the existing URL-driven filters (`?q=`, `?niche=`, `/marketplace/[category]`). No schema change.

**Shared dependencies Code shouldn't reshape without pinging Cowork:** `getMarketplaceTemplates()` / `templateToCardProps` in `lib/templates.ts` + the `SampleTemplate` shape in `lib/sample-templates.ts` (search reads `gradient`, `icon`, `imageUrl`, `manufacturerBadge`, `tags`, `subcategorySlug`), and the taxonomy libs `lib/niches.ts` + `lib/category-tree.ts`.

**Deliberately deferred:** the dark full-screen ⌘K command-palette from the prototype — ⌘/Ctrl-K currently just focuses the inline bar. Building the separate overlay is the sanctioned fast-follow (Cowork's zone).

See [[ilaunchify-two-agent-hot-file-collisions]] for the general single-writer + commit-immediately protocol.
