// Admin Academy CMS — data loaders + filter parsing for the v2 list surfaces
// (ACADEMY_SPEC §8). Status-agnostic (admin sees every status); the public
// marketing trees use @ilaunchify/academy's PUBLISHED-only queries instead.

import { prisma } from '@ilaunchify/db'
import type {
  Prisma,
  AcademyAudience,
  AcademyStatus,
  AcademyLevel,
  AcademyLessonType,
} from '@ilaunchify/db'

export const ACADEMY_PAGE_SIZE = 50

export type SortDir = 'asc' | 'desc'

export const AUDIENCES = ['CREATOR', 'PARTNER'] as const
export const STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const
export const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const
export const LESSON_TYPES = ['VIDEO', 'ARTICLE', 'INTERACTIVE'] as const

export const AUDIENCE_LABEL: Record<AcademyAudience, string> = {
  CREATOR: 'Creator',
  PARTNER: 'Partner',
}

export type Tone = { bg: string; text: string; border: string; dot: string; label: string }

export const STATUS_TONE: Record<AcademyStatus, Tone> = {
  DRAFT: { bg: 'bg-zinc-50', text: 'text-zinc-700', border: 'border-zinc-200', dot: 'bg-zinc-400', label: 'Draft' },
  IN_REVIEW: { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200', dot: 'bg-amber-500', label: 'In review' },
  PUBLISHED: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Published' },
  ARCHIVED: { bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-200', dot: 'bg-rose-500', label: 'Archived' },
}

export const AUDIENCE_TONE: Record<AcademyAudience, Tone> = {
  CREATOR: { bg: 'bg-pink-50', text: 'text-pink-800', border: 'border-pink-200', dot: 'bg-pink-500', label: 'Creator' },
  PARTNER: { bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200', dot: 'bg-sky-500', label: 'Partner' },
}

export const LESSON_TYPE_TONE: Record<AcademyLessonType, Tone> = {
  VIDEO: { bg: 'bg-indigo-50', text: 'text-indigo-900', border: 'border-indigo-200', dot: 'bg-indigo-500', label: 'Video' },
  ARTICLE: { bg: 'bg-zinc-50', text: 'text-zinc-700', border: 'border-zinc-200', dot: 'bg-zinc-400', label: 'Article' },
  INTERACTIVE: { bg: 'bg-violet-50', text: 'text-violet-900', border: 'border-violet-200', dot: 'bg-violet-500', label: 'Interactive' },
}

// — parse helpers ————————————————————————————————————————————————————————————
function oneOf<T extends string>(opts: readonly T[], v: string | undefined): T | null {
  return v && (opts as readonly string[]).includes(v) ? (v as T) : null
}
function pageOf(v: string | undefined): number {
  const n = parseInt(v ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}
function dirOf(v: string | undefined): SortDir {
  return v === 'asc' ? 'asc' : 'desc'
}

/** Build a querystring href from a base path + a flat params object (empty/null dropped). */
export function buildHref(base: string, params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `${base}?${s}` : base
}

// =============================================================================
// COURSES
// =============================================================================
const COURSE_SORTS = ['title', 'level', 'status', 'updatedAt'] as const
export type CourseSort = (typeof COURSE_SORTS)[number]

export interface CoursesFilters {
  q: string
  audience: AcademyAudience | null
  status: AcademyStatus | null
  category: string | null
  level: AcademyLevel | null
  sort: CourseSort
  dir: SortDir
  page: number
}

export function parseCoursesFilters(sp: Record<string, string | undefined>): CoursesFilters {
  return {
    q: sp.q ?? '',
    audience: oneOf(AUDIENCES, sp.audience),
    status: oneOf(STATUSES, sp.status),
    category: sp.category ?? null,
    level: oneOf(LEVELS, sp.level),
    sort: oneOf(COURSE_SORTS, sp.sort) ?? 'updatedAt',
    dir: dirOf(sp.dir),
    page: pageOf(sp.page),
  }
}

export function buildCoursesHref(cur: CoursesFilters, over: Partial<CoursesFilters>): string {
  const f = { ...cur, ...over }
  return buildHref('/academy/courses', {
    q: f.q, audience: f.audience, status: f.status, category: f.category, level: f.level,
    sort: f.sort === 'updatedAt' ? '' : f.sort,
    dir: f.dir === 'desc' ? '' : f.dir,
    page: f.page > 1 ? f.page : '',
  })
}

export async function loadCoursesData(sp: Record<string, string | undefined>) {
  const filters = parseCoursesFilters(sp)
  const where: Prisma.AcademyCourseWhereInput = {}
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { slug: { contains: filters.q, mode: 'insensitive' } },
      { summary: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  if (filters.audience) where.audience = filters.audience
  if (filters.status) where.status = filters.status
  if (filters.level) where.level = filters.level
  if (filters.category) where.category = { slug: filters.category }

  const skip = (filters.page - 1) * ACADEMY_PAGE_SIZE
  const [rows, total, statusGroups, audienceGroups, categoryOptions] = await Promise.all([
    prisma.academyCourse.findMany({
      where,
      orderBy: { [filters.sort]: filters.dir },
      skip,
      take: ACADEMY_PAGE_SIZE,
      select: {
        id: true, slug: true, title: true, audience: true, level: true, status: true,
        updatedAt: true, publishedAt: true,
        category: { select: { name: true, slug: true } },
        _count: { select: { lessons: true } },
      },
    }),
    prisma.academyCourse.count({ where }),
    prisma.academyCourse.groupBy({ by: ['status'], _count: true }),
    prisma.academyCourse.groupBy({ by: ['audience'], _count: true }),
    prisma.academyCategory.findMany({ orderBy: { order: 'asc' }, select: { slug: true, name: true, audience: true } }),
  ])

  const statusCounts = countMap(statusGroups, 'status')
  const audienceCounts = countMap(audienceGroups, 'audience')

  return {
    filters,
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / ACADEMY_PAGE_SIZE)),
    statusCounts,
    audienceCounts,
    categoryOptions,
  }
}

// =============================================================================
// LESSONS (flat, across both academies)
// =============================================================================
const LESSON_SORTS = ['title', 'type', 'status', 'updatedAt'] as const
export type LessonSort = (typeof LESSON_SORTS)[number]

export interface LessonsFilters {
  q: string
  audience: AcademyAudience | null
  status: AcademyStatus | null
  type: AcademyLessonType | null
  sort: LessonSort
  dir: SortDir
  page: number
}

export function parseLessonsFilters(sp: Record<string, string | undefined>): LessonsFilters {
  return {
    q: sp.q ?? '',
    audience: oneOf(AUDIENCES, sp.audience),
    status: oneOf(STATUSES, sp.status),
    type: oneOf(LESSON_TYPES, sp.type),
    sort: oneOf(LESSON_SORTS, sp.sort) ?? 'updatedAt',
    dir: dirOf(sp.dir),
    page: pageOf(sp.page),
  }
}

export function buildLessonsHref(cur: LessonsFilters, over: Partial<LessonsFilters>): string {
  const f = { ...cur, ...over }
  return buildHref('/academy/lessons', {
    q: f.q, audience: f.audience, status: f.status, type: f.type,
    sort: f.sort === 'updatedAt' ? '' : f.sort,
    dir: f.dir === 'desc' ? '' : f.dir,
    page: f.page > 1 ? f.page : '',
  })
}

export async function loadLessonsData(sp: Record<string, string | undefined>) {
  const filters = parseLessonsFilters(sp)
  const where: Prisma.AcademyLessonWhereInput = {}
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { slug: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  if (filters.status) where.status = filters.status
  if (filters.type) where.type = filters.type
  if (filters.audience) where.course = { audience: filters.audience }

  const skip = (filters.page - 1) * ACADEMY_PAGE_SIZE
  const [rows, total, statusGroups, typeGroups] = await Promise.all([
    prisma.academyLesson.findMany({
      where,
      orderBy: { [filters.sort]: filters.dir },
      skip,
      take: ACADEMY_PAGE_SIZE,
      select: {
        id: true, slug: true, title: true, type: true, status: true, durationSeconds: true, updatedAt: true,
        course: { select: { id: true, title: true, slug: true, audience: true } },
      },
    }),
    prisma.academyLesson.count({ where }),
    prisma.academyLesson.groupBy({ by: ['status'], _count: true }),
    prisma.academyLesson.groupBy({ by: ['type'], _count: true }),
  ])

  return {
    filters,
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / ACADEMY_PAGE_SIZE)),
    statusCounts: countMap(statusGroups, 'status'),
    typeCounts: countMap(typeGroups, 'type'),
  }
}

// =============================================================================
// CATEGORIES (topic taxonomy)
// =============================================================================
const CATEGORY_SORTS = ['name', 'order', 'status', 'updatedAt'] as const
export type CategorySort = (typeof CATEGORY_SORTS)[number]

export interface CategoriesFilters {
  q: string
  audience: AcademyAudience | null
  status: AcademyStatus | null
  sort: CategorySort
  dir: SortDir
  page: number
}

export function parseCategoriesFilters(sp: Record<string, string | undefined>): CategoriesFilters {
  return {
    q: sp.q ?? '',
    audience: oneOf(AUDIENCES, sp.audience),
    status: oneOf(STATUSES, sp.status),
    sort: oneOf(CATEGORY_SORTS, sp.sort) ?? 'order',
    dir: dirOf(sp.dir),
    page: pageOf(sp.page),
  }
}

export function buildCategoriesHref(cur: CategoriesFilters, over: Partial<CategoriesFilters>): string {
  const f = { ...cur, ...over }
  return buildHref('/academy/categories', {
    q: f.q, audience: f.audience, status: f.status,
    sort: f.sort === 'order' ? '' : f.sort,
    dir: f.dir === 'desc' ? '' : f.dir,
    page: f.page > 1 ? f.page : '',
  })
}

export async function loadCategoriesData(sp: Record<string, string | undefined>) {
  const filters = parseCategoriesFilters(sp)
  const where: Prisma.AcademyCategoryWhereInput = {}
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { slug: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  if (filters.audience) where.audience = filters.audience
  if (filters.status) where.status = filters.status

  const skip = (filters.page - 1) * ACADEMY_PAGE_SIZE
  const [rows, total, statusGroups, audienceGroups] = await Promise.all([
    prisma.academyCategory.findMany({
      where,
      orderBy: filters.sort === 'order' ? [{ audience: 'asc' }, { order: filters.dir }] : { [filters.sort]: filters.dir },
      skip,
      take: ACADEMY_PAGE_SIZE,
      select: {
        id: true, slug: true, name: true, audience: true, status: true, order: true, updatedAt: true,
        _count: { select: { courses: true } },
      },
    }),
    prisma.academyCategory.count({ where }),
    prisma.academyCategory.groupBy({ by: ['status'], _count: true }),
    prisma.academyCategory.groupBy({ by: ['audience'], _count: true }),
  ])

  return {
    filters,
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / ACADEMY_PAGE_SIZE)),
    statusCounts: countMap(statusGroups, 'status'),
    audienceCounts: countMap(audienceGroups, 'audience'),
  }
}

// =============================================================================
// OVERVIEW (KPIs split by audience)
// =============================================================================
export async function loadAcademyOverview() {
  const [courseGroups, lessonTotal, lessonPublished] = await Promise.all([
    prisma.academyCourse.groupBy({ by: ['audience', 'status'], _count: true }),
    prisma.academyLesson.count(),
    prisma.academyLesson.count({ where: { status: 'PUBLISHED' } }),
  ])

  const blank = () => ({ DRAFT: 0, IN_REVIEW: 0, PUBLISHED: 0, ARCHIVED: 0, total: 0 })
  const byAudience: Record<AcademyAudience, ReturnType<typeof blank>> = {
    CREATOR: blank(),
    PARTNER: blank(),
  }
  for (const g of courseGroups) {
    const bucket = byAudience[g.audience]
    bucket[g.status] += g._count
    bucket.total += g._count
  }

  return {
    byAudience,
    totals: {
      courses: byAudience.CREATOR.total + byAudience.PARTNER.total,
      published: byAudience.CREATOR.PUBLISHED + byAudience.PARTNER.PUBLISHED,
      inReview: byAudience.CREATOR.IN_REVIEW + byAudience.PARTNER.IN_REVIEW,
      drafts: byAudience.CREATOR.DRAFT + byAudience.PARTNER.DRAFT,
      lessons: lessonTotal,
      lessonsPublished: lessonPublished,
    },
  }
}

// — helpers ———————————————————————————————————————————————————————————————————
function countMap<K extends string>(
  groups: Array<{ _count: number } & Record<K, string>>,
  key: K,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const g of groups) out[g[key]] = g._count
  return out
}
