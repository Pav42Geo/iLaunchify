// Admin Academy — lesson editor (ACADEMY_SPEC §8). Type (VIDEO/ARTICLE), video
// source, MDX body/transcript, duration, summary + the publish FSM control.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
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
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <Link href={`/academy/courses/${lesson.course.id}/edit`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:rounded">
          <ArrowLeft className="h-3.5 w-3.5" /> {lesson.course.title}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              {AUDIENCE_LABEL[lesson.course.audience]} Academy · Lesson
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">{lesson.title}</h1>
            <p className="mt-1 font-mono text-[11.5px] text-ink-500">slug {lesson.slug}</p>
          </div>
          <StatusControl entity="lesson" id={lesson.id} status={lesson.status} />
        </div>
      </div>

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
