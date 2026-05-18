# Storefront Architecture — Decisions

**Status:** Draft for Pavel approval. Once accepted, `apps/storefront` is built against this in Weeks 9–10 per `docs/ROADMAP.md`.

**The six decisions in this doc:**
1. One template themed by Brand, or multiple templates.
2. URL structure (path vs. subdomain vs. custom domain).
3. SSR vs. ISR vs. SSG caching strategy.
4. Theming model (how Brand fields drive the storefront).
5. Section / page customization (how much can the creator change).
6. Checkout integration with the payments architecture.

---

## Decision 1 — One template, themed by Brand (V1); pluggable templates (V1.5+)

### The choice

V1 ships **one storefront template**, fully themed by the creator's `Brand` row (colors, fonts, logo, hero image, copy). V1.5+ adds 3–5 template options the creator picks from.

### Why one in V1

The argument *for* multiple templates is creator self-expression. The argument *against* in V1 is:

- A creator's brand identity comes through copy + colors + fonts + photography, **not** layout. A great single template themed well beats five mediocre templates.
- Multiple templates multiplies the surface area we have to test against compliance edge cases (nutrition panel placement, claim disclaimers).
- Build cost: one template done well is 1 week. Three templates is 3 weeks plus ongoing maintenance × 3.
- V1.5+ template additions are pure content work — the underlying data and components don't change.

### Layout (V1)

The V1 template is a Tier-1-creator-optimized layout designed for mobile (where social-driven traffic lands):

```
┌──────────────────────────────────────┐
│ Brand logo                    Cart 🛒│  ← Sticky header
├──────────────────────────────────────┤
│                                      │
│      Hero image                      │
│      Brand tagline                   │  ← Hero (full-width image, 1-line tagline)
│      [Shop now] button               │
│                                      │
├──────────────────────────────────────┤
│ About this brand                     │
│ (short paragraph — 50–100 words)     │  ← About blurb
├──────────────────────────────────────┤
│ Products                             │
│ ┌────┐ ┌────┐                       │
│ │ P1 │ │ P2 │ ...                   │  ← Product grid (2 cols mobile, 3–4 cols desktop)
│ └────┘ └────┘                       │
├──────────────────────────────────────┤
│ As seen on @creator (social)         │  ← Optional social proof block (V1.5+)
├──────────────────────────────────────┤
│ Footer: contact, policies, etc.      │
└──────────────────────────────────────┘
```

Product detail page:

```
┌──────────────────────────────────────┐
│ Back  Brand logo            Cart 🛒  │
├──────────────────────────────────────┤
│ ┌────────────────┐                   │
│ │ Product image  │  Product name     │
│ │ (carousel)     │  $price           │
│ │                │  [Add to cart]    │
│ └────────────────┘                   │
├──────────────────────────────────────┤
│ Description                          │
│ (creator-written)                    │
├──────────────────────────────────────┤
│ Nutrition Facts panel                │  ← Pulled from compliance service
│ (or Supplement Facts)                │
├──────────────────────────────────────┤
│ Ingredients · Allergens · Claims     │
│ Shipping & returns                   │
└──────────────────────────────────────┘
```

### What V1.5+ adds

- Multiple template options ("Minimal", "Bold", "Editorial", "Cinematic")
- Per-section reordering (creator drags sections in admin)
- Section types: featured product, video block, testimonials, newsletter signup, FAQ, custom HTML

---

## Decision 2 — URL structure: **path-based on `app.ilaunchify.com/{handle}` in V1; custom domains in V1.5+**

### V1

**Revised 2026-05-18:** moved from `app.ilaunchify.com/{handle}` to a separate `shop.ilaunchify.com` subdomain to match the deployment architecture in `docs/DEPLOYMENT.md`. Storefronts run as a distinct Next.js app (different deploy cadence, different caching, different auth domain) — they deserve their own subdomain.

| URL | What it serves |
|---|---|
| `shop.ilaunchify.com/{handle}` | Brand home (storefront index) |
| `shop.ilaunchify.com/{handle}/{productSlug}` | Product detail |
| `shop.ilaunchify.com/{handle}/cart` | Cart |
| `shop.ilaunchify.com/{handle}/checkout` | Stripe Checkout redirect |
| `shop.ilaunchify.com/{handle}/orders/{orderId}` | Consumer order status |
| `shop.ilaunchify.com/{handle}/policies/{policySlug}` | Auto-generated policy pages (privacy, terms, shipping, returns) |

`{handle}` comes from `Brand.handle` (which falls back to `CreatorProfile.handle` if the creator has only one brand). Reserved handles (cannot be used by creators): `admin`, `api`, `cart`, `checkout`, `signup`, `login`, plus all subdomain names from `docs/DEPLOYMENT.md` — enforced at signup time.

### Why path-based (not subdomain) in V1

| Option | Pros | Cons |
|---|---|---|
| `app.ilaunchify.com/{handle}` ✅ | Single SSL cert, single Vercel project, simplest deploy, easiest auth sharing | Less "premium" URL |
| `{handle}.ilaunchify.com` | Premium URL, brand-feels-like-a-brand | Wildcard SSL needed (Vercel free tier supports it), more complex routing, cookie-domain headaches between subdomains |
| `{handle}.com` (custom) | Most premium | Each creator buys their own domain, sets up DNS, SSL via Vercel domain attachment |

V1.5+ adds subdomain and custom-domain support as features. The Next.js app uses middleware to detect the inbound host and rewrite to the path-based internal route, so the underlying code is identical regardless of how the request arrived.

### Custom domains (V1.5+)

When this lands:

1. Creator buys `acmefoods.com`.
2. In storefront admin: enter the domain, see DNS instructions (CNAME or A record).
3. Vercel auto-provisions SSL via Let's Encrypt after DNS propagates.
4. Next.js middleware maps inbound `acmefoods.com` → `/acmefoods` internal route. Renders the storefront with `Brand.handle = acmefoods`.

The infrastructure for this is Vercel-native (or `mkcert` + Cloudflare if we self-host). Code change in V1.5 is small.

---

## Decision 3 — Caching: **ISR for content pages, dynamic for cart/checkout/account**

### The choice

Use Next.js App Router with **Incremental Static Regeneration** for the public storefront, **dynamic SSR** for anything cart-related.

| Page | Strategy | Revalidate |
|---|---|---|
| `/{handle}` (brand home) | ISR | 60s |
| `/{handle}/{productSlug}` | ISR | 30s |
| `/{handle}/policies/*` | ISR | 1 hour |
| `/{handle}/cart` | Dynamic (no cache) | — |
| `/{handle}/checkout` | Dynamic | — |
| `/{handle}/orders/{orderId}` | Dynamic | — |

### Why ISR

- Storefront pages are read-heavy and rarely change minute-to-minute. ISR serves cached HTML and revalidates in the background after the window passes.
- Creators can trigger on-demand revalidation when they publish a change (via Next.js `revalidatePath()` from a server action in `apps/creator`).
- Vercel's CDN handles the heavy lifting; we get sub-100ms TTFB without a Redis cache layer for HTML.
- ISR plays nicely with social-media traffic patterns: huge spikes when a creator posts, then quiet — ISR caches absorb the spike at the edge.

### What ISR doesn't cover

- The `Cart` is per-user (cookie-keyed or auth-keyed). Always dynamic.
- Real-time inventory ("only 3 left!") is V1.5+; V1 trusts inventory levels in the DB without per-render fetches.
- Personalization (recommended products) is V2+.

### Cache invalidation hooks

When `apps/creator` saves a product change:

```ts
// In a server action after Product update succeeds
import { revalidatePath } from 'next/cache'

await revalidatePath(`/${brand.handle}`)
await revalidatePath(`/${brand.handle}/${product.slug}`)
```

This pushes the change to the storefront within a single CDN propagation cycle (~10s on Vercel).

---

## Decision 4 — Theming: **CSS variables driven by Brand row**

### The choice

The storefront app exposes a small CSS-variable contract. The root layout reads the current `Brand` row at request time and injects the variables into the HTML. All component styling references those variables.

```css
:root {
  --brand-color-primary: <Brand.colorPrimary>;
  --brand-color-secondary: <Brand.colorSecondary>;
  --brand-color-accent: <Brand.colorAccent>;
  --brand-color-text: <derived from primary>;
  --brand-color-background: <derived>;
  --brand-color-muted: <derived>;

  --brand-font-display: <Brand.fontDisplay>, serif;
  --brand-font-body: <Brand.fontBody>, sans-serif;

  --brand-radius: <Brand.borderRadius ?? 8px>;
  --brand-shadow: <Brand.shadowStyle ?? "soft">;
}
```

Tailwind classes use these variables via `theme.extend.colors.brand` aliases. shadcn/ui primitives reference Tailwind tokens, so the cascade works end-to-end.

### Why CSS variables (not a JS theme provider)

- Server-rendered with no FOUC (flash of unstyled content). The CSS is in `<head>` before any React renders.
- Works in static contexts (email templates, PDF exports of policies, etc.).
- No runtime cost — browser handles variable resolution natively.
- Easy to inspect / debug in DevTools.

### Constraints on what creators can theme

V1 constrains creators to **3 primary colors + 2 fonts (display + body) + 1 logo + 1 hero image + 1 tagline + 1 about paragraph.** Total customization fits on one settings page in `apps/creator`.

Fonts come from an approved curated list (~30 Google Fonts that ship well and have multi-weight support). Free-form font upload is V2+ — it opens font-licensing audit work we don't want at V1.

Colors are validated client-side (contrast ratios checked — display color must be ≥ 4.5:1 against background, etc.).

---

## Decision 5 — Section customization: **fixed layout in V1, block builder in V1.5+**

### V1

The layout from Decision 1 is fixed. The creator's settings page edits:

- Brand name, tagline, about paragraph
- Logo, hero image
- 3 colors, 2 fonts
- Footer links (auto-generated: privacy, terms, shipping, returns, contact)
- Optional social handles (rendered in footer; AI uses them later for posting)
- Optional newsletter capture toggle (V1: just collects email; no integration. V1.5+: pipes to Klaviyo/Mailchimp via OAuth.)

Product order on the home page: by `Product.displayOrder` (drag-and-drop in `apps/creator`). Products with `Product.featured = true` get a "Featured" badge.

### V1.5+

A block-based page builder:

- Section types: hero, products-grid, featured-product, image-text, video, testimonials, faq, newsletter, custom-html (V2+: probably gated by a "Pro" plan).
- Drag-and-drop reorder.
- Per-section visibility toggle.
- Mobile-specific overrides.

Schema-wise, V1.5+ adds:

```prisma
model StorefrontPage {
  id              String   @id @default(cuid())
  brandId         String   @unique  // V1.5: only 1 home page per brand
  // ... metadata
  sections        StorefrontSection[]
}

model StorefrontSection {
  id              String       @id @default(cuid())
  pageId          String
  type            SectionType
  position        Int
  isVisible       Boolean      @default(true)
  config          Json         // shape varies by type; validated by Zod per-type
}

enum SectionType {
  HERO
  ABOUT
  PRODUCT_GRID
  FEATURED_PRODUCT
  IMAGE_TEXT
  VIDEO
  TESTIMONIALS
  FAQ
  NEWSLETTER
  CUSTOM_HTML       // gated
}
```

V1 doesn't ship these tables — they appear in V1.5.

---

## Decision 6 — Checkout: **Stripe Checkout (hosted), creator-branded statement descriptor**

### The flow

This integrates with the payments architecture in `docs/PAYMENTS.md`:

```
1. Consumer browses /{handle} → /{handle}/{productSlug}
2. Clicks "Add to cart" → cart server action adds to session-cookie-keyed Cart in DB
3. Goes to /{handle}/cart → reviews
4. Clicks "Checkout"
5. apps/storefront server action calls our /api/checkout endpoint:
   - Validates cart against current product + price + inventory
   - Reserves inventory (soft-reservation, 15-min TTL)
   - Calls Stripe Checkout sessions.create with:
       - line_items from cart
       - statement_descriptor_suffix from Brand.name (max 22 chars)
       - metadata: { orderId, brandId, creatorId }
       - payment_method_options.card.statement_descriptor = brand name
       - success_url = /{handle}/orders/{orderId}?session_id={CHECKOUT_SESSION_ID}
       - cancel_url = /{handle}/cart
   - Redirects to Stripe Checkout (consumer leaves our domain)
6. Consumer completes on Stripe's domain
7. Stripe webhook fires payment_intent.succeeded → apps/api handler:
   - Marks Order PAID
   - Marks Charge SUCCEEDED
   - Releases inventory reservation (now real)
   - Triggers dispatch routing (ProductDispatch + LabelDispatch to ASSIGNED state)
8. Consumer is redirected to success_url → /{handle}/orders/{orderId}
   - Shows order confirmation, tracking placeholder
   - Email confirmation sent (transactional via Resend)
```

### Why Stripe Checkout (not Elements) for V1

(Repeating from `PAYMENTS.md` for completeness in this doc:)

- PCI scope: Checkout = SAQ-A (Stripe's domain); Elements = SAQ-A-EP (our domain serves the iframe). Checkout is the lower-burden option for V1.
- Conversion: Stripe's hosted checkout has top-quartile conversion rates with no work.
- Time-to-ship: a working Checkout integration is ~2 days; a polished Elements integration is ~2 weeks.

V1.5+ may migrate to Embedded Checkout (the in-page variant of Checkout) for tighter brand experience without the full Elements PCI burden.

### Cart schema

```prisma
model Cart {
  id                String        @id @default(cuid())
  // Either-or — anonymous consumers have a session-cookie cart; logged-in have user-bound
  sessionToken      String?       @unique
  consumerUserId    String?
  brandId           String        // each cart is scoped to one brand (no cross-brand cart)
  status            CartStatus    @default(ACTIVE)
  expiresAt         DateTime
  items             CartItem[]
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
}

enum CartStatus {
  ACTIVE
  CHECKING_OUT       // Stripe Checkout session open; cart locked
  CONVERTED          // became an Order
  ABANDONED          // TTL expired
}

model CartItem {
  id              String   @id @default(cuid())
  cartId          String
  productId       String
  quantity        Int
  priceAtAddCents Int        // snapshot price at moment of add — protects against mid-cart price changes
  cart            Cart       @relation(fields: [cartId], references: [id])
  product         Product    @relation(fields: [productId], references: [id])
}
```

Carts are scoped to a single brand — a consumer can't combine products from multiple creators into one order. This is intentional:
- Simplifies dispatch routing (one creator per order).
- Each creator can have different fulfillment / shipping / returns terms.
- The consumer's purchase relationship is with the creator brand, not the platform.

### Consumer accounts (V1: optional, V1.5: required for subscriptions)

V1 ships **guest checkout** as the default. The Stripe Checkout session captures email; we create a `ConsumerUser` row on first purchase without forcing account creation.

V1.5+ adds proper consumer login (magic link via Resend) to enable order history across visits, Subscribe & Save, etc.

```prisma
model ConsumerUser {
  id              String       @id @default(cuid())
  email           String       @unique
  // V1: no password; just a row created from Stripe Checkout's collected email
  // V1.5+: magic link login adds emailVerifiedAt, lastSeenAt, etc.
  orders          Order[]
}
```

---

## Architecture: how `apps/storefront` relates to the rest

`apps/storefront` is a separate Next.js app (already in the scaffold) — distinct from `apps/creator`. Reasons:

| Concern | `apps/creator` | `apps/storefront` |
|---|---|---|
| Audience | Logged-in creators | Anonymous consumers |
| Traffic shape | Steady, light | Burst-driven (social media moments) |
| Caching | Mostly dynamic (live data) | Heavy ISR (Vercel CDN) |
| SEO | None (auth-walled) | Critical (Open Graph, sitemap, JSON-LD) |
| Build size | Heavy (Fabric.js canvas, admin tools) | Light (read-mostly UI) |
| Deploy cadence | Internal teams | Customer-facing |

Sharing happens via the packages:

- `@ilaunchify/db` for Prisma queries
- `@ilaunchify/ui` for theme-aware components (`<ProductCard>`, `<NutritionFactsRenderer>`)
- `@ilaunchify/types` for shared TS types
- `@ilaunchify/storefront-kit` for storefront-specific components (`<Hero>`, `<ProductGrid>`, `<Footer>`)
- `@ilaunchify/orders` for order creation logic

`apps/storefront` only reads from the DB (and creates Cart/Order rows). All compliance, label rendering, and design editing happens elsewhere — the storefront just renders the already-approved final result.

---

## SEO + Open Graph

Each storefront page gets:

- Static `<title>` and `<meta description>` from Brand fields.
- Open Graph tags (`og:title`, `og:description`, `og:image` from Brand.hero or Product.image, `og:type=website|product`).
- Twitter card metadata.
- JSON-LD `Product` and `Brand` structured data on product pages.
- Auto-generated `sitemap.xml` per `{handle}` (Next.js `app/[handle]/sitemap.xml/route.ts`).
- Robots tag = `index, follow` for ACTIVE brands; `noindex` for DRAFT/PAUSED.

This matters because creators will drive consumers to the storefront via short links — but search engines + previewing those links on social media (Discord, Slack, iMessage) demand correct OG tags.

---

## Open questions

1. **Subdomain support (`{handle}.ilaunchify.com`) — V1 or V1.5?** Recommendation: V1.5. Single SSL cert + simpler middleware for V1 is the right trade-off.

2. **Custom domains — V1.5 or V2?** Recommendation: V1.5 (Vercel makes it easy and Tier 2/3 creators will ask early).

3. **Guest checkout default vs. forced account creation?** Recommendation: guest checkout (V1). Account creation friction kills conversion for first-time consumers. V1.5+ adds magic-link login as an *optional* faster-second-checkout flow.

4. **Cart persistence — session cookie or logged-in only?** Recommendation: session cookie with 7-day TTL (V1). Logged-in carts (V1.5+) just attach the cookie cart to the User on login.

5. **Email transactional provider?** Recommendation: **Resend**. Free tier covers V1 volume; clean API. (Auth.js v5 already uses it for magic links if we go the email-auth route.)

6. **Multi-product orders across brands — does the consumer ever want this?** Recommendation: **No, V1 is single-brand-per-cart.** Combining creator brands in one order creates messy dispatch routing and unclear customer-service ownership. The consumer can complete two checkouts if they want products from two creators.

7. **Inventory model — fixed stock per product, or unlimited?** Recommendation: **fixed stock per Product, with manufacturer-defined `inventoryAvailable`.** Manufacturer reports their available capacity; product can sell up to that limit. V1.5+: more sophisticated allocation across products competing for the same manufacturer capacity.

8. **What does "out of stock" UX look like?** Recommendation: button disabled with "Notify me" → email capture. Don't hide the product. V1.5+ enables the email capture to actually email when stock returns.
