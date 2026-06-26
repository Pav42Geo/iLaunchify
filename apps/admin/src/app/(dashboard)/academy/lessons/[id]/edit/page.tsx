// Admin Academy — lesson editor (ACADEMY_SPEC §8). Type (VIDEO/ARTICLE), video
// source, MDX body/transcript, duration, summary + the publish FSM control.

import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { AUDIENCE_LABEL } from '../../../academy-data'
import { StatusControl } from '../../../StatusControl'
import { LessonEditor } from './LessonEditor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit lesson — Academy' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditLessonPage({ params }: PageProps) {
  await requireRole('ADMIN')
  const { id } = await params

  const lesson = await prisma.academyLesson.findUnique({
    where: { id },
    include: { course: { select: { id: true, title: true, audience: true } } },
  })
  if (!lesson) notFound()

  return (
    <div className="space-y-6">
      <AdminDetailHeader
        backHref={`/academy/courses/${lesson.course.id}/edit`}
        backLabel={lesson.course.title}
        eyebrow={`${AUDIENCE_LABEL[lesson.course.audience]} Academy · Lesson`}
        title={lesson.title}
        meta={<span className="font-mono text-[11.5px] text-ink-500">slug {lesson.slug}</span>}
        status={<StatusControl entity="lesson" id={lesson.id} status={lesson.status} />}
      />

      <LessonEditor
        lesson={{
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          summary: lesson.summary ?? '',
          bodyMdx: lesson.bodyMdx ?? '',
          durationSeconds: lesson.durationSeconds,
          videoProvider: lesson.videoProvider,
          videoAssetId: lesson.videoAssetId ?? '',
        }}
      />
    </div>
  )
}
