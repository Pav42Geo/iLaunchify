// =============================================================================
// Admin → Support tickets → Categories (W2-SUP, admin taxonomy CRUD)
// =============================================================================

import Link from 'next/link'
import { ArrowLeft, Tag } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { CategoriesManager, type CategoryRow } from './CategoriesManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ticket categories — Admin' }

export default async function TicketCategoriesPage() {
  await requireRole('ADMIN')

  const [categories, admins] = await Promise.all([
    prisma.ticketCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        defaultPriority: true,
        slaResponseMinutes: true,
        slaResolveMinutes: true,
        defaultAssigneeUserId: true,
        sortOrder: true,
        isActive: true,
        _count: { select: { tickets: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const rows: CategoryRow[] = categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    defaultPriority: c.defaultPriority,
    slaResponseMinutes: c.slaResponseMinutes,
    slaResolveMinutes: c.slaResolveMinutes,
    defaultAssigneeUserId: c.defaultAssigneeUserId,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    ticketCount: c._count.tickets,
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
        <div className="bg-[var(--bg-hero)] px-5 py-4">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
            <Tag className="h-5 w-5 text-pink-600" aria-hidden="true" />
            Ticket categories
          </h1>
          <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">
            The buckets creators and partners choose from when filing a ticket. Each sets a default
            priority, optional SLA overrides, and an optional default assignee. Inactive categories
            stay on existing tickets but disappear from the new-ticket picker.
          </p>
        </div>
      </header>

      <CategoriesManager
        rows={rows}
        admins={admins.map((a) => ({ id: a.id, label: a.name ?? a.email }))}
      />
    </div>
  )
}
