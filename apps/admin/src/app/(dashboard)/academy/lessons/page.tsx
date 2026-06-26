// Admin Academy — lessons list (ACADEMY_SPEC §8). Flat across both academies.
// v2 surface: cream hero + KPI strip + chips (audience/status/type) + sortable
// table + RowActionsMenu + paginator.

import Link from 'next/link'
import { PlaySquare, FileText, Clock } from 'lucide-react'
import {
  loadLessonsData,
  buildLessonsHref,
  AUDIENCES,
  STATUSES,
  LESSON_TYPES,
  STATUS_TONE,
  AUDIENCE_TONE,
  AUDIENCE_LABEL,
  LESSON_TYPE_TONE,
  type LessonSort,
  type SortDir,
} from '../academy-data'
import { AcademyHero, KpiCard, ChipRow, FilterChip, StatusPill, Th, SortableTh, Paginator, EmptyState, SearchForm } from '../academy-ui'
import { AcademyRowActions } from '../AcademyRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Academy lessons — Admin' }

function fmtDuration(s?: number | null): string {
  if (!s || s <= 0) return '—'
  const m = Math.round(s / 60)
  return m >= 1 ? `${m} min` : `${s}s`
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AcademyLessonsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { filters, rows, total, totalPages, statusCounts, typeCounts } = await loadLessonsData(sp)

  const hrefForSort = (sort: LessonSort, dir: SortDir) => buildLessonsHref(filters, { sort, dir, page: 1 })
  const hrefForPage = (page: number) => buildLessonsHref(filters, { page })

  return (
    <div className="space-y-6">
      <AcademyHero
        groupLabel="Academy · Lessons"
        title="Lessons"
        subtitle="Every video and article lesson across both academies. Articles also power each academy's dated updates feed."
      >
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard href={buildLessonsHref(filters, { status: null, type: null, page: 1 })} label="All lessons" value={total} icon={PlaySquare} tone="pink" active={!filters.status && !filters.type} />
          <KpiCard href={buildLessonsHref(filters, { status: 'PUBLISHED', page: 1 })} label="Published" value={statusCounts.PUBLISHED ?? 0} icon={PlaySquare} tone="emerald" active={filters.status === 'PUBLISHED'} />
          <KpiCard href={buildLessonsHref(filters, { status: 'DRAFT', page: 1 })} label="Drafts" value={statusCounts.DRAFT ?? 0} icon={PlaySquare} tone="sky" active={filters.status === 'DRAFT'} />
          <KpiCard href={buildLessonsHref(filters, { type: 'VIDEO', page: 1 })} label="Videos" value={typeCounts.VIDEO ?? 0} icon={PlaySquare} tone="indigo" active={filters.type === 'VIDEO'} />
          <KpiCard href={buildLessonsHref(filters, { type: 'ARTICLE', page: 1 })} label="Articles" value={typeCounts.ARTICLE ?? 0} icon={FileText} tone="amber" active={filters.type === 'ARTICLE'} />
        </div>
      </AcademyHero>

      <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
        <SearchForm
          q={filters.q}
          placeholder="Search lesson title or slug…"
          clearHref="/academy/lessons"
          resultLabel={`${total.toLocaleString()} results`}
          hidden={{ audience: filters.audience ?? '', status: filters.status ?? '', type: filters.type ?? '' }}
        />

        <ChipRow label="Audience">
          <FilterChip href={buildLessonsHref(filters, { audience: null, page: 1 })} active={!filters.audience} label="All" />
          {AUDIENCES.map((a) => (
            <FilterChip key={a} href={buildLessonsHref(filters, { audience: a, page: 1 })} active={filters.audience === a} label={AUDIENCE_LABEL[a]} tone={AUDIENCE_TONE[a]} />
          ))}
        </ChipRow>

        <ChipRow label="Type">
          <FilterChip href={buildLessonsHref(filters, { type: null, page: 1 })} active={!filters.type} label="All" />
          {LESSON_TYPES.map((t) => (
            <FilterChip key={t} href={buildLessonsHref(filters, { type: t, page: 1 })} active={filters.type === t} label={LESSON_TYPE_TONE[t].label} count={typeCounts[t] ?? 0} tone={LESSON_TYPE_TONE[t]} />
          ))}
        </ChipRow>

        <ChipRow label="Status">
          <FilterChip href={buildLessonsHref(filters, { status: null, page: 1 })} active={!filters.status} label="All" />
          {STATUSES.map((s) => (
            <FilterChip key={s} href={buildLessonsHref(filters, { status: s, page: 1 })} active={filters.status === s} label={STATUS_TONE[s].label} count={statusCounts[s] ?? 0} tone={STATUS_TONE[s]} />
          ))}
        </ChipRow>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={PlaySquare} title="No lessons match" hint="Adjust the filters above, or add lessons to a course." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <SortableTh sortKey="title" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort}>Lesson</SortableTh>
                <Th>Course</Th>
                <Th>Audience</Th>
                <SortableTh sortKey="type" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort}>Type</SortableTh>
                <Th className="text-right">Duration</Th>
                <SortableTh sortKey="status" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort}>Status</SortableTh>
                <SortableTh sortKey="updatedAt" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort} descDefault className="text-right">Updated</SortableTh>
                <Th className="w-[36px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((l) => (
                <tr key={l.id} className="transition-colors hover:bg-pink-50/20">
                  <td className="px-3 py-3 align-top">
                    <Link href={`/academy/lessons/${l.id}/edit`} className="group/cell block focus-visible:outline-none">
                      <p className="truncate font-semibold text-ink-900 group-hover/cell:text-pink-700 group-focus-visible/cell:underline">{l.title}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-ink-500">{l.slug}</p>
                    </Link>
                  </td>
                  <td className="px-3 py-3 align-top text-ink-700">
                    <Link href={`/academy/courses/${l.course.id}/edit`} className="hover:text-pink-700">{l.course.title}</Link>
                  </td>
                  <td className="px-3 py-3 align-top"><StatusPill tone={AUDIENCE_TONE[l.course.audience]} /></td>
                  <td className="px-3 py-3 align-top"><StatusPill tone={LESSON_TYPE_TONE[l.type]} /></td>
                  <td className="px-3 py-3 align-top text-right tabular-nums text-ink-700">{fmtDuration(l.durationSeconds)}</td>
                  <td className="px-3 py-3 align-top"><StatusPill tone={STATUS_TONE[l.status]} /></td>
                  <td className="px-3 py-3 align-top text-right">
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-600" title={l.updatedAt.toLocaleString()}>
                      <Clock className="h-3 w-3 text-ink-400" />
                      {l.updatedAt.toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top text-right">
                    <AcademyRowActions entity="lesson" id={l.id} title={l.title} slug={l.slug} />
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
