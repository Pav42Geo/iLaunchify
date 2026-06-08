// Admin Academy — overview (ACADEMY_SPEC §8). KPIs split by audience + quick
// links into the three list surfaces. v2 chrome (cream hero + KPI strip).

import Link from 'next/link'
import { GraduationCap, CheckCircle2, Clock, FileEdit, PlaySquare, ArrowRight } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { loadAcademyOverview, AUDIENCE_LABEL } from './academy-data'
import { AcademyHero, KpiCard } from './academy-ui'
import type { AcademyAudience } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Academy — Admin' }

export default async function AcademyOverviewPage() {
  const { byAudience, totals } = await loadAcademyOverview()

  return (
    <div className="space-y-6">
      <AcademyHero
        groupLabel="Academy · Content"
        title="Academy overview"
        subtitle="Author, sequence, review, and publish the Creator and Partner academies. Content is data — changes go live without a deploy."
      >
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard href="/academy/courses" label="Courses" value={totals.courses} icon={GraduationCap} tone="pink" />
          <KpiCard href="/academy/courses?status=PUBLISHED" label="Published" value={totals.published} icon={CheckCircle2} tone="emerald" />
          <KpiCard href="/academy/courses?status=IN_REVIEW" label="In review" value={totals.inReview} icon={Clock} tone="amber" />
          <KpiCard href="/academy/courses?status=DRAFT" label="Drafts" value={totals.drafts} icon={FileEdit} tone="sky" />
          <KpiCard href="/academy/lessons" label="Lessons" value={totals.lessons} icon={PlaySquare} tone="indigo" subline={`${totals.lessonsPublished} published`} />
        </div>
      </AcademyHero>

      {/* Per-audience breakdown */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(['CREATOR', 'PARTNER'] as AcademyAudience[]).map((aud) => {
          const b = byAudience[aud]
          return (
            <div key={aud} className="rounded-2xl border border-ink-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', aud === 'CREATOR' ? 'bg-pink-500' : 'bg-sky-500')} />
                  <h2 className="font-display text-[16px] font-bold text-ink-900">{AUDIENCE_LABEL[aud]} Academy</h2>
                </div>
                <Link
                  href={`/academy/courses?audience=${aud}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:rounded"
                >
                  View courses <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3">
                <Stat label="Published" value={b.PUBLISHED} tone="text-emerald-700" />
                <Stat label="In review" value={b.IN_REVIEW} tone="text-amber-700" />
                <Stat label="Drafts" value={b.DRAFT} tone="text-sky-700" />
                <Stat label="Archived" value={b.ARCHIVED} tone="text-rose-700" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <QuickLink href="/academy/courses" title="Courses" desc="Create, sequence, and publish courses across both academies." />
        <QuickLink href="/academy/lessons" title="Lessons" desc="Every video + article lesson, flat across both academies." />
        <QuickLink href="/academy/categories" title="Topics" desc="The topic taxonomy that powers each academy's grid." />
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className={cn('font-display text-[22px] font-bold leading-none tabular-nums', tone)}>{value.toLocaleString()}</p>
      <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</p>
    </div>
  )
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-ink-200 bg-white p-4 transition-shadow hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink-900">{title}</h3>
        <ArrowRight className="h-4 w-4 text-ink-400 group-hover:text-pink-600" />
      </div>
      <p className="mt-1 text-[12.5px] text-ink-500">{desc}</p>
    </Link>
  )
}
