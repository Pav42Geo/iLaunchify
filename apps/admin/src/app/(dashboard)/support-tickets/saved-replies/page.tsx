// =============================================================================
// Admin → Support tickets → Saved replies (canned / macro replies)
// =============================================================================

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { prisma, getCannedReplies } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
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

      <AdminPageHeader
        title="Saved replies"
        description="Reusable canned responses agents insert when replying to a ticket. Scope a reply to a category, or leave it global to show on every ticket. Inactive replies stay out of the picker."
      />

      <SavedRepliesManager rows={rows} categories={categories} />
    </div>
  )
}
