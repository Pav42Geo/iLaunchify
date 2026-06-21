// Partner → Help → New ticket. Loads the active category library, then the form.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { NewTicketForm } from './NewTicketForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New ticket — Help' }

interface PageProps {
  searchParams: Promise<{ category?: string }>
}

export default async function NewTicketPage({ searchParams }: PageProps) {
  await requireUser()
  const { category: categoryParam } = await searchParams

  const categories = await prisma.ticketCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { slug: true, name: true, description: true },
  })

  const initialCategorySlug = categories.some((c) => c.slug === categoryParam)
    ? categoryParam
    : undefined

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
      <NewTicketForm categories={categories} initialCategorySlug={initialCategorySlug} />
    </div>
  )
}
