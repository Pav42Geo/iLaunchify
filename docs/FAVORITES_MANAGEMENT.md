# Favorites Management — spec (DRAFT 2026-07-07)

Owner: Pavel · Status: proposal, pending review · Supersedes: the two hardcoded
`<Heart>` buttons in `TopbarRight.tsx` and `MarketplaceHeader.tsx`.

A **private** save-for-later system for creators. Creators can favorite
marketplace **product templates** (to customize later) and their **own products**
(for quick access + reorder). Favorites are personal and never public — this is
the deliberate contrast with Etsy, which exposes a public favorites library.
Partners and admins get no favorites surface at all.

---

## 1. What the research says (2025–26)

The current best-practice consensus across e‑commerce UX writing lands on a few
points that shape this spec:

- **Call it "Favorites," not "Wishlist."** Testing repeatedly finds "Wishlist"
  reads as gift-registry / "share this with someone," which carries a slightly
  greedy, social connotation. "Favorites" / "My list" get more use and imply a
  private, personal utility. Our existing `aria-label="Favorites"` is already
  right — we keep it.
- **The heart wins.** The filled/unfilled heart is the most-adopted save icon
  (marginal winner over the star). Users expect a toggle with immediate visual
  feedback — outline → filled, ideally a small pop/scale animation, plus a toast.
- **Put the affordance everywhere the product appears** — product cards in
  listings, the product detail page, and a header entry point to the saved list.
  Consistent placement (top-right of the card image) is what users scan for.
- **Never gate saving behind friction.** For public shops the guidance is "let
  guests save." Our marketplace browsing lives in the marketing app and much of
  it is public, so a guest tapping the heart should get a clean "sign in to save"
  path — not a dead button and not a forced signup wall mid-scroll.
- **Saved ≠ cart.** NN/g's framing: the cart is "I intend to buy now," the saved
  list is "I'm interested, remind me." Keep them distinct. For iLaunchify the
  saved list is upstream of the customize→checkout funnel, not a replacement for
  it.
- **The high-value phase-2 features** are price-drop / restock notifications on
  saved items, private collections (named groupings), and bulk actions
  (customize all / add all to cart). These are what turn a passive list into a
  re-engagement engine.

Two reference models, and how we borrow from each:

- **Amazon "Buy Again" / reorder** — the pattern we want for a creator's **own
  products**: one-tap return to a thing you've already made, to reorder stock.
  We borrow the reorder utility, not Amazon's list-sprawl.
- **Etsy Favorites + Collections** — the pattern we want for **marketplace
  templates**: heart-to-save plus optional named collections. We borrow the
  collections idea but **strip the public/social layer entirely** — no public
  favorites page, no shareable collection URLs, no "who favorited this" counts
  exposed to creators.

Sources: [NN/g — Wishlist or cart?](https://www.nngroup.com/articles/wishlist-or-cart/) ·
[The Story — Designing wishlists](https://thestory.is/en/journal/designing-wishlists-in-e-commerce/) ·
[The UX Chap — Hearts don't lie](https://medium.com/the-ux-chap/hearts-dont-lie-the-importance-of-favouriting-in-e-commerce-82d14d1c196f) ·
[Wix — Wishlists & save for later](https://www.wix.com/blog/what-are-wishlists-and-save-for-later) ·
[Mobiscroll — UI for favorites](https://blog.mobiscroll.com/ui-for-favorites/)

---

## 2. Scope decisions (locked with Pavel 2026-07-07)

- **Private only.** No public favorites library, no share links, no social
  counts surfaced to creators. (Admin analytics may aggregate anonymously later,
  but that is not a creator-facing feature.)
- **Favoritable types: `PRODUCT_TEMPLATE` and `PRODUCT`.** Marketplace templates
  (browse → customize later) and the creator's own products (quick access +
  reorder). Brands/partners are explicitly **out** for now.
- **Creators only.** The heart lives on the creator top header (and on
  marketplace/detail/own-product cards). Partner and admin apps never render it.
- **Naming: "Favorites."** Keeps the existing label; avoids "Wishlist."

---

## 3. Current state (what exists today)

Two hardcoded, non-functional hearts:

1. `apps/creator/src/components/nav/TopbarRight.tsx` (~L75) — `<AppHeaderIconButton
   aria-label="Favorites"><Heart/></AppHeaderIconButton>`, no `onClick`, no route.
2. `apps/marketing/src/components/MarketplaceHeader.tsx` (~L120) — same button,
   rendered only for **authenticated** users (guests get the sign-in CTA).

There is **no** `Favorite` model, no server action, no `/favorites` page, and no
heart on product cards. Partner (`apps/partner`) and admin (`apps/admin`) headers
render no heart — so "creators only" requires **adding** nothing to remove there;
it's already correct. The work is to make the two existing hearts real and gate
them to creators.

---

## 4. Data model

New model. Two nullable FKs + a discriminator (not a stringly-typed polymorphic
id) so we keep real referential integrity and cascade deletes — when a template
or product is deleted, its favorites vanish. Owned by `CreatorProfile` → private
by construction (no partner/admin can own a favorite).

```prisma
enum FavoritableType {
  PRODUCT_TEMPLATE   // a marketplace ProductTemplate (customize later)
  PRODUCT            // the creator's own Product (quick access + reorder)
}

model Favorite {
  id           String          @id @default(uuid())   // uuid per CLAUDE.md, not cuid
  creatorId    String                                 // owner = CreatorProfile.id
  kind         FavoritableType

  // Exactly ONE of these is set, matching `kind`. Enforced in the server
  // action + a DB check; both are nullable to keep the migration additive.
  productTemplateId String?
  productId         String?

  // Phase-1 grouping (private, named). Null = "All favorites" (default bucket).
  collectionId String?

  note         String?         // optional private creator note ("for Q4 launch")
  createdAt    DateTime        @default(now())

  creator         CreatorProfile     @relation(fields: [creatorId], references: [id], onDelete: Cascade)
  productTemplate ProductTemplate?   @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  product         Product?           @relation(fields: [productId], references: [id], onDelete: Cascade)
  collection      FavoriteCollection? @relation(fields: [collectionId], references: [id], onDelete: SetNull)

  // One favorite per (creator, target). Two partial-unique indexes because the
  // target lives in one of two columns.
  @@unique([creatorId, productTemplateId])
  @@unique([creatorId, productId])
  @@index([creatorId, kind])
  @@index([creatorId, collectionId])
}

// Phase 1 — private named lists (Etsy-collections idea, minus the public layer).
model FavoriteCollection {
  id        String     @id @default(uuid())
  creatorId String
  name      String
  createdAt DateTime   @default(now())
  creator   CreatorProfile @relation(fields: [creatorId], references: [id], onDelete: Cascade)
  favorites Favorite[]
  @@unique([creatorId, name])
  @@index([creatorId])
}
```

Add the back-relations (`favorites Favorite[]`) to `CreatorProfile`,
`ProductTemplate`, and `Product`, plus `collections FavoriteCollection[]` to
`CreatorProfile`.

**Convention checks** (from CLAUDE.md):
- `id` is `uuid()` for the new models (the older `Product`/`ProductTemplate` use
  `cuid()`; we don't retrofit them, but new rows follow the documented rule).
- No `@db.Text` — `note` and `name` are bare `String` (CockroachDB-unbounded).
- Additive migration only; nullable FKs; no `DROP`. Apply with `pnpm db:push`
  (this repo uses `db push`, **not** `migrate`), then `pnpm db:generate`, then
  `rm -rf apps/*/.next` and restart `next dev` (stale-client gotcha, all 3 layers).

**Why not a `Product.featured`-style boolean on the target?** Favorites are
per-creator and one target is favorited by many creators, so it must be a join
row keyed on `creatorId`, never a flag on the product.

---

## 5. Server actions (`apps/creator`, `packages/…`)

All mutations go through server actions that (a) resolve the current creator via
the centralized ownership guard in `packages/auth` (never ad-hoc checks — tenant
isolation is threat #1), and (b) write an `AuditLog` row via `logAuditAs`.

- `toggleFavorite({ kind, targetId })` → creates or deletes the row; returns the
  new state. Idempotent; the unique index backs "one favorite per target."
- `listFavorites({ kind?, collectionId?, sort? })` → the `/favorites` page loader.
- `setFavoriteNote({ favoriteId, note })`.
- **P1:** `createCollection`, `renameCollection`, `deleteCollection`,
  `moveToCollection({ favoriteIds[], collectionId })`.
- **P1 bulk:** `bulkRemove`, and CTA hooks `addToCart(favoriteIds[])` /
  `customize(favoriteId)` that hand off to the existing checkout + Studio flows.

Audit: new `entityType: 'Favorite'` with actions `FAVORITE_ADDED`,
`FAVORITE_REMOVED`, `FAVORITE_MOVED`, `COLLECTION_CREATED`, etc. (extend
`packages/audit/src/types.ts`). This is a lightweight social/prefs signal, not a
state machine — **no FSM** is needed (FSMs are for product/partner lifecycle
states; a favorite is a simple toggle).

**Guest saves (marketing app).** A guest tapping a heart on a public marketplace
card is redirected to `creatorUrl('/login')` with a `?favorite=<kind>:<id>`
return param; after login the server action fires once and lands them on the
customized product or `/favorites`. Keep the intent, don't lose the tap.

---

## 6. UX / surfaces

### 6.1 The heart (toggle) — everywhere the product appears
- **State:** outline (`Heart`) when not saved, filled pink (`#FF2E63`) when
  saved. Small scale-pop on toggle. Optimistic update + toast ("Saved to
  Favorites" / "Removed"). Respect `prefers-reduced-motion`.
- **Placement:** top-right over the product image on cards; next to the primary
  CTA on the product detail page (per research, proximity to the customize/buy
  button is preferred).
- **Cards to wire:** marketplace listing cards (`apps/marketing`), product detail
  page, and the creator's own `/products` list cards (own-product favoriting).
- Reuse `AppHeaderIconButton` styling for the header; a dedicated
  `FavoriteButton` client component for cards (owns the optimistic toggle).

### 6.2 Header entry point
- **Creator `TopbarRight`:** wire the existing heart to `/favorites`, add a small
  count badge (saved item count, capped display "9+"). Creators only — this file
  is creator-app-only, so gating is automatic.
- **Marketing `MarketplaceHeader`:** for authenticated creators, the heart
  deep-links to `creatorUrl('/favorites')` (cross-app → `marketingUrl`/`creatorUrl`
  helper + plain `<a>`, never `<Link>` — cross-app `<Link>` 404s). Guests keep
  the sign-in CTA. No heart is shown to non-creator sessions.

### 6.3 `/favorites` page (creator app)
Follow the creator-app surface conventions (not the admin v2 chrome — that's
admin-only). Layout:
- Header band with title + saved count.
- **Two tabs / segmented filter:** "Marketplace" (`PRODUCT_TEMPLATE`) and "My
  products" (`PRODUCT`). Sort (recently saved / name / price).
- **Grid of saved cards.** Each card: image, name, price/price-floor, and
  context CTA —
  - `PRODUCT_TEMPLATE` → **"Customize"** (into the Studio flow) + remove.
  - `PRODUCT` → **"Reorder"** (Amazon "Buy again" flavor — jump to checkout for
    that product) + "Open" + remove.
- **Empty state:** friendly nudge → "Browse the marketplace" (`marketingUrl('/marketplace')`).
- **P1:** collection chips/sidebar, move-to-collection, bulk select bar
  (customize all / add all to cart / remove), private note editing.

### 6.4 Private, always
No share button, no public URL, no "X people saved this" surfaced to creators.
Favorites never appear on any public creator/brand profile.

---

## 7. Tiers

Favorites themselves are available to **all** creator tiers (Maker+) with no cap
— saving is core engagement and should never be gated. If we want a tier lever,
apply it to **collections count** in P1 (mirrors the brand-kit cap pattern:
Maker N, Builder more, Agency ∞), never to the number of favorites. Keep P0
ungated.

---

## 8. Phasing

**P0 — make it real (private, flat list).**
- `Favorite` model + enum + back-relations; `db:push` + `db:generate` + `.next` clear.
- `toggleFavorite` / `listFavorites` / `setFavoriteNote` actions + audit entity.
- `FavoriteButton` component wired on marketplace listing cards, product detail,
  and own-product cards.
- Creator header heart → `/favorites` with count badge; marketing header heart →
  cross-app deep link for authed creators; guest → login-with-intent.
- `/favorites` page: two-tab filter, sort, Customize / Reorder / Remove, empty state.

**P1 — collections + bulk.**
- `FavoriteCollection` model + CRUD actions; move-to-collection; collection chips.
- Bulk select bar (customize all / add all to cart / remove); private notes.
- Tier cap on collection count (if desired).

**P2 — re-engagement.**
- Price-drop / restock / "back in catalog" notifications on favorited templates
  (wire into `packages/notifications`; respects the in-app notifications audit).
- "Recently viewed," recommendations seeded from favorites, "customers also
  saved" (admin-gated, still private per-creator).

---

## 9. Invariants / house-rules compliance

- **Cross-app links** use `marketingUrl()` / `creatorUrl()` + plain `<a>` (the
  marketplace lives in `apps/marketing`, favorites page in `apps/creator`).
- **Every mutation writes an `AuditLog`** via `logAuditAs`.
- **Ownership via `packages/auth`** centralized guard — no ad-hoc `creatorId`
  checks (tenant isolation = threat #1).
- **CockroachDB-safe:** bare `String` (no `@db.Text`), `uuid()` ids, additive
  migration, `db push` not `migrate`.
- **No Lucide-icon config across the RSC boundary** — import `Heart` inside the
  client `FavoriteButton`/header components, don't pass icon refs from a server
  component.
- **Hot-file note:** `TopbarRight.tsx` and `MarketplaceHeader.tsx` are shared
  header files — single-writer, commit immediately after editing (two-agent
  collision rule).

---

## 10. Open questions for review

1. **Own-product "Reorder" target** — jump straight to that product's checkout,
   or to a pre-filled reorder cart? (Leaning: straight to checkout for the
   product, reusing the existing wizard.)
2. **Collections in P0 or P1?** Spec puts them in P1 to ship the core fast.
   Confirm.
3. **Count badge** on the header heart — show it in P0, or keep the heart badge-
   less until there's a notification story in P2?
4. **Marketing marketplace heart** — keep it (authed creators favorite in-place
   while browsing) or remove it and route all favoriting through the creator app
   only? Recommended: keep it, deep-linked, since browsing is where saving
   happens.

---

## 11. Locked interaction design (2026-07-07, Pavel)

Answers to §10 + a placement decision that **supersedes the "heart on the image"
framing in §6.1**:

- **No icon on the hero image, ever.** Save/Share live in a quiet **action
  cluster** beside the product title (detail page) and in the **card footer**
  next to price (grid) — imagery stays clean.
- **Save icon = bookmark, not heart.** `ti-bookmark` / Lucide `Bookmark`; fills
  pink (`#FF2E63` tint) when saved. Bookmark reads as "save to work on" (B2B
  utility); heart read as "I love this." The header entry icon switches to the
  **same bookmark** for consistency (the current `Heart` in `TopbarRight` +
  `MarketplaceHeader` becomes `Bookmark`).
- **Share = share sheet.** A `Share` button opens a popover (desktop) with X,
  LinkedIn, WhatsApp, and Copy link; on mobile it invokes the native OS share
  sheet via the Web Share API (`navigator.share`, feature-detected). Share
  targets the **public marketplace product-page URL** — it never exposes the
  creator's private Favorites list. Share is in P0.
- **Detail action row:** `[ Save ] [ Share ] [ ⋯ ]` as ghost/pill buttons, with
  the black **Customize** pill as the one loud primary action to their right.
- **Grid card:** two always-visible quiet icon buttons (Save, Share) in the
  footer next to price — no image overlay, no hover-reveal (discoverable on
  touch).
- **Q1 Reorder** → straight to the product's existing checkout wizard.
- **Q2 Collections** → P1. **Q3 count badge** → yes in P0.
  **Q4 marketplace save** → keep in the marketing app, deep-linked.

Component names (P0 build): `SaveButton` (optimistic bookmark toggle) +
`ShareSheet` (popover + Web Share). Live as creator-app components in P0; graduate
to `@ilaunchify/ui` when the marketing marketplace slice consumes them.
