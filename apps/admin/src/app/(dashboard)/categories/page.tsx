// =============================================================================
// /admin/categories — marketplace taxonomy management
// =============================================================================
//
// Three URL-driven tabs at /admin/categories?tab=<catalog|management|packaging>.
// Chrome matches the locked v2 admin pattern (cream hero band, KPI strip,
// pill-style tab bar, rounded-2xl cards on plain white).
//
// V1 ships:
//   - Catalog overview (product-template counts per category)
//   - Category Management (the screenshot — expandable groups + 2-col cards
//     with pencil/trash and chevron up/down reorder)
//   - Packaging & Materials forward-pointer card (task #135)
//
// Mutations live in ./actions.ts. Client wrappers:
//   - CategoryFormDialog.tsx (add / edit category modal)
//   - SubcategoryFormDialog.tsx (add / edit subcategory modal + header picker)
//   - RowControls.tsx (delete buttons + chevron up/down reorder)
//
// See memory: ilaunchify-admin-surface-pattern.md (v2 rules)
// Reference: apps/admin/src/app/(dashboard)/partners/page.tsx
// Reference: apps/admin/src/app/(dashboard)/tiers/page.tsx

import Link from 'next/link'
import {
  Layers,
  Tag,
  Package,
  AlertOctagon,
  GripVertical,
  Sparkles,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { CategoryFormDialog } from './CategoryFormDialog'
import {
  SubcategoryFormDialog,
  SubcategoryHeaderPickerDialog,
} from './SubcategoryFormDialog'
import {
  DeleteCategoryButton,
  DeleteSubcategoryButton,
  ReorderCategory,
  ReorderSubcategory,
} from './RowControls'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Categories — Admin' }

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

type TabKey = 'catalog' | 'management' | 'packaging'

const TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'catalog', label: 'Product Catalog', icon: Package },
  { key: 'management', label: 'Category Management', icon: Layers },
  { key: 'packaging', label: 'Packaging & Materials', icon: Sparkles },
]

const MAIN_CATEGORY_ORDER = ['Food', 'Beverages', 'Supplements', 'Other'] as const
type MainCategoryKey = (typeof MAIN_CATEGORY_ORDER)[number]

const MAIN_CATEGORY_ICON: Record<MainCategoryKey, string> = {
  Food: 'F',
  Beverages: 'B',
  Supplements: 'S',
  Other: 'O',
}

function isTabKey(s: string | undefined): s is TabKey {
  return s === 'catalog' || s === 'management' || s === 'packaging'
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    tab?: string
  }>
}

export default async function CategoriesPage({ searchParams }: PageProps) {
  await requireRole(['ADMIN'])
  const sp = await searchParams
  const activeTab: TabKey = isTabKey(sp.tab) ? sp.tab : 'management'

  const [
    mainCategoryCount,
    subcategoryCount,
    productCount,
    inactiveSubcategoryCount,
    categoriesRaw,
    productCountsBySubcategory,
  ] = await Promise.all([
    prisma.category.count(),
    prisma.subcategory.count(),
    prisma.productTemplate.count(),
    prisma.subcategory.count({ where: { isActive: false } }),
    prisma.category.findMany({
      orderBy: [{ mainCategory: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        color: true,
        mainCategory: true,
        displayOrder: true,
        isActive: true,
        subcategories: {
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            displayOrder: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.productTemplate.groupBy({
      by: ['subcategoryId'],
      _count: { _all: true },
    }),
  ])

  const productCountBySubcategoryId = new Map(
    productCountsBySubcategory.map((c) => [c.subcategoryId, c._count._all]),
  )

  // Product domain per category. Separate cast-guarded read so the main typed
  // query stays green until the Category.labelingType migration is generated;
  // merge it onto each row so CategoryRow simply carries `labelingType`.
  const domainRows = await (prisma as unknown as {
    category: { findMany: (a: unknown) => Promise<Array<{ id: string; labelingType: string }>> }
  }).category.findMany({ select: { id: true, labelingType: true } })
  const domainByCategoryId = new Map(domainRows.map((d) => [d.id, d.labelingType]))
  const categories: CategoryRow[] = categoriesRaw.map((c) => ({
    ...c,
    labelingType: domainByCategoryId.get(c.id) ?? 'FOOD',
  }))

  // Group categories by mainCategory for the Management tab.
  const grouped = new Map<string, typeof categories>()
  for (const c of categories) {
    const list = grouped.get(c.mainCategory) ?? []
    list.push(c)
    grouped.set(c.mainCategory, list)
  }

  return (
    <div className="space-y-6">
      <Header
        mainCategoryCount={mainCategoryCount}
        subcategoryCount={subcategoryCount}
        productCount={productCount}
        inactiveSubcategoryCount={inactiveSubcategoryCount}
      />

      <TabBar
        active={activeTab}
        counts={{
          catalog: mainCategoryCount,
          management: mainCategoryCount,
          packaging: 0,
        }}
      />

      {activeTab === 'catalog' && (
        <CatalogTab
          categories={categories}
          productCountBySubcategoryId={productCountBySubcategoryId}
        />
      )}

      {activeTab === 'management' && (
        <ManagementTab
          categories={categories}
          grouped={grouped}
          productCountBySubcategoryId={productCountBySubcategoryId}
        />
      )}

      {activeTab === 'packaging' && <PackagingTab />}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header — cream band + 4-card KPI strip
// -----------------------------------------------------------------------------

function Header({
  mainCategoryCount,
  subcategoryCount,
  productCount,
  inactiveSubcategoryCount,
}: {
  mainCategoryCount: number
  subcategoryCount: number
  productCount: number
  inactiveSubcategoryCount: number
}) {
  return (
    <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Marketplace · Taxonomy
        </p>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Category management
        </h1>
        <p className="max-w-2xl text-[13px] text-ink-600">
          The marketplace taxonomy creators browse. Manufacturers pick one subcategory when submitting a product — keep it clean.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          href="/categories?tab=management"
          label="Main categories"
          value={mainCategoryCount}
          icon={Layers}
          active
        />
        <KpiCard
          href="/categories?tab=management"
          label="Subcategories"
          value={subcategoryCount}
          icon={Tag}
          tone="sky"
        />
        <KpiCard
          href="/categories?tab=catalog"
          label="Products tagged"
          value={productCount}
          icon={Package}
          tone="emerald"
        />
        <KpiCard
          href="/categories?tab=management"
          label="Inactive subcategories"
          value={inactiveSubcategoryCount}
          icon={AlertOctagon}
          tone="rose"
        />
      </div>
    </div>
  )
}

function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  tone,
  active,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose'
  active?: boolean
}) {
  const iconTone: Record<'amber' | 'emerald' | 'sky' | 'rose', string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    rose: 'bg-rose-100 text-rose-700',
  }
  const ring: Record<'amber' | 'emerald' | 'sky' | 'rose', string> = {
    amber: 'group-hover:ring-amber-300/60',
    emerald: 'group-hover:ring-emerald-300/60',
    sky: 'group-hover:ring-sky-300/60',
    rose: 'group-hover:ring-rose-300/60',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        'ring-1 ring-transparent',
        tone ? ring[tone] : 'group-hover:ring-pink-300/40',
        active && 'ring-pink-300/40',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            tone ? iconTone[tone] : 'bg-pink-100 text-pink-700',
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </Link>
  )
}

// -----------------------------------------------------------------------------
// TabBar — pill-style segmented control (v2 pattern)
// -----------------------------------------------------------------------------

function TabBar({
  active,
  counts,
}: {
  active: TabKey
  counts: Record<TabKey, number>
}) {
  return (
    <nav
      aria-label="Category tabs"
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-ink-200 bg-white p-0.5"
    >
      {TABS.map((t) => {
        const isActive = t.key === active
        const Icon = t.icon
        return (
          <Link
            key={t.key}
            href={t.key === 'management' ? '/categories' : `/categories?tab=${t.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
              isActive
                ? 'bg-ink-900 text-white'
                : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t.label}
            {counts[t.key] > 0 && (
              <span
                className={cn(
                  'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums',
                  isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600',
                )}
              >
                {counts[t.key]}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

// -----------------------------------------------------------------------------
// Tab — Catalog (overview grid)
// -----------------------------------------------------------------------------

// Short, human label for the product-domain chip on each category card.
const DOMAIN_SHORT: Record<string, string> = {
  FOOD: 'Food',
  DIETARY_SUPPLEMENT: 'Supplement',
  COSMETIC: 'Cosmetic',
  PET_PRODUCT: 'Pet',
  OTC: 'OTC',
}

type CategoryRow = {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  color: string | null
  mainCategory: string
  labelingType: string
  displayOrder: number
  isActive: boolean
  subcategories: {
    id: string
    name: string
    slug: string
    description: string | null
    displayOrder: number
    isActive: boolean
  }[]
}

function CatalogTab({
  categories,
  productCountBySubcategoryId,
}: {
  categories: CategoryRow[]
  productCountBySubcategoryId: Map<string, number>
}) {
  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
        <Layers className="mx-auto h-8 w-8 text-ink-300" />
        <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">No categories yet</h3>
        <p className="mt-1 text-[12.5px] text-ink-500">
          Switch to Category Management to add the first one.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => {
        const tagged = c.subcategories.reduce(
          (sum, s) => sum + (productCountBySubcategoryId.get(s.id) ?? 0),
          0,
        )
        return (
          <div
            key={c.id}
            className="rounded-2xl border border-ink-200 bg-white p-5 transition-shadow hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100 font-display text-[16px] font-bold text-pink-700">
                {c.icon || MAIN_CATEGORY_ICON[(c.mainCategory as MainCategoryKey) ?? 'Other'] || '?'}
              </span>
              <div className="flex-1">
                <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
                  {c.mainCategory}
                </p>
                <h3 className="font-display text-[16px] font-semibold leading-tight text-ink-900">
                  {c.name}
                </h3>
              </div>
            </div>
            {c.description && (
              <p className="mt-3 text-[12px] text-ink-600">{c.description}</p>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-[11.5px] text-ink-600">
              <span>
                <span className="font-semibold tabular-nums text-ink-900">
                  {c.subcategories.length}
                </span>{' '}
                subcategor{c.subcategories.length === 1 ? 'y' : 'ies'}
              </span>
              <span>
                <span className="font-semibold tabular-nums text-ink-900">{tagged}</span>{' '}
                product{tagged === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Tab — Management (the screenshot UX)
// -----------------------------------------------------------------------------

function ManagementTab({
  categories,
  grouped,
  productCountBySubcategoryId,
}: {
  categories: CategoryRow[]
  grouped: Map<string, CategoryRow[]>
  productCountBySubcategoryId: Map<string, number>
}) {
  // For the "Add subcategory" header pill we need a flat list of parents.
  const parentList = categories.map((c) => ({
    id: c.id,
    name: c.name,
    mainCategory: c.mainCategory,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <SubcategoryHeaderPickerDialog parents={parentList} />
        <CategoryFormDialog mode="create" />
      </div>

      {MAIN_CATEGORY_ORDER.map((mainKey) => {
        const list = grouped.get(mainKey) ?? []
        if (list.length === 0) return null
        return (
          <MainCategoryGroup
            key={mainKey}
            mainCategory={mainKey}
            categories={list}
            productCountBySubcategoryId={productCountBySubcategoryId}
          />
        )
      })}

      {/* "Other" buckets that may not match the standard list */}
      {Array.from(grouped.keys())
        .filter((k) => !(MAIN_CATEGORY_ORDER as readonly string[]).includes(k))
        .map((extra) => (
          <MainCategoryGroup
            key={extra}
            mainCategory={extra}
            categories={grouped.get(extra) ?? []}
            productCountBySubcategoryId={productCountBySubcategoryId}
          />
        ))}

      {categories.length === 0 && (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
          <Layers className="mx-auto h-8 w-8 text-ink-300" />
          <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">No categories yet</h3>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Click "Add category" to create the first one.
          </p>
        </div>
      )}
    </div>
  )
}

function MainCategoryGroup({
  mainCategory,
  categories,
  productCountBySubcategoryId,
}: {
  mainCategory: string
  categories: CategoryRow[]
  productCountBySubcategoryId: Map<string, number>
}) {
  return (
    <details
      open
      className="group overflow-hidden rounded-2xl border border-ink-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 bg-zinc-50/70 px-5 py-3 transition-colors hover:bg-zinc-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-inset">
        <ChevronRight className="h-4 w-4 text-ink-500 transition-transform group-open:rotate-90" />
        <span className="font-display text-[14px] font-semibold text-ink-900">
          {mainCategory}
        </span>
        <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-ink-100 px-2 text-[10.5px] font-semibold tabular-nums text-ink-700">
          {categories.length}
        </span>
        <span className="ml-auto text-[11.5px] text-ink-500">
          {categories.reduce((sum, c) => sum + c.subcategories.length, 0)} subcategor
          {categories.reduce((sum, c) => sum + c.subcategories.length, 0) === 1 ? 'y' : 'ies'}
        </span>
      </summary>

      <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
        {categories.map((c) => (
          <CategoryCard
            key={c.id}
            category={c}
            productCountBySubcategoryId={productCountBySubcategoryId}
          />
        ))}
      </div>
    </details>
  )
}

function CategoryCard({
  category,
  productCountBySubcategoryId,
}: {
  category: CategoryRow
  productCountBySubcategoryId: Map<string, number>
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 cursor-grab items-center justify-center text-ink-300">
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <ReorderCategory categoryId={category.id} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-display text-[14.5px] font-semibold leading-tight text-ink-900">
              {category.name}
            </h3>
            <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-600">
              {DOMAIN_SHORT[category.labelingType] ?? category.labelingType}
            </span>
            {!category.isActive && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                Hidden
              </span>
            )}
          </div>
          {category.description && (
            <p className="mt-0.5 text-[11.5px] text-ink-600">{category.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <CategoryFormDialog
            mode="edit"
            category={{
              id: category.id,
              name: category.name,
              mainCategory: category.mainCategory,
              labelingType: category.labelingType,
              description: category.description,
              icon: category.icon,
              color: category.color,
              isActive: category.isActive,
            }}
          />
          <DeleteCategoryButton categoryId={category.id} name={category.name} />
        </div>
      </div>

      <div className="mt-3 border-t border-ink-100 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
            Subcategories
          </p>
          <SubcategoryFormDialog
            mode="create"
            categoryId={category.id}
            trigger="inline-add"
          />
        </div>

        {category.subcategories.length === 0 ? (
          <p className="mt-2 text-[11.5px] italic text-ink-400">No subcategories yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {category.subcategories.map((s) => {
              const productCount = productCountBySubcategoryId.get(s.id) ?? 0
              return (
                <li
                  key={s.id}
                  className="flex items-start gap-2 rounded-xl border border-ink-100 bg-zinc-50/40 px-2.5 py-2"
                >
                  <span className="mt-0.5 inline-flex h-4 w-4 cursor-grab items-center justify-center text-ink-300">
                    <GripVertical className="h-3 w-3" />
                  </span>
                  <ReorderSubcategory subcategoryId={s.id} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] font-semibold leading-tight text-ink-900">
                        {s.name}
                      </p>
                      {!s.isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9.5px] font-medium text-rose-900">
                          <span className="h-1 w-1 rounded-full bg-rose-500" />
                          Inactive
                        </span>
                      )}
                      {productCount > 0 && (
                        <span className="text-[10px] text-ink-500 tabular-nums">
                          {productCount} product{productCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <p className="mt-0.5 text-[10.5px] text-ink-500">{s.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <SubcategoryFormDialog
                      mode="edit"
                      categoryId={category.id}
                      subcategory={{
                        id: s.id,
                        name: s.name,
                        description: s.description,
                      }}
                    />
                    <DeleteSubcategoryButton subcategoryId={s.id} name={s.name} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Tab — Packaging & Materials (forward-pointer)
// -----------------------------------------------------------------------------

function PackagingTab() {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100 text-pink-700">
        <Sparkles className="h-5 w-5" />
      </span>
      <h3 className="mt-4 font-display text-[16px] font-semibold text-ink-900">
        Coming next: Packaging-type library
      </h3>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-600">
        Curating the platform packaging-type library — partner submissions, cluster review, and promote-to-type — lands with task #135 (W1 Admin Packaging Curation).
      </p>
      <Link
        href="/asset-management/packaging-types"
        className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-[12px] font-semibold text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
      >
        View packaging-types stub
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

