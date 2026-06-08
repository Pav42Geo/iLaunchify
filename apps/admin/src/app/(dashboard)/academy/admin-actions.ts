'use server'

// Admin Academy CMS mutations (ACADEMY_SPEC §8). Every write is admin-scoped
// (requireRole), audited (logAuditAs), and status changes go through the
// @ilaunchify/academy FSM (never inline status writes). Content saves use
// descriptive audit action strings; the lifecycle uses ACADEMY_STATUS_CHANGE.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { transitionAcademyStatus, isReservedAcademySlug } from '@ilaunchify/academy'
import { revalidatePath } from 'next/cache'
import type {
  AcademyStatus,
  AcademyLevel,
  AcademyLessonType,
  AcademyVideoProvider,
  AcademyAudience,
} from '@ilaunchify/db'

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** A slug unique within (audience) for courses, avoiding reserved segments. */
async function uniqueCourseSlug(audience: AcademyAudience, base: string): Promise<string> {
  let slug = base || 'course'
  if (isReservedAcademySlug(slug)) slug = `${slug}-course`
  let n = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await prisma.academyCourse.findFirst({ where: { audience, slug }, select: { id: true } })
    if (!exists) return slug
    n += 1
    slug = `${base}-${n}`
  }
}

async function uniqueLessonSlug(courseId: string, base: string): Promise<string> {
  let slug = base || 'lesson'
  let n = 1
  while (true) {
    const exists = await prisma.academyLesson.findFirst({ where: { courseId, slug }, select: { id: true } })
    if (!exists) return slug
    n += 1
    slug = `${base}-${n}`
  }
}

// — COURSES ———————————————————————————————————————————————————————————————————
export async function createCourse(input: {
  audience: AcademyAudience
  title: string
}): Promise<Result<{ id: string }>> {
  const admin = await requireRole('ADMIN')
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'Title is required.' }

  const slug = await uniqueCourseSlug(input.audience, slugify(title))
  const course = await prisma.academyCourse.create({
    data: {
      audience: input.audience,
      title,
      slug,
      summary: '',
      status: 'DRAFT',
      createdById: admin.id,
      updatedById: admin.id,
    },
    select: { id: true },
  })
  await logAuditAs(admin, {
    entityType: 'AcademyCourse',
    entityId: course.id,
    action: 'ACADEMY_COURSE_CREATE',
    toValue: 'DRAFT',
    payload: { audience: input.audience, title, slug },
  })
  revalidatePath('/academy/courses')
  return { ok: true, data: { id: course.id } }
}

export async function saveCourse(input: {
  id: string
  title: string
  subtitle: string
  summary: string
  level: AcademyLevel
  categoryId: string | null
  heroImageUrl: string | null
  estimatedMinutes: number | null
  metaTitle: string | null
  metaDescription: string | null
  ogImageUrl: string | null
  tags: string[]
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'Title is required.' }
  if (!input.summary.trim()) return { ok: false, error: 'Summary is required.' }

  await prisma.academyCourse.update({
    where: { id: input.id },
    data: {
      title,
      subtitle: input.subtitle.trim() || null,
      summary: input.summary.trim(),
      level: input.level,
      categoryId: input.categoryId,
      heroImageUrl: input.heroImageUrl?.trim() || null,
      estimatedMinutes: input.estimatedMinutes,
      metaTitle: input.metaTitle?.trim() || null,
      metaDescription: input.metaDescription?.trim() || null,
      ogImageUrl: input.ogImageUrl?.trim() || null,
      tags: input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12),
      updatedById: admin.id,
    },
  })
  await logAuditAs(admin, {
    entityType: 'AcademyCourse',
    entityId: input.id,
    action: 'ACADEMY_COURSE_UPDATE',
    payload: { title },
  })
  revalidatePath(`/academy/courses/${input.id}/edit`)
  revalidatePath('/academy/courses')
  return { ok: true, data: undefined }
}

export async function setCourseStatus(input: { id: string; to: AcademyStatus }): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const res = await transitionAcademyStatus({ entity: 'course', id: input.id, to: input.to, actor: admin })
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath(`/academy/courses/${input.id}/edit`)
  revalidatePath('/academy/courses')
  revalidatePath('/academy')
  return { ok: true, data: undefined }
}

export async function addLesson(input: {
  courseId: string
  title: string
  type: AcademyLessonType
}): Promise<Result<{ id: string }>> {
  const admin = await requireRole('ADMIN')
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'Lesson title is required.' }

  const slug = await uniqueLessonSlug(input.courseId, slugify(title))
  const max = await prisma.academyLesson.aggregate({ where: { courseId: input.courseId }, _max: { order: true } })
  const lesson = await prisma.academyLesson.create({
    data: {
      courseId: input.courseId,
      title,
      slug,
      type: input.type,
      status: 'DRAFT',
      order: (max._max.order ?? -1) + 1,
      videoProvider: input.type === 'VIDEO' ? 'MUX' : null,
    },
    select: { id: true },
  })
  await logAuditAs(admin, {
    entityType: 'AcademyLesson',
    entityId: lesson.id,
    action: 'ACADEMY_LESSON_CREATE',
    toValue: 'DRAFT',
    payload: { courseId: input.courseId, title, type: input.type },
  })
  revalidatePath(`/academy/courses/${input.courseId}/edit`)
  return { ok: true, data: { id: lesson.id } }
}

export async function reorderLessons(input: { courseId: string; orderedIds: string[] }): Promise<Result> {
  const admin = await requireRole('ADMIN')
  await prisma.$transaction(
    input.orderedIds.map((id, i) =>
      prisma.academyLesson.update({ where: { id }, data: { order: i } }),
    ),
  )
  await logAuditAs(admin, {
    entityType: 'AcademyCourse',
    entityId: input.courseId,
    action: 'ACADEMY_LESSON_REORDER',
    payload: { count: input.orderedIds.length },
  })
  revalidatePath(`/academy/courses/${input.courseId}/edit`)
  return { ok: true, data: undefined }
}

// — LESSONS ———————————————————————————————————————————————————————————————————
export async function saveLesson(input: {
  id: string
  title: string
  type: AcademyLessonType
  summary: string | null
  bodyMdx: string | null
  durationSeconds: number | null
  videoProvider: AcademyVideoProvider | null
  videoAssetId: string | null
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'Title is required.' }

  await prisma.academyLesson.update({
    where: { id: input.id },
    data: {
      title,
      type: input.type,
      summary: input.summary?.trim() || null,
      bodyMdx: input.bodyMdx?.trim() || null,
      durationSeconds: input.durationSeconds,
      // Video fields only apply to VIDEO lessons.
      videoProvider: input.type === 'VIDEO' ? (input.videoProvider ?? 'MUX') : null,
      videoAssetId: input.type === 'VIDEO' ? input.videoAssetId?.trim() || null : null,
    },
  })
  await logAuditAs(admin, {
    entityType: 'AcademyLesson',
    entityId: input.id,
    action: 'ACADEMY_LESSON_UPDATE',
    payload: { title, type: input.type },
  })
  revalidatePath(`/academy/lessons/${input.id}/edit`)
  return { ok: true, data: undefined }
}

export async function setLessonStatus(input: { id: string; to: AcademyStatus }): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const res = await transitionAcademyStatus({ entity: 'lesson', id: input.id, to: input.to, actor: admin })
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath(`/academy/lessons/${input.id}/edit`)
  return { ok: true, data: undefined }
}
