// Admin Academy — categories (topic taxonomy) list (ACADEMY_SPEC §8). v2 surface:
// cream hero + KPI strip + chips (audience/status) + sortable table + RowActions.

import { Tags, Clock } from 'lucide-react'
import {
  loadCategoriesData,
  buildCategoriesHref,
  AUDIENCES,
  STATUSES,
  STATUS_TONE,
  AUDIENCE_TONE,
  AUDIENCE_LABEL,
  type CategorySort,
  type SortDir,
} from '../academy-data'
import { AcademyHero, KpiCard, ChipRow, FilterChip, StatusPill, Th, SortableTh, Paginator, EmptyState, SearchForm } from '../academy-ui'
import { AcademyRowActions } from '../AcademyRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Academy topics — Admin' }

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AcademyCategoriesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { filters, rows, total, totalPages, statusCounts, audienceCounts } = await loadCategoriesData(sp)

  const hrefForSort = (sort: CategorySort, dir: SortDir) => buildCategoriesHref(filters, { sort, dir, page: 1 })
  const hrefForPage = (page: number) => buildCategoriesHref(filters, { page })

  return (
    <div className="space-y-6">
      <AcademyHero
        groupLabel="Academy · Topics"
        title="Topics"
        subtitle="The topic taxonomy that powers each academy's home grid. Order, audience, and status are managed here."
      >
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard href={buildCategoriesHref(filters, { status: null, audience: null, page: 1 })} label="All topics" value={total} icon={Tags} tone="pink" active={!filters.status && !filters.audience} />
          <KpiCard href={buildCategoriesHref(filters, { status: 'PUBLISHED', page: 1 })} label="Published" value={statusCounts.PUBLISHED ?? 0} icon={Tags} tone="emerald" active={filters.status === 'PUBLISHED'} />
          <KpiCard href={buildCategoriesHref(filters, { audience: 'CREATOR', page: 1 })} label="Creator" value={audienceCounts.CREATOR ?? 0} icon={Tags} tone="indigo" active={filters.audience === 'CREATOR'} />
          <KpiCard href={buildCategoriesHref(filters, { audience: 'PARTNER', page: 1 })} label="Partner" value={audienceCounts.PARTNER ?? 0} icon={Tags} tone="sky" active={filters.audience === 'PARTNER'} />
        </div>
      </AcademyHero>

      <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
        <SearchForm
          q={filters.q}
          placeholder="Search topic name or slug…"
          clearHref="/academy/categories"
          resultLabel={`${total.toLocaleString()} results`}
          hidden={{ audience: filters.audience ?? '', status: filters.status ?? '' }}
        />

        <ChipRow label="Audience">
          <FilterChip href={buildCategoriesHref(filters, { audience: null, page: 1 })} active={!filters.audience} label="All" />
          {AUDIENCES.map((a) => (
            <FilterChip key={a} href={buildCategoriesHref(filters, { audience: a, page: 1 })} active={filters.audience === a} label={AUDIENCE_LABEL[a]} count={audienceCounts[a] ?? 0} tone={AUDIENCE_TONE[a]} />
          ))}
        </ChipRow>

        <ChipRow label="Status">
          <FilterChip href={buildCategoriesHref(filters, { status: null, page: 1 })} active={!filters.status} label="All" />
          {STATUSES.map((s) => (
            <FilterChip key={s} href={buildCategoriesHref(filters, { status: s, page: 1 })} active={filters.status === s} label={STATUS_TONE[s].label} count={statusCounts[s] ?? 0} tone={STATUS_TONE[s]} />
          ))}
        </ChipRow>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Tags} title="No topics match" hint="Adjust the filters above, or create a topic to group courses." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <SortableTh sortKey="order" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort} className="w-[64px] text-right">#</SortableTh>
                <SortableTh sortKey="name" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort}>Topic</SortableTh>
                <Th>Audience</Th>
                <Th className="text-right">Courses</Th>
                <SortableTh sortKey="status" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort}>Status</SortableTh>
                <SortableTh sortKey="updatedAt" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort} descDefault className="text-right">Updated</SortableTh>
                <Th className="w-[36px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-pink-50/20">
                  <td className="px-3 py-3 align-top text-right tabular-nums text-ink-500">{c.order}</td>
                  <td className="px-3 py-3 align-top">
                    <p className="font-semibold text-ink-900">{c.name}</p>
                    <p className="mt-0.5 truncate text-[10.5px] text-ink-500">{c.slug}</p>
                  </td>
                  <td className="px-3 py-3 align-top"><StatusPill tone={AUDIENCE_TONE[c.audience]} /></td>
                  <td className="px-3 py-3 align-top text-right tabular-nums text-ink-700">{c._count.courses}</td>
                  <td className="px-3 py-3 align-top"><StatusPill tone={STATUS_TONE[c.status]} /></td>
                  <td className="px-3 py-3 align-top text-right">
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-600" title={c.updatedAt.toLocaleString()}>
                      <Clock className="h-3 w-3 text-ink-400" />
                      {c.updatedAt.toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top text-right">
                    <AcademyRowActions entity="category" id={c.id} title={c.name} slug={c.slug} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginator page={filters.page} totalPages={totalPages} hrefFor={hrefForPage} />
    </div>
  )
}
