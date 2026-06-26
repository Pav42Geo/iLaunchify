# Hero Usage Policy — iLaunchify

*Researched + written 2026-06-25. Decides where a page gets a punchy hero, a compact header, or nothing — per surface and per page level. Backed by NN/g eyetracking research, Baymard testing, and the Polaris / Carbon / Atlassian / AWS Cloudscape design systems.*

---

## TL;DR

You were right that it's "too much." The platform has ~57 hero/header instances across three patterns, and the biggest offender is a **decorative title band repeated on ~28 admin pages + selectively on creator/partner pages** that adds no orientation value and pushes the actual work down the screen.

The fix is one rule:

> **Match prominence to intent. A hero is a scarce, high-value moment — not a default page wrapper.**

Three treatments, assigned by what the user is there to do:

| Treatment | For | iLaunchify surfaces |
|---|---|---|
| **① Punchy hero** (headline + punch-line + 1 CTA) | Persuasion / acquisition / first impression | Marketing landing pages, signup brand panel |
| **② Compact header** (title + optional subtitle + actions) | Orientation on a task surface | App dashboard landings, admin list/detail pages, settings |
| **③ No band** (toolbar/title only) | Deep task, full-screen work | Design Studio, Packaging Studio, checkout, builder steps |

---

## Why — the evidence

**Heroes help only when they carry content, not decoration.**
- Users give ad-shaped/decorative page-top bands almost no attention — **0.8% of fixations** went to right-rail ads in NN/g eyetracking, ~33× less than their size warrants; "banner blindness" applies to anything that *looks* decorative, including a hero band. ([NN/g — Banner Blindness Revisited](https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/))
- The top of the page is the most valuable real estate — **~57–80% of viewing time is above the fold**, with a sharp drop right at the fold. A tall decorative band spends the most-attended pixels on the least task-relevant content. ([NN/g — Scrolling and Attention](https://www.nngroup.com/articles/scrolling-and-attention/))
- **"If everything is emphasized, nothing stands out."** NN/g's visual-hierarchy guidance says keep big/emphasized elements to a max of ~2. Spending a brand-forward hero on every page flattens the hierarchy and the genuinely high-value pages lose their punch. ([NN/g — Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/))

**Authenticated app surfaces should be utilitarian, not marketed-to.**
- AWS Cloudscape states the rule outright: a hero header is for "expressive use-cases… pages with low level of interactivity," and *"Don't use a hero header in productive use cases where users need to focus on performing a task or interact with large amounts of data… The amount of attention it draws can reduce user focus." A hero "should always be used with intent… not as a default across any particular site."* ([Cloudscape — Hero header](https://cloudscape.design/patterns/general/hero-header/))
- The page-header's job on app surfaces is **wayfinding, not promotion** — title + optional subtitle + actions (+ breadcrumbs). That's the entire pattern in Polaris, Carbon, and Atlassian. ([Polaris — Page](https://polaris-react.shopify.com/components/layout-and-structure/page), [Carbon](https://carbondesignsystem.com/), [Atlassian — Page header](https://atlassian.design/components/page-header))
- Admin/data tools are **high-density by default** (Polaris reserves generous spacing for focused editing pages, *not* list/table pages). Returning power users — your admins — need efficiency, not orientation chrome; "they need your app to get out of the way." ([Polaris — Density](https://polaris-react.shopify.com/design/layout/density), [NN/g — Novice vs. Expert](https://www.nngroup.com/articles/novice-vs-expert-users/))

**Repetition only orients when it carries wayfinding info.**
- The orientation value of a header comes from the **label + breadcrumb + active-nav state** — not the band's size or ornament. A consistent, compact page title in the same spot delivers the "where am I" answer at a fraction of the vertical cost. ([NN/g — You Are Here](https://www.nngroup.com/articles/navigation-you-are-here/), [Breadcrumbs](https://www.nngroup.com/articles/breadcrumbs/))

**Marketing: one strong hero per page, never a carousel.**
- Real click data: **~1% of visitors click a hero carousel and ~84% of those clicks hit the first slide.** Use a single static hero. ([Erik Runyon — Carousel Stats](https://erikrunyon.com/2013/01/carousel-interaction-stats/), [Baymard — Homepage Carousels](https://baymard.com/blog/homepage-carousel))
- One page = one dominant value proposition + one primary CTA; avoid multiple competing hero bands of equal weight. Verify with the **5-second test** (can a stranger say what this is?). ([NN/g — Homepage Design](https://www.nngroup.com/articles/homepage-design-principles/), [Unbounce — Anatomy of a Landing Page](https://unbounce.com/landing-page-articles/the-anatomy-of-a-landing-page/))

**First-run vs returning.** Orientation/welcome chrome has the most value on a user's *first* visit and decays to noise on return. Tutorials/welcome bands don't improve task performance in NN/g testing. So a welcome hero on a dashboard landing is fine; the same band on every inner page is not. ([NN/g — Onboarding](https://www.nngroup.com/articles/onboarding-tutorials/))

---

## The per-surface map

### Marketing app (`apps/marketing`) — heroes belong here
This is acquisition. Punchy heroes are correct — but **one per page**, tapering by depth.

| Page | Treatment | Notes |
|---|---|---|
| Home `/` | ① Punchy hero — largest display type | The single biggest brand moment. Keep the mesh/sticker hero, but it's the *only* hero on the page. |
| `/business`, `/influencers` | ① Punchy hero (`HeroBanner` page) | Audience-specific value prop + 1 CTA. |
| `/pricing`, `/how-it-works`, `/contact-sales` | ① **Informational** hero — smaller, headline + value statement, navigational | These are orientation/routing pages; relax to a clear headline (no hard single-CTA rule), step the display size **down** from the home hero. |
| `/marketplace` | ① Island hero (compact, embedded) | Already correct — keep the `island` variant, not a full-bleed band. |
| `/academy`, `/business/academy` | ① One hero (`AcademyHero`) | Fine — but **consolidate** `AcademyHero` with `HeroBanner` so there aren't two near-identical hero components to maintain. |

**Rule for marketing:** taper prominence inward. Home = "display large." Category/sub pages = a step smaller. Never two competing heroes on one page.

### Auth (login / signup) — light exception
Sign-in/sign-up is an "expressive" surface (Cloudscape lists it), so a brand panel is justified.
- **Signup** (creator + partner): the dark split-panel with the brand + punch-line is good — keep it.
- **Login**: keep it light — logo + a short headline. It doesn't need the full feature-grid treatment.

### Creator app (`apps/creator`) — task surface, mostly ② / ③
The user has already converted. Stop marketing to them.

| Page | Treatment |
|---|---|
| Dashboard landing (`/dashboard`) | ② Compact header — a light welcome line is OK (first-run value); keep it short, no big band. |
| Products, orders, brands lists | ② Compact header — title + count + primary action ("New product"). No decorative band. |
| Settings / billing / plan / notifications | ② Compact header — title + 1-line subtitle **only if it adds context**. |
| **Design Studio canvas** | ③ **No band** — it's a full-screen tool; the chrome is the top toolbar. (Already correct.) |
| Checkout steps | ③ No band — the step *is* the content. |

### Partner app (`apps/partner`) — same as creator
| Page | Treatment |
|---|---|
| Dashboard landing | ② Compact header (optional first-run welcome). |
| Products / packaging / certifications / orders | ② Compact header + actions. |
| Settings | ② Compact header; drop subtitles that restate the title. |
| **Packaging Studio / builder steps / Dieline Studio** | ③ No band — full-task surfaces. (Already correct.) |

### Admin app (`apps/admin`) — the main cleanup
This is a dense, power-user console used daily. The repeated `rounded-3xl … bg-[var(--bg-hero)] px-7 py-6` band on ~28 pages is **decorative chrome, not wayfinding.**

**Recommendation:**
- Shrink the admin v2 band to a **compact header row**: title + (subtitle only when it carries real info) + the KPI strip + primary action — let the data table start higher. Keep the hairline border for separation. This is consistent with your already-locked admin-v2 intent; it just needs to be *shorter* and stop repeating a tall card on every page.
- **Admin dashboard landing** can keep a slightly richer header (it's the "home" of the console). Every inner list/detail page goes compact.
- **Drop subtitles that just restate the page title** ("Orders" → subtitle "All orders" = noise). Keep subtitles only where they explain a non-obvious scope or a rule.
- Replace orientation-by-band with **breadcrumb + active sidebar state** (you already have sidebar v3) — that's what actually answers "where am I."

---

## The decision checklist (use on any new page)

1. **Is the user here to be persuaded, or to do a task?** Persuaded → ① hero. Task → ② or ③.
2. **Is it a full-screen tool or a single-task step?** → ③ no band.
3. **Squint test:** blur the page. On a task page, the *work area* (table/form/canvas) should dominate — not the header. If the band dominates a utility page, it's too heavy.
4. **Does the subtitle add information the title doesn't?** No → delete it.
5. **First-run only?** A welcome/orientation moment can be richer on first visit; it should not persist as a band on every return visit or inner page.
6. **One hero per page.** If a marketing page has two competing hero bands, demote one.
7. **Never a carousel.** Static hero only.

---

## What to change, in priority order

1. **Admin band → compact header** across the ~28 list/detail pages (biggest win; reclaims above-the-fold space for tables). Keep one richer header on the admin dashboard.
2. **Audit subtitles** platform-wide; delete the ones that restate the title.
3. **Creator/partner inner pages** → compact headers; confirm Studios/checkout stay band-free (they already are).
4. **Marketing** → confirm one hero per page; taper display size inward; **merge `AcademyHero` into `HeroBanner`** to kill the duplicate hero component.
5. **Lighten the login** header (keep signup's brand panel).

None of this is a redesign — it's mostly making one band shorter and deleting redundant subtitles. Happy to implement it surface by surface (starting with the admin header, which is ~80% of the "too much" feeling) whenever you want.
