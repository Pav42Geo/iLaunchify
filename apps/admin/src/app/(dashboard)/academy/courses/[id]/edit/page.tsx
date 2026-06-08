// Admin Academy — course editor (ACADEMY_SPEC §8). Metadata + SEO + hero + level
// + category, the lesson list (reorder + quick-add), and the publish FSM control.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { AUDIENCE_LABEL } from '../../../academy-data'
import { StatusControl } from '../../../StatusControl'
import { CourseEditor } from './CourseEditor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit course — Academy' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditCoursePage({ params }: PageProps) {
  await requireRole('ADMIN')
  const { id } = await params

  const course = await prisma.academyCourse.findUnique({
    where: { id },
    include: {
      lessons: {
        orderBy: { order: 'asc' },
        select: { id: true, title: true, slug: true, type: true, status: true, durationSeconds: true, order: true },
      },
    },
  })
  if (!course) notFound()

  const categories = await prisma.academyCategory.findMany({
    where: { audience: course.audience },
    orderBy: { order: 'asc' },
    select: { id: true, name: true },
  })

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <Link href="/academy/courses" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:rounded">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to courses
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              {AUDIENCE_LABEL[course.audience]} Academy · Course
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">{course.title}</h1>
            <p className="mt-1 font-mono text-[11.5px] text-ink-500">slug {course.slug}</p>
          </div>
          <StatusControl entity="course" id={course.id} status={course.status} />
        </div>
      </div>

      <CourseEditor
        course={{
          id: course.id,
          title: course.title,
          subtitle: course.subtitle ?? '',
          summary: course.summary,
          level: course.level,
          categoryId: course.categoryId,
          heroImageUrl: course.heroImageUrl ?? '',
          estimatedMinutes: course.estimatedMinutes,
          metaTitle: course.metaTitle ?? '',
          metaDescription: course.metaDescription ?? '',
          ogImageUrl: course.ogImageUrl ?? '',
          tags: course.tags,
        }}
        categories={categories}
        lessons={course.lessons}
      />
    </div>
  )
}
