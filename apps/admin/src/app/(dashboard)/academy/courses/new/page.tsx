// Admin Academy — new course (ACADEMY_SPEC §8). Pick the audience + title; the
// course is created in DRAFT and you land in the editor to fill the rest.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireRole } from '@ilaunchify/auth'
import { NewCourseForm } from './NewCourseForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New course — Academy' }

export default async function NewCoursePage() {
  await requireRole('ADMIN')
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
        <Link href="/academy/courses" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:rounded">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to courses
        </Link>
        <h1 className="mt-3 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">New course</h1>
        <p className="mt-1 max-w-xl text-[13px] text-ink-600">Choose which academy this belongs to and give it a working title. It starts as a draft — you can fill in the rest next.</p>
      </div>
      <NewCourseForm />
    </div>
  )
}
