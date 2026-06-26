// Admin Academy — topic (category) editor (ACADEMY_SPEC §8). Name, description,
// icon, and home-grid order, plus the publish FSM control. Audience is fixed at
// creation (it scopes the slug + which academy the topic appears in).

import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
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
      <AdminDetailHeader
        backHref="/academy/categories"
        backLabel="Back to topics"
        eyebrow={`${AUDIENCE_LABEL[category.audience]} Academy · Topic`}
        title={category.name}
        meta={<span className="font-mono text-[11.5px] text-ink-500">slug {category.slug} · {category._count.courses} course{category._count.courses === 1 ? '' : 's'}</span>}
        status={<StatusControl entity="category" id={category.id} status={category.status} />}
      />

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
