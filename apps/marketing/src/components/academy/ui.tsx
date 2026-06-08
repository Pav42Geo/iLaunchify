// Shared public-Academy components (ACADEMY_SPEC §5, §7). One audience-driven set
// renders both trees — Creator (/academy, white hero, pink accent) and Partner
// (/business/academy, dark ink-900 hero, neon-green accent). Server components;
// search is a plain GET form. Neon theme tokens throughout.

import Link from 'next/link'
import { PlayCircle, FileText, Clock, ArrowRight, Search, GraduationCap, Sparkles } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import {
  academyBasePath,
  courseHref,
  lessonHref,
  topicHref,
  updatesHref,
  searchHref,
  formatDuration,
  type AcademyAudience,
} from '@ilaunchify/academy'

// — theme ————————————————————————————————————————————————————————————————————
export function isPartner(a: AcademyAudience) {
  return a === 'PARTNER'
}

const LEVEL_LABEL: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' }

interface CourseLike {
  slug: string
  title: string
  subtitle?: string | null
  summary: string
  level: string
  estimatedMinutes?: number | null
  category?: { slug: string; name: string } | null
}

// — Home hero (search + trending) ————————————————————————————————————————————
export function AcademyHero({
  audience,
  title,
  accentWord,
  subtitle,
  trending,
}: {
  audience: AcademyAudience
  title: string
  accentWord: string
  subtitle: string
  trending: string[]
}) {
  const partner = isPartner(audience)
  return (
    <section className={cn('border-b', partner ? 'bg-ink-900 text-white border-ink-700' : 'bg-white text-ink-900 border-ink-100')}>
      <div className="mx-auto max-w-[1100px] px-6 py-16 text-center sm:py-20">
        {partner && (
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neon-500">
            <GraduationCap className="h-3.5 w-3.5" /> Partner Academy
          </span>
        )}
        <h1 className="mx-auto max-w-3xl font-display text-[34px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[46px]">
          {title} <span className={partner ? 'text-neon-500' : 'text-pink-600'}>{accentWord}</span>
        </h1>
        <p className={cn('mx-auto mt-4 max-w-xl text-[15px] leading-relaxed', partner ? 'text-ink-300' : 'text-ink-600')}>
          {subtitle}
        </p>

        {/* One big search */}
        <form method="GET" action={searchHref(audience)} className="mx-auto mt-7 flex max-w-xl items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              name="q"
              placeholder="What do you want to learn?"
              aria-label="Search the academy"
              className={cn(
                'h-12 w-full rounded-full border pl-11 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-pink-400',
                partner ? 'border-ink-700 bg-ink-800 text-white placeholder:text-ink-400' : 'border-ink-200 bg-white text-ink-900 placeholder:text-ink-400',
              )}
            />
          </div>
          <button
            type="submit"
            className={cn(
              'inline-flex h-12 items-center rounded-full px-6 text-[13px] font-semibold transition-colors',
              partner ? 'bg-white text-ink-900 hover:bg-ink-100' : 'bg-ink-900 text-white hover:bg-ink-800',
            )}
          >
            Search
          </button>
        </form>

        {trending.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className={cn('text-[11px] uppercase tracking-[0.1em]', partner ? 'text-ink-400' : 'text-ink-400')}>Trending</span>
            {trending.map((t) => (
              <Link
                key={t}
                href={searchHref(audience, t)}
                className={cn(
                  'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                  partner ? 'border-ink-700 text-ink-200 hover:border-neon-500 hover:text-neon-500' : 'border-ink-200 text-ink-700 hover:border-pink-400 hover:text-pink-700',
                )}
              >
                {t}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// — Section heading ———————————————————————————————————————————————————————————
export function SectionHead({ eyebrow, title, href, linkLabel }: { eyebrow?: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">{eyebrow}</p>}
        <h2 className="mt-1 font-display text-[22px] font-bold tracking-[-0.02em] text-ink-900">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-pink-700 hover:text-pink-800">
          {linkLabel ?? 'See all'} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}

// — Topic grid ————————————————————————————————————————————————————————————————
export function TopicGrid({ audience, topics }: { audience: AcademyAudience; topics: Array<{ slug: string; name: string; description?: string | null }> }) {
  if (topics.length === 0) return null
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {topics.map((t) => (
        <Link
          key={t.slug}
          href={topicHref(audience, t.slug)}
          className="group rounded-2xl border border-ink-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)]"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
              <Sparkles className="h-[18px] w-[18px]" />
            </span>
            <ArrowRight className="h-4 w-4 text-ink-300 transition-colors group-hover:text-pink-600" />
          </div>
          <h3 className="mt-3 font-display text-[15px] font-bold text-ink-900">{t.name}</h3>
          {t.description && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{t.description}</p>}
        </Link>
      ))}
    </div>
  )
}

// — Course card (mp-card style) ———————————————————————————————————————————————
export function CourseCard({ audience, course, lessonCount }: { audience: AcademyAudience; course: CourseLike; lessonCount?: number }) {
  return (
    <Link
      href={courseHref(audience, course.slug)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_34px_-14px_rgba(0,0,0,0.22)]"
    >
      <div className="flex aspect-[5/3] items-center justify-center bg-gradient-to-br from-pink-50 to-ink-50">
        <GraduationCap className="h-10 w-10 text-pink-300" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {course.category && <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">{course.category.name}</p>}
        <h3 className="font-display text-[15px] font-bold leading-tight text-ink-900 group-hover:text-pink-700">{course.title}</h3>
        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-500">{course.summary}</p>
        <div className="mt-auto flex items-center gap-3 border-t border-ink-100 pt-2.5 text-[11px] text-ink-500">
          <span>{LEVEL_LABEL[course.level] ?? course.level}</span>
          {course.estimatedMinutes ? <span>· {course.estimatedMinutes} min</span> : null}
          {lessonCount != null ? <span>· {lessonCount} lesson{lessonCount === 1 ? '' : 's'}</span> : null}
        </div>
      </div>
    </Link>
  )
}

// — Featured course (wide) ————————————————————————————————————————————————————
export function FeaturedCourse({ audience, course, lessonCount }: { audience: AcademyAudience; course: CourseLike; lessonCount?: number }) {
  return (
    <Link
      href={courseHref(audience, course.slug)}
      className="group grid grid-cols-1 overflow-hidden rounded-3xl border border-ink-200 bg-white transition-all hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.25)] md:grid-cols-[1.1fr,1.4fr]"
    >
      <div className="flex min-h-[200px] items-center justify-center bg-gradient-to-br from-pink-100 via-pink-50 to-ink-50">
        <GraduationCap className="h-14 w-14 text-pink-400" />
      </div>
      <div className="flex flex-col justify-center gap-3 p-7">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-pink-700">Featured course</span>
        <h3 className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink-900">{course.title}</h3>
        {course.subtitle && <p className="text-[13px] font-medium text-ink-500">{course.subtitle}</p>}
        <p className="text-[13.5px] leading-relaxed text-ink-600">{course.summary}</p>
        <div className="mt-1 flex items-center gap-3 text-[12px] text-ink-500">
          <span>{LEVEL_LABEL[course.level] ?? course.level}</span>
          {course.estimatedMinutes ? <span>· {course.estimatedMinutes} min</span> : null}
          {lessonCount != null ? <span>· {lessonCount} lessons</span> : null}
        </div>
        <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors group-hover:bg-black">
          Start course <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  )
}

// — Updates teaser ————————————————————————————————————————————————————————————
export function UpdatesTeaser({
  audience,
  updates,
}: {
  audience: AcademyAudience
  updates: Array<{ slug: string; title: string; summary?: string | null; courseSlug: string; publishedAt?: Date | null }>
}) {
  if (updates.length === 0) return null
  return (
    <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white">
      {updates.slice(0, 4).map((u) => (
        <li key={u.slug}>
          <Link href={lessonHref(audience, u.courseSlug, u.slug)} className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-pink-50/30">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-ink-900">{u.title}</p>
              {u.summary && <p className="truncate text-[12px] text-ink-500">{u.summary}</p>}
            </div>
            {u.publishedAt && <span className="ml-auto shrink-0 text-[11px] text-ink-400">{new Date(u.publishedAt).toLocaleDateString()}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}

// — Closing CTA band ——————————————————————————————————————————————————————————
export function ClosingCta({ title, subtitle, ctaLabel, ctaHref }: { title: string; subtitle: string; ctaLabel: string; ctaHref: string }) {
  return (
    <section className="bg-ink-900 text-white">
      <div className="mx-auto max-w-[900px] px-6 py-16 text-center">
        <h2 className="font-display text-[26px] font-bold tracking-[-0.02em] sm:text-[32px]">{title}</h2>
        <p className="mx-auto mt-3 max-w-lg text-[14px] text-ink-300">{subtitle}</p>
        <a href={ctaHref} className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-[14px] font-semibold text-ink-900 transition-colors hover:bg-neon-500">
          {ctaLabel} <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  )
}

// — Breadcrumb ————————————————————————————————————————————————————————————————
export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-500">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {it.href ? <Link href={it.href} className="hover:text-pink-700">{it.label}</Link> : <span className="text-ink-700">{it.label}</span>}
          {i < items.length - 1 && <span className="text-ink-300">/</span>}
        </span>
      ))}
    </nav>
  )
}

// — Lesson list (course page) —————————————————————————————————————————————————
export function LessonList({
  audience,
  courseSlug,
  lessons,
  activeLessonSlug,
}: {
  audience: AcademyAudience
  courseSlug: string
  lessons: Array<{ slug: string; title: string; type: string; durationSeconds?: number | null }>
  activeLessonSlug?: string
}) {
  return (
    <ol className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white">
      {lessons.map((l, i) => {
        const Icon = l.type === 'VIDEO' ? PlayCircle : FileText
        const active = l.slug === activeLessonSlug
        return (
          <li key={l.slug}>
            <Link
              href={lessonHref(audience, courseSlug, l.slug)}
              className={cn('flex items-center gap-3 px-5 py-3.5 transition-colors', active ? 'bg-pink-50/60' : 'hover:bg-pink-50/30')}
            >
              <span className="w-5 shrink-0 text-center text-[12px] tabular-nums text-ink-400">{i + 1}</span>
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-pink-600' : 'text-ink-400')} />
              <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', active ? 'font-semibold text-pink-700' : 'font-medium text-ink-900')}>{l.title}</span>
              {l.durationSeconds ? (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11.5px] text-ink-400">
                  <Clock className="h-3 w-3" /> {formatDuration(l.durationSeconds)}
                </span>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
