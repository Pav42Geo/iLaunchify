---
name: ilaunchify-cowork-owns-marketplace-search
description: Cowork owns the marketplace instant-search surface — Code stays off these files.
metadata:
  type: project
---

Cowork built the marketplace **instant / federated typeahead search** (2026-07-07) and owns these files as **single-writer**. Code must not edit, move, or refactor them without a hand-off:

- `apps/marketing/src/components/MarketplaceSearchBar.tsx` — header field + inline dropdown (light theme host).
- `apps/marketing/src/components/MarketplaceCommandPalette.tsx` — dark full-screen ⌘/Ctrl-K palette (BUILT; mounted in MarketplaceHeader).
- `apps/marketing/src/components/MarketplaceSearchResults.tsx` — theme-aware results body (For-you rows, Popular/Recently-viewed/Browse-categories carousels via `ScrollRow`, chips, zero-state, guest sign-in nudge).
- `apps/marketing/src/components/useMarketplaceSearch.ts` — shared hook: debounced fetch, personal corpus match + behavioral re-rank, recent searches/products (localStorage), intent scope, nav model.
- `apps/marketing/src/lib/marketplace-search.ts` — pure client+server-safe helpers (Levenshtein/typo, synonym `expandQuery`, category/niche matchers, `browseCategories`/`browseNiches`, `categoryName`/`nicheName`, `didYouMean`, `highlightSegments`, `TRENDING_QUERIES`, all types). No `server-only`, no Prisma.
- `apps/marketing/src/lib/personal-search.ts` — `server-only`; resilient `getPersonalProducts(userId)` from favorites + orders (defensive `prisma.favorite`, self-contained mappers).
- `apps/marketing/src/app/api/marketplace/search/route.ts` — federated typeahead (products/categories/niches/suggestions/didYouMean; empty-q returns Popular, scoped by `?category=`/`?niche=`).
- `apps/marketing/src/app/api/marketplace/personal/route.ts` — creator's For-you corpus + `authenticated` flag (guest → `{items:[],authenticated:false}`).

Feature set (all BUILT + verified live): typo tolerance, synonym expansion, highlighting, Popular/Trending carousels (edge fades + scroll arrows), Recently viewed, personalized For-you (Reorder + Saved) with behavioral re-rank, intent-driven "Trending in {last search}", guest categories carousel + sign-in nudge — in both the inline dropdown and the ⌘K palette.

**Shared deps Code shouldn't reshape without pinging Cowork:** `getMarketplaceTemplates()` / `getTrendingTemplates()` / `templateToCardProps` in `lib/templates.ts`; the `SampleTemplate` shape in `lib/sample-templates.ts` (search reads `gradient`, `icon`, `imageUrl`, `manufacturerBadge`, `tags`, `subcategorySlug`); taxonomy libs `lib/niches.ts` + `lib/category-tree.ts`.

## Cross-app contract (added 2026-07-07) — the API routes have a SECOND consumer

The creator top-bar search (`apps/creator/src/components/nav/MarketplaceSearchLauncher.tsx`) now calls **`/api/marketplace/search` and `/api/marketplace/personal`** same-origin via a **Next rewrite in `apps/creator/next.config.js`** (`/api/marketplace/:path*` → `NEXT_PUBLIC_MARKETING_URL`), which forwards the shared session cookie so `/personal` returns the creator's own data.

⚠️ These two routes' **paths and JSON response shapes are now a cross-app contract**. Renaming a path or reshaping a response (`products[]`, `personal.items[]`, the `SearchProduct`/`PersonalProduct` fields, `authenticated`) **breaks the creator search at RUNTIME with nothing at compile time to catch it** (the creator side re-declares minimal local types). Coordinate before changing them. Creator owns the rewrite + launcher; Cowork owns the routes. `next.config.js` changes force a full creator dev-server restart.

Full component parity in the creator header (carousels/⌘K, shared components) is deferred — needs extracting the components + niche/category taxonomy into a shared package + build config. The current creator dropdown is a lean UI over the shared API.

See [[ilaunchify-two-agent-hot-file-collisions]] for the general single-writer + commit-immediately protocol.
