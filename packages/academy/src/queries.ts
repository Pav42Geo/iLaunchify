// @ilaunchify/academy — public read queries (ACADEMY_SPEC §10, §11).
//
// Every query is scoped by `audience` and (for public surfaces) restricted to
// PUBLISHED content. The marketing app's two academy trees call these; the admin
// CMS uses its own status-agnostic queries. Server-side only.

import { prisma } from '@ilaunchify/db'
import type { AcademyAudience, AcademyLevel } from '@ilaunchify/db'

const PUBLISHED = 'PUBLISHED' as const

export interface CourseListFilters {
  audience: AcademyAudience
  categorySlug?: string
  level?: AcademyLevel
  q?: string
}

/** Published courses for an audience, optionally filtered by topic/level/search. */
export async function getPublishedCourses(filters: CourseListFilters) {
  const { audience, categorySlug, level, q } = filters
  return prisma.academyCourse.findMany({
    where: {
      audience,
      status: PUBLISHED,
      ...(level ? { level } : {}),
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      ...(q ? textSearch(q) : {}),
    },
    orderBy: [{ order: 'asc' }, { publishedAt: 'desc' }],
    include: { category: { select: { slug: true, name: true } } },
  })
}

/** Published categories (topic grid), in display order. */
export async function getTopics(audience: AcademyAudience) {
  return prisma.academyCategory.findMany({
    where: { audience, status: PUBLISHED },
    orderBy: { order: 'asc' },
  })
}

/** A single published course + its published lessons (curriculum), by slug. */
export async function getCourseBySlug(audience: AcademyAudience, slug: string) {
  return prisma.academyCourse.findFirst({
    where: { audience, slug, status: PUBLISHED },
    include: {
      category: { select: { slug: true, name: true } },
      lessons: {
        where: { status: PUBLISHED },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          slug: true,
          title: true,
          type: true,
          summary: true,
          durationSeconds: true,
          order: true,
        },
      },
    },
  })
}

/** A single published lesson within a published course (the lesson player). */
export async function getLessonBySlug(
  audience: AcademyAudience,
  courseSlug: string,
  lessonSlug: string,
) {
  const course = await prisma.academyCourse.findFirst({
    where: { audience, slug: courseSlug, status: PUBLISHED },
    select: { id: true, slug: true, title: true, audience: true },
  })
  if (!course) return null

  const lesson = await prisma.academyLesson.findFirst({
    where: { courseId: course.id, slug: lessonSlug, status: PUBLISHED },
  })
  if (!lesson) return null

  // Sibling lessons drive prev/next + the curriculum rail.
  const siblings = await prisma.academyLesson.findMany({
    where: { courseId: course.id, status: PUBLISHED },
    orderBy: { order: 'asc' },
    select: { id: true, slug: true, title: true, type: true, durationSeconds: true, order: true },
  })
  const index = siblings.findIndex((l) => l.id === lesson.id)

  return {
    course,
    lesson,
    siblings,
    prev: index > 0 ? siblings[index - 1] ?? null : null,
    next: index >= 0 && index < siblings.length - 1 ? siblings[index + 1] ?? null : null,
  }
}

/** The dated updates/policies feed — published ARTICLE lessons, newest first. */
export async function getUpdatesFeed(audience: AcademyAudience) {
  return prisma.academyLesson.findMany({
    where: {
      type: 'ARTICLE',
      status: PUBLISHED,
      course: { audience, status: PUBLISHED },
    },
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    include: { course: { select: { slug: true, title: true, audience: true } } },
  })
}

/** The single featured course for an academy home (lowest order wins). */
export async function getFeatured(audience: AcademyAudience) {
  return prisma.academyCourse.findFirst({
    where: { audience, status: PUBLISHED },
    orderBy: [{ order: 'asc' }, { publishedAt: 'desc' }],
    include: { category: { select: { slug: true, name: true } } },
  })
}

/** Server-side search over published courses (title/summary/tags/level). */
export async function searchAcademy(audience: AcademyAudience, q: string) {
  const term = q.trim()
  if (!term) return []
  return prisma.academyCourse.findMany({
    where: { audience, status: PUBLISHED, ...textSearch(term) },
    orderBy: [{ order: 'asc' }, { publishedAt: 'desc' }],
    include: { category: { select: { slug: true, name: true } } },
    take: 50,
  })
}

/** Case-insensitive OR across the course's searchable fields + exact tag match. */
function textSearch(q: string) {
  const term = q.trim()
  return {
    OR: [
      { title: { contains: term, mode: 'insensitive' as const } },
      { subtitle: { contains: term, mode: 'insensitive' as const } },
      { summary: { contains: term, mode: 'insensitive' as const } },
      { tags: { has: term.toLowerCase() } },
    ],
  }
}
