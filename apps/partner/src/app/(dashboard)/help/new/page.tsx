// Partner → Help → New ticket. Loads the active category library + the partner's
// recent dispatches. The form shows a context-aware dispatch picker for order /
// dispatch categories.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { NewTicketForm } from './NewTicketForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New ticket — Help' }

// Order / dispatch categories invite a dispatch attachment; others none.
const ATTACH_BY_SLUG: Record<string, 'dispatch'> = {
  'order-issue': 'dispatch',
  'dispatch-deadline': 'dispatch',
}

interface PageProps {
  searchParams: Promise<{ category?: string; dispatchId?: string }>
}

export default async function NewTicketPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { category: categoryParam, dispatchId: dispatchIdParam } = await searchParams

  const [categories, dispatches] = await Promise.all([
    prisma.ticketCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true, description: true },
    }),
    prisma.orderDispatch.findMany({
      where: { partnerService: { partner: { userId: user.id } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, type: true, orderId: true },
    }),
  ])

  const initialCategorySlug = categories.some((c) => c.slug === categoryParam)
    ? categoryParam
    : undefined
  const initialDispatchId =
    dispatchIdParam && dispatches.some((d) => d.id === dispatchIdParam) ? dispatchIdParam : undefined

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/help" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Help
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Open a ticket</h1>
        <p className="mt-1 text-sm text-ink-500">
          Tell us what&apos;s going on. The more detail you give, the faster we can help.
        </p>
      </div>
      <NewTicketForm
        categories={categories}
        attachBySlug={ATTACH_BY_SLUG}
        dispatches={dispatches.map((d) => ({
          id: d.id,
          label: `Dispatch #${d.id.slice(-8)} · ${d.type.toLowerCase()} · order #${d.orderId.slice(-8)}`,
        }))}
        initialCategorySlug={initialCategorySlug}
        initialDispatchId={initialDispatchId}
      />
    </div>
  )
}
