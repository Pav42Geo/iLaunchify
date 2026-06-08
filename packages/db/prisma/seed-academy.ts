// iLaunchify Academy seed (ACADEMY_SPEC §10) — the two flagship courses + their
// topic categories, PUBLISHED so the public surfaces are never empty during
// build/QA. Idempotent (upsert by unique keys). Safe to re-run.
//
//   Creator flagship — "Launch your first product"
//   Partner flagship — "Get activated & take your first order"
//
// Content is intentionally light (V1 is video-first; bodies double as the
// transcript). Real Mux assets replace the placeholder videoAssetId pre-launch.

import { PrismaClient } from '@prisma/client'

type Audience = 'CREATOR' | 'PARTNER'
type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
type LessonType = 'VIDEO' | 'ARTICLE'

interface LessonDef {
  slug: string
  title: string
  type: LessonType
  summary: string
  durationSeconds?: number
  bodyMdx?: string
}

interface CourseDef {
  slug: string
  title: string
  subtitle: string
  summary: string
  level: Level
  categorySlug: string
  estimatedMinutes: number
  tags: string[]
  lessons: LessonDef[]
}

interface CategoryDef {
  slug: string
  name: string
  description: string
  iconKey: string
  order: number
}

// ── Topic grids (~4 per audience, ACADEMY_SPEC §2) ───────────────────────────
const CREATOR_CATEGORIES: CategoryDef[] = [
  { slug: 'getting-started', name: 'Getting started', description: 'From idea to your first production run.', iconKey: 'rocket', order: 0 },
  { slug: 'design-studio', name: 'Design Studio', description: 'Design labels and packaging that print clean.', iconKey: 'palette', order: 1 },
  { slug: 'labels-compliance', name: 'Labels & compliance', description: 'Facts panels, claims, and required statements.', iconKey: 'shield-check', order: 2 },
  { slug: 'selling-channels', name: 'Selling channels', description: 'Sell through the channels you already own.', iconKey: 'store', order: 3 },
]

const PARTNER_CATEGORIES: CategoryDef[] = [
  { slug: 'onboarding-activation', name: 'Onboarding & activation', description: 'Get verified and ready to take orders.', iconKey: 'badge-check', order: 0 },
  { slug: 'catalog-builder', name: 'Catalog builder', description: 'Build product templates creators can customize.', iconKey: 'boxes', order: 1 },
  { slug: 'quality-certifications', name: 'Quality & certifications', description: 'Keep certs current and pass review.', iconKey: 'award', order: 2 },
  { slug: 'order-ops', name: 'Order ops', description: 'Dispatch, produce, and fulfill reliably.', iconKey: 'truck', order: 3 },
]

// ── Flagship courses ─────────────────────────────────────────────────────────
const CREATOR_COURSES: CourseDef[] = [
  {
    slug: 'launch-your-first-product',
    title: 'Launch your first product',
    subtitle: 'Idea → label-ready → first run',
    summary:
      'The end-to-end path from a product idea to a label-ready design and your first production order — no manufacturing experience required.',
    level: 'BEGINNER',
    categorySlug: 'getting-started',
    estimatedMinutes: 22,
    tags: ['launch', 'getting-started', 'first-product'],
    lessons: [
      { slug: 'how-ilaunchify-works', title: 'How iLaunchify works', type: 'VIDEO', durationSeconds: 240, summary: 'The orchestration model: you design, our partners produce, you sell through your own channels.', bodyMdx: 'iLaunchify decomposes your order into a production workflow across manufacturing, printing, and fulfillment partners — you never manage them directly.' },
      { slug: 'pick-a-product-template', title: 'Pick a product template', type: 'VIDEO', durationSeconds: 300, summary: 'Browse the marketplace and choose a manufacturer template as your starting point.', bodyMdx: 'Every product starts from a manufacturer-published template — a proven formulation and packaging you customize, not a blank page.' },
      { slug: 'customize-in-the-design-studio', title: 'Customize in the Design Studio', type: 'VIDEO', durationSeconds: 420, summary: 'Brand the label, place your art, and keep the required compliance panels intact.', bodyMdx: 'The Design Studio locks the regulatory regime to your product type, so the right Facts panel and mandatory phrases are always present.' },
      { slug: 'place-your-first-order', title: 'Place your first order', type: 'VIDEO', durationSeconds: 300, summary: 'Choose quantity, fulfillment, and check out — then track production.', bodyMdx: 'Checkout routes your order to the right partners automatically. Restricted categories are blocked before you ever reach this step.' },
      { slug: 'updates-launch-track', title: 'What changed: launch flow updates', type: 'ARTICLE', summary: 'Dated notes on changes to the launch flow and Design Studio.', bodyMdx: '## Launch flow updates\n\nThis feed tracks changes to the creator launch flow so you always know what moved.' },
    ],
  },
]

const PARTNER_COURSES: CourseDef[] = [
  {
    slug: 'get-activated-take-first-order',
    title: 'Get activated & take your first order',
    subtitle: 'Onboarding → catalog → first dispatch',
    summary:
      'Everything a manufacturing, print, or fulfillment partner needs to get verified, publish a catalog template, and accept a first production order.',
    level: 'BEGINNER',
    categorySlug: 'onboarding-activation',
    estimatedMinutes: 24,
    tags: ['onboarding', 'activation', 'partner'],
    lessons: [
      { slug: 'complete-your-onboarding', title: 'Complete your onboarding', type: 'VIDEO', durationSeconds: 300, summary: 'Finish your partner profile and verification sections to get activated.', bodyMdx: 'Activation requires a complete profile and the verification sections relevant to your service type.' },
      { slug: 'add-your-certifications', title: 'Add your certifications', type: 'VIDEO', durationSeconds: 300, summary: 'Upload certificates and keep them current so products pass review.', bodyMdx: 'Certificates have expiry tracking and renewal reminders — an expired cert blocks the products that depend on it.' },
      { slug: 'build-a-product-template', title: 'Build a product template', type: 'VIDEO', durationSeconds: 480, summary: 'Compose a formulation, packaging, and label phrases creators can customize.', bodyMdx: 'Your template is the creator’s starting point. The submit-for-review gate blocks restricted categories before they reach the marketplace.' },
      { slug: 'accept-and-dispatch-an-order', title: 'Accept & dispatch an order', type: 'VIDEO', durationSeconds: 360, summary: 'Take a production order and move it through your dispatch queue.', bodyMdx: 'Orders arrive pre-routed to your service. Accept, produce, and mark dispatched to keep the workflow moving.' },
      { slug: 'updates-partner-track', title: 'What changed: partner ops updates', type: 'ARTICLE', summary: 'Dated notes on changes to onboarding, catalog, and order ops.', bodyMdx: '## Partner ops updates\n\nThis feed tracks changes to partner onboarding, the catalog builder, and order ops.' },
    ],
  },
]

async function seedCategories(prisma: PrismaClient, audience: Audience, defs: CategoryDef[]) {
  for (const c of defs) {
    await prisma.academyCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, iconKey: c.iconKey, order: c.order, audience, status: 'PUBLISHED' },
      create: { slug: c.slug, name: c.name, description: c.description, iconKey: c.iconKey, order: c.order, audience, status: 'PUBLISHED' },
    })
  }
}

async function seedCourses(prisma: PrismaClient, audience: Audience, defs: CourseDef[], now: Date) {
  for (const [i, def] of defs.entries()) {
    const category = await prisma.academyCategory.findUnique({ where: { slug: def.categorySlug }, select: { id: true } })
    const course = await prisma.academyCourse.upsert({
      where: { audience_slug: { audience, slug: def.slug } },
      update: {
        title: def.title, subtitle: def.subtitle, summary: def.summary, level: def.level,
        categoryId: category?.id ?? null, estimatedMinutes: def.estimatedMinutes, tags: def.tags,
        status: 'PUBLISHED', publishedAt: now, order: i,
      },
      create: {
        slug: def.slug, audience, title: def.title, subtitle: def.subtitle, summary: def.summary,
        level: def.level, categoryId: category?.id ?? null, estimatedMinutes: def.estimatedMinutes,
        tags: def.tags, status: 'PUBLISHED', publishedAt: now, order: i,
      },
    })

    for (const [j, l] of def.lessons.entries()) {
      await prisma.academyLesson.upsert({
        where: { courseId_slug: { courseId: course.id, slug: l.slug } },
        update: {
          title: l.title, type: l.type, summary: l.summary, bodyMdx: l.bodyMdx ?? null,
          durationSeconds: l.durationSeconds ?? null,
          videoProvider: l.type === 'VIDEO' ? 'MUX' : null,
          status: 'PUBLISHED', publishedAt: now, order: j,
        },
        create: {
          courseId: course.id, slug: l.slug, title: l.title, type: l.type, summary: l.summary,
          bodyMdx: l.bodyMdx ?? null, durationSeconds: l.durationSeconds ?? null,
          videoProvider: l.type === 'VIDEO' ? 'MUX' : null,
          status: 'PUBLISHED', publishedAt: now, order: j,
        },
      })
    }
  }
}

export async function seedAcademy(prisma: PrismaClient) {
  console.log('Seeding iLaunchify Academy (flagship courses + topics)...')
  const now = new Date()

  await seedCategories(prisma, 'CREATOR', CREATOR_CATEGORIES)
  await seedCategories(prisma, 'PARTNER', PARTNER_CATEGORIES)
  await seedCourses(prisma, 'CREATOR', CREATOR_COURSES, now)
  await seedCourses(prisma, 'PARTNER', PARTNER_COURSES, now)

  const [cats, courses, lessons] = await Promise.all([
    prisma.academyCategory.count(),
    prisma.academyCourse.count(),
    prisma.academyLesson.count(),
  ])
  console.log(`  ✓ Academy: ${cats} categories, ${courses} courses, ${lessons} lessons.`)
}
