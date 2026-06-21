// Creator → Help → New ticket. Loads the active category library + the creator's
// recent orders (for an optional "this is about order #…" link), then renders the
// client form.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { NewTicketForm } from './NewTicketForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New ticket — Help' }

interface PageProps {
  searchParams: Promise<{ category?: string; orderId?: string }>
}

export default async function NewTicketPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { category: categoryParam, orderId: orderIdParam } = await searchParams

  const [categories, orders] = await Promise.all([
    prisma.ticketCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true, description: true },
    }),
    prisma.order.findMany({
      where: { creatorUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, createdAt: true, brand: { select: { name: true } } },
    }),
  ])

  // Deep-link prefill — only honor params that are real + belong to this creator.
  const initialCategorySlug = categories.some((c) => c.slug === categoryParam)
    ? categoryParam
    : undefined
  const initialOrderId = orders.some((o) => o.id === orderIdParam) ? orderIdParam : undefined

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
        orders={orders.map((o) => ({
          id: o.id,
          label: `#${o.id.slice(-8)}${o.brand?.name ? ` · ${o.brand.name}` : ''}`,
        }))}
        initialCategorySlug={initialCategorySlug}
        initialOrderId={initialOrderId}
      />
    </div>
  )
}
