// =============================================================================
// /admin/niches/[slug]/subcategories — Niche × Subcategory junction editor
// =============================================================================
//
// Surfaces the subcategories admin has elected to show under this niche.
// Add via SubcategoryPickerDialog (multi-select grouped by Category). Remove
// + reorder per row. Display order = manual.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronRight, GripVertical, Layers } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { SubcategoryPickerDialog } from './SubcategoryPickerDialog'
import {
  RemoveSubcategoryButton,
  SubcategoryReorderControls,
} from './SubcategoryRowControls'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return { title: `${slug} subcategories — Admin` }
}

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function NicheSubcategoriesPage({ params }: PageProps) {
  await requireRole(['ADMIN'])
  const { slug } = await params

  const niche = await prisma.niche.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      iconEmoji: true,
      accentHex: true,
    },
  })
  if (!niche) notFound()

  const [junctions, allCategories] = await Promise.all([
    prisma.nicheSubcategory.findMany({
      where: { nicheId: niche.id },
      orderBy: [{ displayOrder: 'asc' }],
      include: {
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: { select: { name: true, mainCategory: true } },
            _count: { select: { productTemplates: true } },
          },
        },
      },
    }),
    prisma.category.findMany({
      orderBy: [{ mainCategory: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        mainCategory: true,
        subcategories: {
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, slug: true },
        },
      },
    }),
  ])

  const currentSubcategoryIds = junctions.map((j) => j.subcategoryId)
  const accent = niche.accentHex || '#FF2E63'

  return (
    <div className="space-y-6">
      <Header
        nicheName={niche.name}
        nicheDescription={niche.description}
        iconEmoji={niche.iconEmoji}
        accentHex={accent}
        slug={niche.slug}
        count={junctions.length}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/niches"
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to all niches
        </Link>
        <SubcategoryPickerDialog
          nicheId={niche.id}
          nicheName={niche.name}
          categories={allCategories}
          currentSubcategoryIds={currentSubcategoryIds}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        {junctions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-700">
              <Layers className="h-5 w-5" />
            </span>
            <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
              No subcategories in this niche yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-500">
              Click "Add subcategories…" to surface Subcategories in {niche.name}.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th scope="col" className="px-3 py-3 w-10" aria-label="Reorder" />
                <th scope="col" className="px-4 py-3">Subcategory</th>
                <th scope="col" className="px-4 py-3">Slug</th>
                <th scope="col" className="px-4 py-3 tabular-nums">Products</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {junctions.map((j) => (
                <tr key={j.subcategoryId} className="hover:bg-pink-50/20">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex h-5 w-5 cursor-grab items-center justify-center text-ink-300">
                        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <SubcategoryReorderControls
                        nicheId={niche.id}
                        subcategoryId={j.subcategoryId}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-ink-400">
                      <span>{j.subcategory.category.mainCategory}</span>
                      <ChevronRight className="h-2.5 w-2.5" aria-hidden="true" />
                      <span>{j.subcategory.category.name}</span>
                    </div>
                    <p className="mt-0.5 font-display text-[14px] font-semibold leading-tight text-ink-900">
                      {j.subcategory.name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-700">
                      {j.subcategory.slug}
                    </code>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink-900">
                    {j.subcategory._count.productTemplates.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RemoveSubcategoryButton
                      nicheId={niche.id}
                      subcategoryId={j.subcategoryId}
                      subcategoryName={j.subcategory.name}
                      nicheName={niche.name}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header — cream band with eyebrow + description + count chip
// -----------------------------------------------------------------------------

function Header({
  nicheName,
  nicheDescription,
  iconEmoji,
  accentHex,
  slug,
  count,
}: {
  nicheName: string
  nicheDescription: string | null
  iconEmoji: string | null
  accentHex: string
  slug: string
  count: number
}) {
  return (
    <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[28px]"
          style={{
            backgroundColor: `${accentHex}22`,
            color: accentHex,
          }}
        >
          {iconEmoji ?? '·'}
        </span>
        <div className="flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
            Marketplace · Niches · {nicheName}
          </p>
          <h1 className="mt-0.5 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Subcategories in {nicheName}
          </h1>
          {nicheDescription && (
            <p className="mt-1.5 max-w-3xl text-[13px] text-ink-600">
              {nicheDescription}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: `${accentHex}1A`,
                color: accentHex,
              }}
            >
              {count} surfaced
            </span>
            <code className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10.5px] text-ink-600">
              {slug}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
