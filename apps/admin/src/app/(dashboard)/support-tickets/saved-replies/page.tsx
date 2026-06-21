// =============================================================================
// Admin → Support tickets → Saved replies (canned / macro replies)
// =============================================================================

import Link from 'next/link'
import { ArrowLeft, MessageSquareText } from 'lucide-react'
import { prisma, getCannedReplies } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { SavedRepliesManager, type CannedReplyRowVM } from './SavedRepliesManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Saved replies — Admin' }

export default async function SavedRepliesPage() {
  await requireRole('ADMIN')

  const [replies, categories] = await Promise.all([
    getCannedReplies(), // all (active + inactive) for admin management
    prisma.ticketCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const rows: CannedReplyRowVM[] = replies.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    categoryId: r.categoryId,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
  }))

  return (
    <div className="space-y-6">
      <Link
        href="/support-tickets"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to tickets
      </Link>

      <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="bg-[#F3EFE8] px-5 py-4">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-ink-900">
            <MessageSquareText className="h-5 w-5 text-pink-600" aria-hidden="true" />
            Saved replies
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] text-ink-600">
            Reusable canned responses agents insert when replying to a ticket. Scope a reply to a
            category, or leave it global to show on every ticket. Inactive replies stay out of the
            picker.
          </p>
        </div>
      </header>

      <SavedRepliesManager rows={rows} categories={categories} />
    </div>
  )
}
