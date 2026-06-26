// Admin Academy — new course (ACADEMY_SPEC §8). Pick the audience + title; the
// course is created in DRAFT and you land in the editor to fill the rest.

import { requireRole } from '@ilaunchify/auth'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { NewCourseForm } from './NewCourseForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New course — Academy' }

export default async function NewCoursePage() {
  await requireRole('ADMIN')
  return (
    <div className="space-y-6">
      <AdminDetailHeader
        backHref="/academy/courses"
        backLabel="Back to courses"
        title="New course"
      />
      <p className="max-w-xl text-[13px] text-ink-600">Choose which academy this belongs to and give it a working title. It starts as a draft — you can fill in the rest next.</p>
      <NewCourseForm />
    </div>
  )
}
