// Public Academy page bodies (ACADEMY_SPEC §7) — one audience-driven set powers
// both the Creator (/academy) and Partner (/business/academy) trees. Each is a
// self-contained async server component: audience header + content + footer +
// JSON-LD. Reserved slugs (topics/updates/search) are static route segments, so
// they never collide with [courseSlug].

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  getTopics,
  getPublishedCourses,
  getCourseBySlug,
  getLessonBySlug,
  getUpdatesFeed,
  getFeatured,
  searchAcademy,
  academyBasePath,
  topicHref,
  courseHref,
  updatesHref,
  searchHref,
  courseStructuredData,
  videoStructuredData,
  formatDuration,
  type AcademyAudience,
} from '@ilaunchify/academy'
import { getMarketingSession, headerPropsFromSession } from '@/lib/session'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { BusinessHeader } from '@/components/BusinessHeader'
import { LandingFooter } from '@/components/LandingFooter'
import { creatorUrl, partnerUrl } from '@/lib/app-urls'
import {
  AcademyHero,
  SectionHead,
  TopicGrid,
  CourseCard,
  FeaturedCourse,
  UpdatesTeaser,
  ClosingCta,
  Breadcrumb,
  LessonList,
} from './ui'
import { VideoFrame, LessonBody, PrevNext, StructuredData } from './lesson'

const SITE = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3010'

// Audience copy + CTAs.
function copy(audience: AcademyAudience) {
  return audience === 'PARTNER'
    ? {
        title: 'Run production,',
        accent: 'the iLaunchify way.',
        subtitle: 'Get verified, build your catalog, and take orders from the creators building the next wave of CPG brands.',
        ctaTitle: 'Ready to take your first order?',
        ctaSub: 'Apply to join the production network — verification is quick and there’s no listing fee.',
        ctaLabel: 'Apply to partner',
        ctaHref: partnerUrl('/signup'),
        eyebrow: 'Partner Academy',
      }
    : {
        title: 'Launch your brand,',
        accent: 'the smart way.',
        subtitle: 'Everything you need to take a CPG product from idea to a label-ready design and your first production run.',
        ctaTitle: 'Ready to launch your first product?',
        ctaSub: 'Start free — design in the studio, and we orchestrate manufacturing, printing, and fulfillment.',
        ctaLabel: 'Start free',
        ctaHref: creatorUrl('/signup'),
        eyebrow: 'Creator Academy',
      }
}

// Resolve the audience header to a concrete element (avoids rendering an async
// component as a JSX child — marketing is on React 18 types).
async function buildHeader(audience: AcademyAudience): Promise<React.ReactElement> {
  if (audience === 'PARTNER') return <BusinessHeader placementKey="partnerAcademy" />
  const session = await getMarketingSession()
  const { user, brands, activeBrandId } = headerPropsFromSession(session)
  return <MarketplaceHeader user={user} brands={brands} activeBrandId={activeBrandId} hasUnreadNotifications={false} placementKey="creatorAcademy" />
}

function Shell({ header, children }: { header: React.ReactElement; children: React.ReactNode }) {
  return (
    <>
      {header}
      <main>{children}</main>
      <LandingFooter />
    </>
  )
}

// ── HOME ─────────────────────────────────────────────────────────────────────
export async function AcademyHomePage({ audience }: { audience: AcademyAudience }) {
  const [topics, featured, updates, courses] = await Promise.all([
    getTopics(audience),
    getFeatured(audience),
    getUpdatesFeed(audience),
    getPublishedCourses({ audience }),
  ])
  const c = copy(audience)
  const trending = topics.slice(0, 4).map((t) => t.name)
  const gridCourses = courses.filter((co) => co.slug !== featured?.slug).slice(0, 6)

  const header = await buildHeader(audience)
  return (
    <Shell header={header}>
      <AcademyHero audience={audience} title={c.title} accentWord={c.accent} subtitle={c.subtitle} trending={trending} />

      <div className="mx-auto max-w-[1100px] space-y-14 px-6 py-14">
        {topics.length > 0 && (
          <section>
            <SectionHead eyebrow="Browse by topic" title="Where do you want to start?" />
            <TopicGrid audience={audience} topics={topics} />
          </section>
        )}

        {featured && (
          <section>
            <FeaturedCourse audience={audience} course={featured} lessonCount={undefined} />
          </section>
        )}

        {gridCourses.length > 0 && (
          <section>
            <SectionHead eyebrow="Courses" title="More to explore" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gridCourses.map((co) => (
                <CourseCard key={co.slug} audience={audience} course={co} />
              ))}
            </div>
          </section>
        )}

        {updates.length > 0 && (
          <section>
            <SectionHead eyebrow="Latest" title="Updates & policies" href={updatesHref(audience)} linkLabel="All updates" />
            <UpdatesTeaser
              audience={audience}
              updates={updates.map((u) => ({ slug: u.slug, title: u.title, summary: u.summary, courseSlug: u.course.slug, publishedAt: u.publishedAt }))}
            />
          </section>
        )}
      </div>

      <ClosingCta title={c.ctaTitle} subtitle={c.ctaSub} ctaLabel={c.ctaLabel} ctaHref={c.ctaHref} />
    </Shell>
  )
}

// ── TOPIC LANDING ────────────────────────────────────────────────────────────
export async function AcademyTopicPage({ audience, topicSlug }: { audience: AcademyAudience; topicSlug: string }) {
  const [topics, courses] = await Promise.all([
    getTopics(audience),
    getPublishedCourses({ audience, categorySlug: topicSlug }),
  ])
  const topic = topics.find((t) => t.slug === topicSlug)
  if (!topic) notFound()

  const header = await buildHeader(audience)
  return (
    <Shell header={header}>
      <div className="mx-auto max-w-[1100px] px-6 py-10">
        <Breadcrumb items={[{ label: 'Academy', href: academyBasePath(audience) }, { label: topic.name }]} />
        <h1 className="mt-4 font-display text-[30px] font-bold tracking-[-0.02em] text-ink-900">{topic.name}</h1>
        {topic.description && <p className="mt-2 max-w-2xl text-[14px] text-ink-600">{topic.description}</p>}

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((co) => (
            <CourseCard key={co.slug} audience={audience} course={co} />
          ))}
        </div>
        {courses.length === 0 && <p className="mt-8 rounded-2xl border border-dashed border-ink-200 px-6 py-12 text-center text-[13px] text-ink-500">No courses in this topic yet.</p>}
      </div>
    </Shell>
  )
}

// ── COURSE ───────────────────────────────────────────────────────────────────
export async function AcademyCoursePage({ audience, courseSlug }: { audience: AcademyAudience; courseSlug: string }) {
  const course = await getCourseBySlug(audience, courseSlug)
  if (!course) notFound()
  const firstLesson = course.lessons[0]

  const header = await buildHeader(audience)
  return (
    <Shell header={header}>
      <StructuredData data={courseStructuredData({ title: course.title, summary: course.summary, url: `${SITE}${courseHref(audience, course.slug)}`, audience, heroImageUrl: course.heroImageUrl })} />
      <div className="mx-auto max-w-[820px] px-6 py-10">
        <Breadcrumb items={[{ label: 'Academy', href: academyBasePath(audience) }, ...(course.category ? [{ label: course.category.name, href: topicHref(audience, course.category.slug) }] : []), { label: course.title }]} />

        <h1 className="mt-4 font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-ink-900">{course.title}</h1>
        {course.subtitle && <p className="mt-1.5 text-[15px] font-medium text-ink-500">{course.subtitle}</p>}
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">{course.summary}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-[12.5px] text-ink-600">
          <Chip>{({ BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' } as Record<string, string>)[course.level] ?? course.level}</Chip>
          {course.estimatedMinutes ? <Chip>{course.estimatedMinutes} min</Chip> : null}
          <Chip>{course.lessons.length} lesson{course.lessons.length === 1 ? '' : 's'}</Chip>
          {firstLesson && (
            <Link href={courseHref(audience, course.slug) + '/' + firstLesson.slug} className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black">
              Start course <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <div className="mt-8">
          <h2 className="mb-3 font-display text-[16px] font-bold text-ink-900">Lessons</h2>
          <LessonList audience={audience} courseSlug={course.slug} lessons={course.lessons} />
        </div>
      </div>
    </Shell>
  )
}

// ── LESSON ───────────────────────────────────────────────────────────────────
export async function AcademyLessonPage({ audience, courseSlug, lessonSlug }: { audience: AcademyAudience; courseSlug: string; lessonSlug: string }) {
  const data = await getLessonBySlug(audience, courseSlug, lessonSlug)
  if (!data) notFound()
  const { course, lesson, siblings, prev, next } = data
  const isVideo = lesson.type === 'VIDEO'

  const header = await buildHeader(audience)
  return (
    <Shell header={header}>
      {isVideo && (
        <StructuredData
          data={videoStructuredData({
            name: lesson.title,
            description: lesson.summary ?? course.title,
            url: `${SITE}${courseHref(audience, course.slug)}/${lesson.slug}`,
            durationSeconds: lesson.durationSeconds,
            uploadDate: lesson.publishedAt ? new Date(lesson.publishedAt).toISOString() : null,
          })}
        />
      )}
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-[1fr,300px]">
        <article className="min-w-0">
          <Breadcrumb items={[{ label: 'Academy', href: academyBasePath(audience) }, { label: course.title, href: courseHref(audience, course.slug) }, { label: `Lesson ${siblings.findIndex((s) => s.slug === lesson.slug) + 1} of ${siblings.length}` }]} />

          <h1 className="mt-4 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink-900">{lesson.title}</h1>
          {lesson.summary && <p className="mt-2 text-[14px] text-ink-600">{lesson.summary}</p>}

          <div className="mt-5">
            {isVideo ? <VideoFrame provider={lesson.videoProvider} title={lesson.title} /> : null}
          </div>

          {lesson.durationSeconds && isVideo ? <p className="mt-2 text-[12px] text-ink-500">{formatDuration(lesson.durationSeconds)}</p> : null}

          <div className="mt-6">
            {isVideo && lesson.bodyMdx ? <h2 className="mb-2 font-display text-[15px] font-bold text-ink-900">Transcript</h2> : null}
            <LessonBody body={lesson.bodyMdx} />
          </div>

          <PrevNext audience={audience} courseSlug={course.slug} prev={prev} next={next} />
        </article>

        {/* Curriculum rail */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">{course.title}</p>
          <LessonList audience={audience} courseSlug={course.slug} lessons={siblings} activeLessonSlug={lesson.slug} />
        </aside>
      </div>
    </Shell>
  )
}

// ── UPDATES FEED ─────────────────────────────────────────────────────────────
export async function AcademyUpdatesPage({ audience }: { audience: AcademyAudience }) {
  const updates = await getUpdatesFeed(audience)
  const header = await buildHeader(audience)
  return (
    <Shell header={header}>
      <div className="mx-auto max-w-[820px] px-6 py-10">
        <Breadcrumb items={[{ label: 'Academy', href: academyBasePath(audience) }, { label: 'Updates' }]} />
        <h1 className="mt-4 font-display text-[30px] font-bold tracking-[-0.02em] text-ink-900">Updates &amp; policies</h1>
        <p className="mt-2 text-[14px] text-ink-600">Dated notes on feature and policy changes.</p>
        <div className="mt-8">
          {updates.length > 0 ? (
            <UpdatesTeaser audience={audience} updates={updates.map((u) => ({ slug: u.slug, title: u.title, summary: u.summary, courseSlug: u.course.slug, publishedAt: u.publishedAt }))} />
          ) : (
            <p className="rounded-2xl border border-dashed border-ink-200 px-6 py-12 text-center text-[13px] text-ink-500">No updates yet.</p>
          )}
        </div>
      </div>
    </Shell>
  )
}

// ── SEARCH ───────────────────────────────────────────────────────────────────
export async function AcademySearchPage({ audience, q }: { audience: AcademyAudience; q: string }) {
  const results = q.trim() ? await searchAcademy(audience, q) : []
  const header = await buildHeader(audience)
  return (
    <Shell header={header}>
      <div className="mx-auto max-w-[1100px] px-6 py-10">
        <Breadcrumb items={[{ label: 'Academy', href: academyBasePath(audience) }, { label: 'Search' }]} />
        <h1 className="mt-4 font-display text-[26px] font-bold tracking-[-0.02em] text-ink-900">
          {q.trim() ? <>Results for “{q.trim()}”</> : 'Search the academy'}
        </h1>

        <form method="GET" action={searchHref(audience)} className="mt-5 flex max-w-xl gap-2">
          <input type="search" name="q" defaultValue={q} placeholder="What do you want to learn?" aria-label="Search" className="h-11 flex-1 rounded-full border border-ink-200 bg-white px-5 text-[14px] outline-none focus:ring-2 focus:ring-pink-400" />
          <button type="submit" className="rounded-full bg-ink-900 px-6 text-[13px] font-semibold text-white hover:bg-ink-800">Search</button>
        </form>

        <div className="mt-8">
          {q.trim() && results.length === 0 && <p className="rounded-2xl border border-dashed border-ink-200 px-6 py-12 text-center text-[13px] text-ink-500">No courses matched “{q.trim()}”.</p>}
          {results.length > 0 && (
            <>
              <p className="mb-4 text-[12.5px] text-ink-500">{results.length} result{results.length === 1 ? '' : 's'}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((co) => (
                  <CourseCard key={co.slug} audience={audience} course={co} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-ink-200 bg-white px-3 py-1 text-[12px] font-medium text-ink-700">{children}</span>
}
