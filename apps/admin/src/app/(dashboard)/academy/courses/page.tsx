// Admin Academy — courses list (ACADEMY_SPEC §8). v2 surface: cream hero +
// KPI strip + URL-driven chips (audience/status/level) + sortable table +
// RowActionsMenu + paginator.

import Link from 'next/link'
import { GraduationCap, Clock, Plus } from 'lucide-react'
import {
  loadCoursesData,
  buildCoursesHref,
  AUDIENCES,
  STATUSES,
  LEVELS,
  STATUS_TONE,
  AUDIENCE_TONE,
  AUDIENCE_LABEL,
  type CourseSort,
  type SortDir,
} from '../academy-data'
import { AcademyHero, KpiCard, ChipRow, FilterChip, StatusPill, Th, SortableTh, Paginator, EmptyState, SearchForm } from '../academy-ui'
import { AcademyRowActions } from '../AcademyRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Academy courses — Admin' }

const LEVEL_LABEL: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' }

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AcademyCoursesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { filters, rows, total, totalPages, statusCounts, audienceCounts } = await loadCoursesData(sp)

  const hrefForSort = (sort: CourseSort, dir: SortDir) => buildCoursesHref(filters, { sort, dir, page: 1 })
  const hrefForPage = (page: number) => buildCoursesHref(filters, { page })

  const published = statusCounts.PUBLISHED ?? 0
  const inReview = statusCounts.IN_REVIEW ?? 0
  const drafts = statusCounts.DRAFT ?? 0

  return (
    <div className="space-y-6">
      <AcademyHero
        groupLabel="Academy · Courses"
        title="Courses"
        subtitle="Every course across the Creator and Partner academies. Pick an audience, sequence lessons, and move through the publish workflow."
        action={
          <Link
            href="/academy/courses/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" /> New course
          </Link>
        }
      >
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard href={buildCoursesHref(filters, { status: null, audience: null, page: 1 })} label="All courses" value={total} icon={GraduationCap} tone="pink" active={!filters.status && !filters.audience} />
          <KpiCard href={buildCoursesHref(filters, { status: 'PUBLISHED', page: 1 })} label="Published" value={published} icon={GraduationCap} tone="emerald" active={filters.status === 'PUBLISHED'} />
          <KpiCard href={buildCoursesHref(filters, { status: 'IN_REVIEW', page: 1 })} label="In review" value={inReview} icon={GraduationCap} tone="amber" active={filters.status === 'IN_REVIEW'} />
          <KpiCard href={buildCoursesHref(filters, { status: 'DRAFT', page: 1 })} label="Drafts" value={drafts} icon={GraduationCap} tone="sky" active={filters.status === 'DRAFT'} />
          <KpiCard href={buildCoursesHref(filters, { audience: 'CREATOR', page: 1 })} label="Creator / Partner" value={(audienceCounts.CREATOR ?? 0)} icon={GraduationCap} tone="indigo" subline={`${audienceCounts.PARTNER ?? 0} partner`} active={filters.audience === 'CREATOR'} />
        </div>
      </AcademyHero>

      <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
        <SearchForm
          q={filters.q}
          placeholder="Search course title or slug…"
          clearHref="/academy/courses"
          resultLabel={`${total.toLocaleString()} results`}
          hidden={{
            audience: filters.audience ?? '',
            status: filters.status ?? '',
            level: filters.level ?? '',
            category: filters.category ?? '',
          }}
        />

        <ChipRow label="Audience">
          <FilterChip href={buildCoursesHref(filters, { audience: null, page: 1 })} active={!filters.audience} label="All" />
          {AUDIENCES.map((a) => (
            <FilterChip key={a} href={buildCoursesHref(filters, { audience: a, page: 1 })} active={filters.audience === a} label={AUDIENCE_LABEL[a]} count={audienceCounts[a] ?? 0} tone={AUDIENCE_TONE[a]} />
          ))}
        </ChipRow>

        <ChipRow label="Status">
          <FilterChip href={buildCoursesHref(filters, { status: null, page: 1 })} active={!filters.status} label="All" />
          {STATUSES.map((s) => (
            <FilterChip key={s} href={buildCoursesHref(filters, { status: s, page: 1 })} active={filters.status === s} label={STATUS_TONE[s].label} count={statusCounts[s] ?? 0} tone={STATUS_TONE[s]} />
          ))}
        </ChipRow>

        <ChipRow label="Level">
          <FilterChip href={buildCoursesHref(filters, { level: null, page: 1 })} active={!filters.level} label="All" />
          {LEVELS.map((l) => (
            <FilterChip key={l} href={buildCoursesHref(filters, { level: l, page: 1 })} active={filters.level === l} label={LEVEL_LABEL[l] ?? l} />
          ))}
        </ChipRow>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No courses match" hint="Adjust the filters above, or create a course to get started." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <SortableTh sortKey="title" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort}>Course</SortableTh>
                <Th>Audience</Th>
                <Th>Category</Th>
                <SortableTh sortKey="level" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort}>Level</SortableTh>
                <Th className="text-right">Lessons</Th>
                <SortableTh sortKey="status" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort}>Status</SortableTh>
                <SortableTh sortKey="updatedAt" activeSort={filters.sort} dir={filters.dir} hrefFor={hrefForSort} descDefault className="text-right">Updated</SortableTh>
                <Th className="w-[36px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-pink-50/20">
                  <td className="px-3 py-3 align-top">
                    <Link href={`/academy/courses/${c.id}/edit`} className="group/cell block focus-visible:outline-none">
                      <p className="truncate font-semibold text-ink-900 group-hover/cell:text-pink-700 group-focus-visible/cell:underline">{c.title}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-ink-500">{c.slug}</p>
                    </Link>
                  </td>
                  <td className="px-3 py-3 align-top"><StatusPill tone={AUDIENCE_TONE[c.audience]} /></td>
                  <td className="px-3 py-3 align-top text-ink-700">{c.category?.name ?? '—'}</td>
                  <td className="px-3 py-3 align-top text-ink-700">{LEVEL_LABEL[c.level] ?? c.level}</td>
                  <td className="px-3 py-3 align-top text-right tabular-nums text-ink-700">{c._count.lessons}</td>
                  <td className="px-3 py-3 align-top"><StatusPill tone={STATUS_TONE[c.status]} /></td>
                  <td className="px-3 py-3 align-top text-right">
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-600" title={c.updatedAt.toLocaleString()}>
                      <Clock className="h-3 w-3 text-ink-400" />
                      {c.updatedAt.toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top text-right">
                    <AcademyRowActions entity="course" id={c.id} title={c.title} slug={c.slug} />
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
