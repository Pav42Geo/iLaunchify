'use client'

// Academy FSM status control (course + lesson editors). Shows the current status
// + the valid next transitions. The allowed-transition map mirrors the
// @ilaunchify/academy FSM (the server enforces it; this only drives the buttons —
// importing the FSM directly would pull Prisma into the client bundle).

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import type { AcademyStatus } from '@ilaunchify/db'
import { setCourseStatus, setLessonStatus, setCategoryStatus } from './admin-actions'

const ALLOWED: Record<AcademyStatus, AcademyStatus[]> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
}

const LABEL: Record<AcademyStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
}

const PILL: Record<AcademyStatus, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  IN_REVIEW: 'bg-amber-50 text-amber-900 border-amber-200',
  PUBLISHED: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  ARCHIVED: 'bg-rose-50 text-rose-900 border-rose-200',
}

// Verb shown on the action button per target status.
const ACTION_LABEL: Record<AcademyStatus, string> = {
  IN_REVIEW: 'Submit for review',
  PUBLISHED: 'Publish',
  DRAFT: 'Back to draft',
  ARCHIVED: 'Archive',
}

export function StatusControl({
  entity,
  id,
  status,
}: {
  entity: 'course' | 'lesson' | 'category'
  id: string
  status: AcademyStatus
}) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const targets = ALLOWED[status]

  function go(to: AcademyStatus) {
    start(async () => {
      const res = entity === 'course'
        ? await setCourseStatus({ id, to })
        : entity === 'lesson'
          ? await setLessonStatus({ id, to })
          : await setCategoryStatus({ id, to })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Moved to ${LABEL[to]}.`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium', PILL[status])}>
        {LABEL[status]}
      </span>
      {targets.map((to) => (
        <button
          key={to}
          type="button"
          onClick={() => go(to)}
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-50',
            to === 'PUBLISHED'
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : to === 'ARCHIVED'
                ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                : 'bg-ink-900 text-white hover:bg-ink-800',
          )}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          {ACTION_LABEL[to]}
        </button>
      ))}
    </div>
  )
}
