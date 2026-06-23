// Admin Academy — topic (category) editor (ACADEMY_SPEC §8). Name, description,
// icon, and home-grid order, plus the publish FSM control. Audience is fixed at
// creation (it scopes the slug + which academy the topic appears in).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { AUDIENCE_LABEL } from '../../../academy-data'
import { StatusControl } from '../../../StatusControl'
import { CategoryEditor } from './CategoryEditor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit topic — Academy' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditCategoryPage({ params }: PageProps) {
  await requireRole('ADMIN')
  const { id } = await params

  const category = await prisma.academyCategory.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      audience: true,
      iconKey: true,
      order: true,
      status: true,
      _count: { select: { courses: true } },
    },
  })
  if (!category) notFound()

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <Link href="/academy/categories" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:rounded">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to topics
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              {AUDIENCE_LABEL[category.audience]} Academy · Topic
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">{category.name}</h1>
            <p className="mt-1 font-mono text-[11.5px] text-ink-500">slug {category.slug} · {category._count.courses} course{category._count.courses === 1 ? '' : 's'}</p>
          </div>
          <StatusControl entity="category" id={category.id} status={category.status} />
        </div>
      </div>

      <CategoryEditor
        category={{
          id: category.id,
          name: category.name,
          description: category.description ?? '',
          iconKey: category.iconKey ?? '',
          order: category.order,
        }}
      />
    </div>
  )
}
