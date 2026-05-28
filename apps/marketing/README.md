# @ilaunchify/marketing

The marketing-facing Next.js app: marketplace + business landing + (eventually) the marketing home and niche landing pages. Built on the locked design system in `@ilaunchify/ui`.

## Run it

```bash
# from repo root
pnpm install
pnpm --filter @ilaunchify/marketing dev
# → http://localhost:3010
```

## Routes

| Route | Purpose | Surface |
|---|---|---|
| `/` | Marketing home (V1: redirects to /marketplace) | light |
| `/marketplace` | Creator marketplace — category rows of `ProductCard`s | light |
| `/marketplace/[category]` | Single-category grid (e.g., `/marketplace/coffee-tea`) | light |
| `/marketplace/[category]/[subcategory]/[slug]` | Product detail page | light |
| `/business` | iLaunchify Business partner landing | dark |

## Architecture

### Surface theming via attribute

The whole design system flips colors via a `data-surface` attribute set on a wrapper:

```tsx
<div data-surface="dark">       {/* ink-900 canvas, neon emphasis, white text */}
<div data-surface="light">      {/* default — white canvas, pink emphasis, ink text */}
<div data-surface="cream">      {/* cream canvas, pink emphasis, ink text */}
```

The marketing root layout sets `data-surface="light"` on `<html>`. The `/business` route adds its own `<div data-surface="dark">` wrapper that overrides. Individual sections inside the business page set `data-surface="light"` or `"cream"` on themselves to break the dark monotony — see `/business/page.tsx` for the locked rhythm.

### Composing pages from objects (OOUX)

Each page is a composition of object views — see `docs/OOUX_OBJECT_MAP.md`.

The marketplace home composes:
- `ProductTemplate` objects at card size (`<ProductCard>`)
- `Certification` objects at chip size (`<CertChip>` inside ProductCard tag row)
- `Order` and `Brand` objects don't appear (creator-app-only)

The product detail page composes:
- `ProductTemplate` at detail size
- `Certification` at full-badge size (`<CertStrip>`)
- Related `ProductTemplate`s at card size again

When adding a new page, list the objects you'll show first, pick the view size for each, then compose.

### Color rules to remember

Two rules survive every refactor — they're enforced by component design but not by TypeScript, so know them:

1. **Neon green only on dark surfaces.** Contrast on white is 1.3:1 — invisible. The `<Button variant="neon">` JSDoc reminds you, but accidentally placing it on a light surface will compile and just look broken.
2. **Pink-500 fails AA as body text on white** (3.39:1). For pink text on light, use `pink-700`. Pink-500 is a *fill* color, not a text color (except on buttons where white-on-pink hits 3.39:1 — large/UI only).

### When adding a route

1. Pick the surface: light marketplace surface or dark business surface
2. If dark, wrap the route's content in `<div data-surface="dark">` (or set on `<html>` if the whole route is dark)
3. Compose from `@ilaunchify/ui` components; if you reach for raw Tailwind utilities, that's a smell — there's probably a component you should add

### Replacing sample data

`src/lib/sample-templates.ts` exports hardcoded `ProductTemplate` arrays for the V1 demo. Replace with Prisma queries when wiring to the DB:

```ts
// future: apps/marketing/src/lib/templates.ts
import { prisma } from '@ilaunchify/db'
export async function listMarketplaceTemplates() {
  return prisma.productTemplate.findMany({
    where: { marketplaceStatus: 'PUBLISHED' },
    include: { category: true, niches: true, certifications: true },
  })
}
```

The `ProductCard` component takes plain props — pass whatever shape your query returns through a small adapter, don't bend the component to your DB rows.

## Docs

- `docs/DESIGN_SYSTEM.md` — full spec for the design system this app renders
- `docs/OOUX_OBJECT_MAP.md` — the object inventory + content priorities
- `docs/MARKETPLACE_DESIGN.md` — locked marketplace layout decisions
- `design/marketplace-mockup.html` — the visual reference this page targets
- `design/business-landing.html` — the visual reference for `/business`
