# iLaunchify Academy — V1 Spec

**Status:** Draft 2026-06-06 (design direction locked; the five §16 decisions are now resolved — ready to phase into build).
**Supersedes:** the single-page Academy draft from earlier the same day (one public hub → now **two separate academies**).
**Companion docs:** `MARKETPLACE_DESIGN.md` (the public front-door pattern + card this Academy reuses), `DESIGN_SYSTEM.md` (tokens), the **Neon theme** mood board (`mood-board-neon.html` — the authoritative palette/type for these surfaces), `PLATFORM_SPEC.md` (tiers — referenced but Academy is *not* tier-gated), `PARTNER_ONBOARDING.md` + `CREATOR_ONBOARDING.md` (the flows the content teaches), `SECURITY_ARCHITECTURE.md` (admin auth + tenant rules).
**Scope:** two public, SEO-indexable learning sites — a **Creator Academy** on the marketing app and a **Partner Academy** on the Business landing — plus one shared admin CMS to author, sequence, review, publish, and retire their content. Covers IA, the two skins, content model, public UX, the admin CMS, the data model, `packages/academy`, build phases, and open decisions.

> **Reference, not a template.** We studied TikTok Shop Academy's *shape* only (a hero with one big "what do you want to learn?" search, a topic/course grid, a role split). We are not copying it — and deliberately **not** building its massive multi-level catalog. iLaunchify Academy is intentionally shallow (three levels), built around *our* business in *our* Neon theme.

---

## TL;DR

Two small, focused academies that share one codebase, one CMS, and one three-level structure — reskinned per audience:

- **Creator Academy** — public, on the marketing app at `/academy`. **White hero** (Neon theme signature: Bricolage display headline with a pink accent word, black-pill CTA). Aspirational, acquisition-driven. Teaches: launch your first product, the Design Studio, labels, selling channels.
- **Partner Academy** — public, on the Business landing at `/business/academy`. **Dark (ink-900) hero** where neon green is the accent. Operational, B2B tone. Teaches: onboarding & activation, catalog builder, quality & certifications, order ops.

Both are **three levels deep, no more**: Home → Course → Lesson. V1 lessons are **video only** (plus an article type that powers a dated updates feed). No interactive walkthroughs, no quizzes, no certificates, no tier gating in V1. Content is authored through an admin CMS that follows the locked admin v2 surface pattern with a `draft → in-review → published → archived` workflow and full audit trail.

---

## 1. What the Academy is and isn't

### Is
- **Two** public, indexable sites, one per audience, each living where that audience already arrives (creators on marketing, partners on the Business landing).
- **Shallow and fast:** exactly three levels. A learner is never more than two clicks from any lesson.
- **Video-first**, with a lightweight article type for the updates/policies feed.
- **CMS-managed:** ops authors, reviews, publishes, reorders, and retires content without a deploy.
- **On-brand:** strictly the Neon theme (§5) — pink brand, ink-900 black-pill CTA, neon green on dark only, Inter + Bricolage Grotesque.

### Isn't
- **Not one combined hub.** Creator and Partner academies are separate pages on separate surfaces. They share components and data, not a URL.
- **Not tier-gated.** Open to all creators and all partners (manufacturers, co-packers, print providers). No Maker/Builder/Agency or Verified/Trusted/Premier gate.
- **Not a consumer storefront.** End-buyers never land here.
- **Not an LMS** in V1 — no quizzes, exams, badges, certificates, or graded progress.
- **Not interactive walkthroughs** in V1 — dropped to keep authoring light. The lesson `type` enum keeps the door open for V1.1 without a migration.

---

## 2. The two academies

| | **Creator Academy** | **Partner Academy** |
|---|---|---|
| **App / route** | marketing (3010) · `/academy` | marketing (3010) · `/business/academy` |
| **Audience** | influencer / brand-owner building a CPG product | manufacturers, co-packers, print providers |
| **Hero** | **white** — Bricolage headline + pink accent word + black-pill CTA | **dark ink-900** — neon-green accent badge + white-pill CTA |
| **Tone** | aspirational, acquisition | operational, B2B |
| **CTA** | "Start free" → `creatorUrl('/signup')` | "Apply to partner" → partner apply flow |
| **Topics** | Getting started · Design Studio · Labels & compliance · Selling channels | Onboarding & activation · Catalog builder · Quality & certifications · Order ops |
| **Flagship course** | "Launch your first product" (idea → label-ready → first run) | "Get activated & take your first order" |

Both share one policy/updates feed style (dated `ARTICLE` lessons) so feature/compliance changes have a canonical home on each surface.

> The two academies are an `audience` facet (`CREATOR | PARTNER`) on the same models, **not** separate apps or schemas. Routing and theme switch on audience; everything below the hero is the same components.

---

## 3. Information architecture — three levels, hard stop

```
Academy (per audience)
└── Level 1 · Home            /academy  ·  /business/academy
    │   hero + search + topic grid (~4) + one featured course + updates teaser + closing CTA
    └── Level 2 · Course        /academy/[courseSlug]
        │   header (title, summary, level · minutes · lesson count, "Start course") + flat lesson list
        └── Level 3 · Lesson    /academy/[courseSlug]/[lessonSlug]
            video player + transcript + prev/next + curriculum sidebar
```

There is **no** module/chapter nesting inside a course in V1 (the `AcademyModule` model exists but is optional and unused by default — see §15). Browse facets used for the topic grid, search, and filtering: `audience`, `category` (topic), `level` (`BEGINNER | INTERMEDIATE | ADVANCED`), and lightweight `tags`.

---

## 4. Content types (V1)

| Type | What it is | Player | Authoring |
|---|---|---|---|
| **VIDEO** | A hosted/embedded video lesson with a transcript + short body | Video frame + transcript panel + prev/next + curriculum rail | Video source (§16 hosting decision) + MDX body + duration |
| **ARTICLE** | A rich text/MDX page; powers the **Updates/Policies** feed and any non-video explainer | Reading layout with TOC | MDX body + optional hero |

`INTERACTIVE` is **out of V1** (dropped 2026-06-06). The enum value is reserved so V1.1 can add step-based guided walkthroughs without a schema migration. Quizzes, certificates, and downloadable resources are also V1.1+ (§17).

---

## 5. Neon theme — the locked visual system

Authoritative source: the Neon mood board. Both academies use it verbatim; the only difference between them is the hero surface (white vs ink-900).

**Palette**
- **Pink (brand)** `#FF2E63` (pink-500); pink-700 `#C71350` for pink text on white; pink-50 `#FFE9F0` for badge fills.
- **Ink (neutral / buttons / dark surface)** ink-900 `#18181A`, ink-800 `#232327`, ink-700 `#33343C`, ink-600 `#474954` (secondary text), ink-400 `#9A9CA6` (muted-on-dark), ink-200 `#E0E1E5` (borders), ink-100 `#EEEFF1`.
- **Neon green (accent)** `#B5FF3D` (neon-500) — **dark surfaces only**; never as text on white.
- **White** `#FFFFFF` canvas + clean white header.

**Signature components**
- **Black-pill CTA** — ink-900 fill, white text, `border-radius:999px`, lifts on hover. One per view. (On the dark partner hero the pill inverts to white fill / ink-900 text.)
- **Pink** for highlights, active chips, links (pink-700 on white), focus ring `0 0 0 3px rgba(255,46,99,0.15)`.
- **Neon-green badge** (`badge-neon`: ink-900 bg, neon text) only on dark.

**Type**
- **Inter** — body (15px/1.55), UI, labels.
- **Bricolage Grotesque** — display headlines (hero, section heads), 700–800, tight tracking (`-0.03em`).

**Density** (from mood board §05): creator surfaces breathe (comfortable padding); partner surfaces pack in (compact padding, tables). Applies to Academy too — the Partner Academy uses tighter rows.

**Marketplace card reuse** — course cards follow the `mp-card` pattern (image 4/5, hover lift, title + meta row), so Academy feels native to the rest of the site.

**Accessibility (WCAG 2.1 AA, verified in mood board):** white-on-ink-900 button 17:1 (AAA); pink-700 text on white 6.2:1 (AA); never neon on white (1.3:1). Captions/transcripts on every video; keyboard-navigable player; `focus-visible` pink ring.

---

## 6. Public surfaces & routes

App Router on marketing (3010). Reserved static segments are guarded so a course slug can't collide.

**Creator Academy**

| Route | Page |
|---|---|
| `/academy` | Home — white hero + search + trending chips + topic grid + featured course + updates teaser + closing black-pill CTA |
| `/academy/topics/[topicSlug]` | Topic landing — course grid for one category |
| `/academy/[courseSlug]` | Course page (level 2) |
| `/academy/[courseSlug]/[lessonSlug]` | Lesson page (level 3) |
| `/academy/updates` | Dated updates/policies feed (ARTICLE) |
| `/academy/search?q=` | Search results |

**Partner Academy** — identical tree under `/business/academy` (`/business/academy`, `/business/academy/topics/[topicSlug]`, `/business/academy/[courseSlug]`, `/business/academy/[courseSlug]/[lessonSlug]`, `/business/academy/updates`, `/business/academy/search`). Reserved slugs: `topics`, `updates`, `search`.

**Shared route helper.** A small `academyBasePath(audience)` returns `/academy` or `/business/academy`; all internal links build from it so the two trees never drift. Cross-app deep-links (into creator/partner apps) use `creatorUrl()` / `partnerUrl()` + plain `<a href>` — never `<Link href>` (404s across apps).

**SEO (the acquisition thesis — first-class).** `schema.org/Course` + `VideoObject` structured data; per-page `metaTitle` / `metaDescription` / `ogImageUrl` authored in the CMS; both trees in the marketing sitemap; canonical URLs; `index,follow` only when published, `noindex` on draft/in-review/archived. Lesson pages are **server-rendered with real content** — never a JS shell (the exact failure mode of the reference portal).

---

## 7. Level layouts (locked)

**Level 1 — Home.** Hero (white for creator / ink-900 for partner) with one big search and trending chips → "Browse by topic" grid of ~4 category cards → one featured course (`mp-card` wide variant) → updates teaser → closing black-pill CTA band. Deliberately sparse — no endless rails.

**Level 2 — Course.** Breadcrumb → compact header (title, one-line summary, three meta chips: level · minutes · lesson count, single "Start course" pink/black CTA, small thumbnail) → flat numbered lesson list. Each row: index, type icon (play = video), title, duration, completion check. No modules, no tabs.

**Level 3 — Lesson.** Breadcrumb (Lesson X of N) → two columns. Main: video frame, title + meta, collapsible transcript, prev/next. Right rail: course curriculum with current lesson highlighted in pink + thin progress bar. (Progress UI is visual-only in V1 unless logged in — see §10.)

---

## 8. Admin CMS — "fully manageable" (apps/admin, port 3003)

One CMS manages both academies; the `audience` field routes content to the right surface. Every list page follows the **locked admin v2 surface pattern** verbatim — cream `#F3EFE8` hero band, 5-card KPI strip, URL-driven filter chips, sortable plain `<table>` with `focus-visible:ring-pink-500` headers, `RowActionsMenu` (3-dot) deep-linking to detail pages, prev/next paginator at 50/page. **No shadcn Card, no `@ilaunchify/ui` Card.** Build with the `v2-admin-surface-builder` subagent; editors follow the `partner-editor-card-builder` pattern (autosave + FSM + audit + approval-marked cards).

> The admin chrome stays cream per the locked admin pattern — that is unrelated to the public Academy theme. Cream is dropped only from the *public* Academy surfaces.

| Route | Surface |
|---|---|
| `/academy` | Overview — KPIs (published / in-review / drafts / total lessons / 30-day views), split by audience |
| `/academy/courses` | Courses list (v2): chips for **audience**, status, category, level; columns title · audience · category · level · lessons · status · updated |
| `/academy/courses/new`, `/academy/courses/[id]/edit` | Course editor — metadata, SEO, hero, lesson reorder (drag), publish FSM control |
| `/academy/lessons` | Flat lessons list across both academies, v2 pattern |
| `/academy/lessons/[id]/edit` | Lesson editor — type (VIDEO/ARTICLE), video source, MDX body/transcript, duration, status |
| `/academy/categories` | Topic taxonomy (order, audience, status) |
| `/academy/updates` | Authoring for the updates feed (ARTICLE lessons) |

**Authoring workflow.** Create course in `DRAFT` (pick audience → it goes to that academy) → fill metadata/hero/SEO → add lessons → `IN_REVIEW` → second admin reviews → `PUBLISHED` (sets `publishedAt`, flips to `index,follow`) → `ARCHIVED` retires (kept for history, dropped from public + sitemap). Reorder by drag; changes reflect instantly on the public side (content is data, not deploys).

**Governance.** Every mutation writes an `AuditLog` via `packages/audit`; every status change goes through the FSM helper (never inline `prisma.update`). Admin auth + tenant rules per `SECURITY_ARCHITECTURE.md`. Media via `packages/storage`.

---

## 9. Data model (packages/db — CockroachDB-safe)

Conventions enforced: `id String @id @default(uuid())` (no cuid/autoincrement — avoids hotspots); **bare `String`** for unbounded text (never `@db.Text` — fails `prisma generate` P1012); `@db.String(N)` for caps; migrations are **additive**.

```prisma
enum AcademyAudience    { CREATOR PARTNER }
enum AcademyLevel       { BEGINNER INTERMEDIATE ADVANCED }
enum AcademyStatus      { DRAFT IN_REVIEW PUBLISHED ARCHIVED }   // shared FSM
enum AcademyLessonType  { VIDEO ARTICLE INTERACTIVE }            // INTERACTIVE reserved, unused in V1
enum AcademyVideoProvider { MUX YOUTUBE VIMEO CLOUDFLARE SELF }  // decided in §16

model AcademyCategory {
  id          String   @id @default(uuid())
  slug        String   @unique
  name        String
  description String?
  audience    AcademyAudience
  iconKey     String?          // string key resolved to a Lucide icon client-side (RSC rule)
  order       Int      @default(0)
  status      AcademyStatus @default(DRAFT)
  courses     AcademyCourse[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([audience, slug])
}

model AcademyCourse {
  id            String   @id @default(uuid())
  slug          String
  title         String
  subtitle      String?
  summary       String
  audience      AcademyAudience
  level         AcademyLevel @default(BEGINNER)
  categoryId    String?
  category      AcademyCategory? @relation(fields: [categoryId], references: [id])
  heroImageUrl  String?
  estimatedMinutes Int?
  status        AcademyStatus @default(DRAFT)
  order         Int      @default(0)
  publishedAt   DateTime?
  metaTitle       String?
  metaDescription String?
  ogImageUrl      String?
  createdById   String?
  updatedById   String?
  tags          String[]
  modules       AcademyModule[]
  lessons       AcademyLesson[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([audience, slug])
}

model AcademyModule {                 // optional grouping; unused by default in V1
  id        String  @id @default(uuid())
  courseId  String
  course    AcademyCourse @relation(fields: [courseId], references: [id])
  title     String
  order     Int     @default(0)
  lessons   AcademyLesson[]
}

model AcademyLesson {
  id          String  @id @default(uuid())
  courseId    String
  course      AcademyCourse @relation(fields: [courseId], references: [id])
  moduleId    String?
  module      AcademyModule? @relation(fields: [moduleId], references: [id])
  slug        String
  title       String
  type        AcademyLessonType @default(VIDEO)
  summary     String?
  bodyMdx     String?          // transcript (VIDEO) or full body (ARTICLE)
  durationSeconds Int?
  videoProvider AcademyVideoProvider?
  videoAssetId  String?
  order       Int     @default(0)
  status      AcademyStatus @default(DRAFT)
  publishedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([courseId, slug])
}

// V1.1 (schema-ready, no UI in V1): per-user progress for logged-in creators/partners
// model AcademyProgress { userId, lessonId, status, completedAt, @@unique([userId, lessonId]) }
```

Extend `packages/audit` entity types with `ACADEMY_COURSE`, `ACADEMY_LESSON`, `ACADEMY_CATEGORY`.

**Stale-client discipline:** after `prisma migrate dev`, run the full incantation — `pnpm db:generate` → `rm -rf apps/*/.next` → restart `next dev` (the old client gets bundled into `.next` via `transpilePackages`). Hand off all three steps with any schema work.

---

## 10. packages/academy — content service

New shared package, mirroring `packages/marketplace` / `packages/orders`:
- **Queries:** `getPublishedCourses({audience, category, level, q})`, `getCourseBySlug(audience, slug)`, `getLessonBySlug`, `getUpdatesFeed(audience)`, `getFeatured(audience)`, `searchAcademy(audience, q)`.
- **FSM:** `transitionAcademyStatus(entity, to, actor)` — the only path that writes status; writes audit; enforces `DRAFT→IN_REVIEW→PUBLISHED→ARCHIVED`, `PUBLISHED→ARCHIVED`, `IN_REVIEW→DRAFT`.
- **Routing:** `academyBasePath(audience)` + slug/link builders shared by both trees.
- **Ordering:** reorder helpers for category/lesson `order`.
- **Render:** MDX → safe HTML, transcript formatting, structured-data builders (Course/VideoObject).
- **Seed:** `packages/db/prisma/seed-academy.ts` — the Creator flagship ("Launch your first product") and the Partner flagship ("Get activated & take your first order"), so surfaces are never empty during build/QA.

---

## 11. Search & progress

- **Search (V1):** server-side `ILIKE`/trigram query over published content (`title`, `summary`, `tags`, `bodyMdx`), scoped by audience. Trending chips are admin-curated strings. Move to a dedicated index (Typesense/Algolia) only if volume demands it (V1.1).
- **Progress (V1):** public and stateless — no login, no saved progress. The `AcademyProgress` model is declared but UI-less so V1.1 can add "continue where you left off" for logged-in creators/partners without a migration.

---

## 12. Tier gating posture (none in V1)

Open to all creators and all partners. No `packages/plans` gate is wired. The `audience` facet + the option to add a `minTier` column later means premium tracks could come without re-architecting — consistent with "never write 'Premier partner gets X'" until tier meaning is decided.

---

## 13. Build phases (mapped to subagents)

| Phase | Deliverable | Subagent / pattern |
|---|---|---|
| **A — Foundation** | Prisma models + enums + migration; `packages/academy` skeleton + FSM + `academyBasePath`; audit entity types; `seed-academy.ts` | `prisma-migrator` |
| **B — Admin lists** | `/academy` overview + `courses`, `lessons`, `categories` lists (audience chip) | `v2-admin-surface-builder` |
| **C — Admin editors** | Course editor (metadata/SEO/hero/reorder/FSM) + lesson editor (video/article, MDX, duration) | `partner-editor-card-builder` |
| **D — Creator Academy public** | `/academy` home (white hero) + topic landing + course + lesson, Neon theme | marketing app, `mp-card` reuse |
| **E — Partner Academy public** | `/business/academy` tree (dark hero), same components, audience-switched | marketing app |
| **F — Search + SEO** | Server search, structured data, sitemap, OG, canonical/noindex | marketing app |
| **G — Polish + QA** | WCAG AA pass, real seed content, cross-app link audit, typecheck/lint, screenshot review | verification step |
| **V1.1+** | Logged-in progress, interactive walkthroughs, resources, quizzes/certificates, dedicated search | future |

Phases A→C and D→F can run partly in parallel once the model in A is locked (admin and marketing are different apps). D and E share components — build D first, then E is mostly an audience/theme switch. **Watch two-agent hot-file collisions** (commit Academy files promptly or hand single-writer specs).

---

## 14. Risks & gotchas (iLaunchify-specific)

1. **Cross-app links** — marketing→creator/partner must use `creatorUrl()`/`partnerUrl()` + `<a href>`. `<Link href>` 404s across apps.
2. **No `@db.Text`** — Cockroach rejects it; transcripts/bodies use bare `String`.
3. **Stale Prisma client after migrate (3 layers)** — `pnpm db:generate` → `rm -rf apps/*/.next` → restart. Hand off all three.
4. **RSC icon boundary** — don't pass Lucide icon refs server→client; store `iconKey` strings, resolve in the client component.
5. **Reserved slugs** — guard `topics`, `updates`, `search` on both trees.
6. **`/business` is on marketing (3010)** — both academies are the same app; no new app/port. The Partner Academy is *not* the authenticated partner app (3002).
7. **Legacy FOD container squats port 3000** — any localhost:3000 weirdness during testing → `docker ps | grep frontend` first.
8. **Neon on white is illegal** — neon green only on ink-900/dark surfaces. Enforce in review.

---

## 15. Success signals

Organic `/academy/*` and `/business/academy/*` traffic converting to signups/partner applications (acquisition); faster time-to-first-product-customize for creators who touched the Academy (activation); fewer partner-onboarding tickets after the Partner Academy ships (de-risk); updates feed reduces "didn't know it changed" escalations.

---

## 16. Decisions (locked 2026-06-06)

1. **Video hosting → Mux.** Hosted, brand-controlled player with captions and per-lesson analytics. `AcademyVideoProvider` default is `MUX`; other providers stay in the enum as escape hatches but Mux is the V1 path.
2. **Module layer → dormant.** `AcademyModule` stays in the schema but unused; courses render flat lesson lists in V1.
3. **Updates/Policies source → authored fresh in the Academy CMS.** Single source of truth, no coupling to the notifications/compliance pipeline in V1. Ingesting from that flow is a V1.1 option if it earns its keep.
4. **Search → Cockroach `ILIKE`/trigram.** Server-side, scoped by audience. No external search vendor in V1; revisit Typesense/Algolia only if volume demands it.
5. **Brand name → "iLaunchify Academy".** Used across both surfaces, nav, slugs, and OG.

---

## 17. Out of scope (V1)

Interactive/guided walkthroughs, quizzes, exams, grading, certificates, badges, learner accounts/progress UI, downloadable resources, community/discussion, instructor-led live sessions, localization, and any tier-gated premium tracks. All are V1.1+ and the schema is shaped to absorb them additively.
