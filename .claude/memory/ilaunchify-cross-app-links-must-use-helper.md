---
name: ilaunchify-cross-app-links-must-use-helper
description: "iLaunchify is a four-app monorepo (creator/3000, partner/3002, admin/3003, marketing/3010). Routes only exist within their own Next app — `<Link href=\"/pricing\">` inside the creator app navigates within the creator app and 404s. Cross-app navigation MUST use the per-app URL helper (`marketingUrl()`, etc.) with a plain `<a href>`, not `<Link>`."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

When wiring upgrade/marketing/business CTAs across the iLaunchify monorepo, never use `<Link href="/pricing">` (or any other cross-app path) directly. Each Next.js app only knows its own routes:

- `apps/creator` (3000) owns `/marketplace`, `/products/...`, `/orders/...`, `/design/...`, `/account/...`
- `apps/partner` (3002) owns `/partner/...`, `/dispatch/...`
- `apps/admin` (3003) owns `/admin/...`
- `apps/marketing` (3010) owns `/`, `/pricing`, `/how-it-works`, `/contact-sales`, `/business`, `/launch/[niche]`, `/login`, `/signup`

So a `<Link href="/pricing">` rendered inside `apps/creator` navigates to `localhost:3000/pricing` and 404s. The marketing app's `/pricing` lives on `localhost:3010`.

**Why:** Burned this lesson again 2026-05-30 (G6.c upgrade button — Subscribe & save CTA in the checkout wizard pointed at `/pricing?tier=builder` and 404'd). Pre-existing in R8.c, R16.a, and the canvas UpgradeOverlay. Fixed in commit `c418649`. The marketingUrl helper already existed at `apps/creator/src/lib/marketing-url.ts` and `apps/partner/src/lib/marketing-url.ts` — I just forgot to use it.

**How to apply:**

1. Cross-app navigation always uses the helper + `<a href>` (NOT `<Link>` — these are genuine cross-origin/cross-port navigations, not in-app routes):
   ```tsx
   import { marketingUrl } from '@/lib/marketing-url'
   <a href={marketingUrl('/pricing?tier=builder')}>Upgrade</a>
   ```

2. The helper wraps `NEXT_PUBLIC_MARKETING_URL` with a `http://localhost:3010` dev fallback so dev works without env config.

3. Same pattern applies in reverse — apps/marketing linking into creator dashboard needs a creator-url helper (already exists too: check `apps/marketing/src/lib/`).

4. **When reviewing my own code in a creator/partner/admin file, immediately flag any `<Link href="/pricing">` / `<Link href="/how-it-works">` / `<Link href="/business">` / `<Link href="/contact-sales">` — those are all marketing-app routes.** Same for any `<Link href="/admin/...">` inside non-admin apps, etc.

5. When the user reports a 404 on `localhost:3000/<path>` (or 3002/3003), first check whether `<path>` actually belongs to that app or is a leaked cross-app link. If the path is `/pricing`, `/business`, `/signup`, `/login`, `/how-it-works`, `/contact-sales`, `/launch/...` → it's a marketing-app route and the link should use `marketingUrl()`.

Related: [[ilaunchify-legacy-fod-frontend-squats-port-3000]] — the OTHER common cause of localhost:3000 404/500 surprises.
