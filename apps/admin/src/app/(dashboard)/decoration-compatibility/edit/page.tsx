// C8 — edit notes / active flag on an existing compatibility combo. Keys are
// locked (the composite PK can't be edited in place — delete + re-create to
// move a combo to a different pair).

import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import type { ContainerCategory, DecorationMethod } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { CompatForm } from '../CompatForm'
import {
  CONTAINER_CATEGORY_ORDER,
  CONTAINER_CATEGORY_LABEL,
  DECORATION_METHOD_ORDER,
  DECORATION_METHOD_LABEL,
} from '../decoration-compatibility-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit compatibility combo — Admin' }

interface PageProps {
  searchParams: Promise<{ category?: string; method?: string }>
}

function asCategory(v: string | undefined): ContainerCategory | null {
  return v && (CONTAINER_CATEGORY_ORDER as readonly string[]).includes(v)
    ? (v as ContainerCategory)
    : null
}

function asMethod(v: string | undefined): DecorationMethod | null {
  return v && (DECORATION_METHOD_ORDER as readonly string[]).includes(v)
    ? (v as DecorationMethod)
    : null
}

export default async function EditCompatibilityPage({ searchParams }: PageProps) {
  await requireRole('ADMIN')
  const sp = await searchParams
  const category = asCategory(sp.category)
  const method = asMethod(sp.method)
  if (!category || !method) notFound()

  const row = await prisma.packagingDecorationCompatibility.findUnique({
    where: { containerCategory_decorationMethod: { containerCategory: category, decorationMethod: method } },
    select: { notes: true, isActive: true },
  })
  if (!row) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminDetailHeader
        backHref="/decoration-compatibility"
        backLabel="Decoration compatibility"
        title="Edit combo"
        meta={
          <>
            {CONTAINER_CATEGORY_LABEL[category]} · {DECORATION_METHOD_LABEL[method]} — edit
            the notes or toggle availability. To move this to a different pair,
            delete it and add a new one.
          </>
        }
      />

      <CompatForm
        mode="edit"
        initialCategory={category}
        initialMethod={method}
        initialNotes={row.notes ?? ''}
        initialActive={row.isActive}
      />
    </div>
  )
}
