// Admin Academy — course editor (ACADEMY_SPEC §8). Metadata + SEO + hero + level
// + category, the lesson list (reorder + quick-add), and the publish FSM control.

import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
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
      <AdminDetailHeader
        backHref="/academy/courses"
        backLabel="Back to courses"
        eyebrow={`${AUDIENCE_LABEL[course.audience]} Academy · Course`}
        title={course.title}
        meta={<span className="font-mono text-[11.5px] text-ink-500">slug {course.slug}</span>}
        status={<StatusControl entity="course" id={course.id} status={course.status} />}
      />

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
