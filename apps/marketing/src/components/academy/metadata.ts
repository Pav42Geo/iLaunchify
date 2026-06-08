// Per-page metadata for the public Academy (ACADEMY_SPEC §6 SEO). Published
// content is index,follow; the search page is noindex. Course/lesson pull the
// CMS-authored metaTitle / metaDescription / ogImage. notFound pages (unpublished)
// never render, so robots default to index for the pages that do.

import type { Metadata } from 'next'
import { getCourseBySlug, getLessonBySlug, getTopics, courseHref, lessonHref, type AcademyAudience } from '@ilaunchify/academy'

const SITE = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3010'
const BRAND = 'iLaunchify Academy'

function audienceLabel(a: AcademyAudience) {
  return a === 'PARTNER' ? 'Partner' : 'Creator'
}

export function homeMetadata(audience: AcademyAudience): Metadata {
  const title = `${BRAND} — ${audienceLabel(audience)}`
  const description =
    audience === 'PARTNER'
      ? 'Learn to get verified, build your catalog, and take production orders on iLaunchify.'
      : 'Learn to design, customize, and launch your CPG product on iLaunchify — from idea to first run.'
  return { title, description, openGraph: { title, description } }
}

export async function courseMetadata(audience: AcademyAudience, slug: string): Promise<Metadata> {
  const course = await getCourseBySlug(audience, slug)
  if (!course) return { title: BRAND, robots: { index: false, follow: true } }
  const title = course.metaTitle?.trim() || `${course.title} — ${BRAND}`
  const description = course.metaDescription?.trim() || course.summary
  const url = `${SITE}${courseHref(audience, slug)}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: course.ogImageUrl ? [course.ogImageUrl] : undefined },
  }
}

export async function lessonMetadata(audience: AcademyAudience, courseSlug: string, lessonSlug: string): Promise<Metadata> {
  const data = await getLessonBySlug(audience, courseSlug, lessonSlug)
  if (!data) return { title: BRAND, robots: { index: false, follow: true } }
  const title = `${data.lesson.title} — ${data.course.title}`
  const description = data.lesson.summary?.trim() || `${data.lesson.title}, part of ${data.course.title}.`
  const url = `${SITE}${lessonHref(audience, courseSlug, lessonSlug)}`
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } }
}

export async function topicMetadata(audience: AcademyAudience, topicSlug: string): Promise<Metadata> {
  const topics = await getTopics(audience)
  const topic = topics.find((t) => t.slug === topicSlug)
  if (!topic) return { title: BRAND, robots: { index: false, follow: true } }
  const title = `${topic.name} — ${BRAND}`
  const description = topic.description ?? `${topic.name} courses on ${BRAND}.`
  return { title, description, openGraph: { title, description } }
}

export function updatesMetadata(audience: AcademyAudience): Metadata {
  const title = `Updates & policies — ${BRAND}`
  const description = `Dated notes on feature and policy changes for ${audienceLabel(audience).toLowerCase()}s on iLaunchify.`
  return { title, description, openGraph: { title, description } }
}

export function searchMetadata(): Metadata {
  // Search result pages should not be indexed.
  return { title: `Search — ${BRAND}`, robots: { index: false, follow: true } }
}
