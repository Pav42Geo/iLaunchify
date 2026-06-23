// =============================================================================
// Admin die-line review — thin surface to verify partner-confirmed die-lines.
// docs/DIELINE_FRAME_EDITOR_SPEC.md §3.
// =============================================================================

import Link from 'next/link'
import { SquareDashedBottom, SlidersHorizontal } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { DielineReviewActions } from './DielineReviewActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Die-lines — Admin' }

const STATUS_TONE: Record<string, string> = {
  PARTNER_CONFIRMED: 'bg-violet-50 text-violet-800 border-violet-200',
  ADMIN_VERIFIED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
}

export default async function AdminDielinesPage() {
  const rows = await prisma.packagingDieline.findMany({
    where: { status: { in: ['PARTNER_CONFIRMED', 'ACTIVE'] } },
    orderBy: [{ status: 'asc' }, { partnerConfirmedAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      status: true,
      decorationMethod: true,
      originalFileFormat: true,
      partnerConfirmedAt: true,
      packagingType: { select: { displayName: true } },
      partnerService: { select: { partner: { select: { companyName: true } } } },
    },
  })
  const pending = rows.filter((r) => r.status === 'PARTNER_CONFIRMED')
  const active = rows.filter((r) => r.status !== 'PARTNER_CONFIRMED')

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">Packaging · Die-lines</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">Die-line review</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Spot-check partner-confirmed die-lines (geometry + frame placement) and activate them for product packaging.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[12px] font-semibold text-violet-800">
          {pending.length} awaiting verification
        </div>
      </div>

      <Section title={`Awaiting verification (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty />
        ) : (
          pending.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Meta d={d} />
              <div className="inline-flex items-center gap-2">
                <CurateLink id={d.id} />
                <DielineReviewActions dielineId={d.id} />
              </div>
            </li>
          ))
        )}
      </Section>

      {active.length > 0 && (
        <Section title={`Active (${active.length})`}>
          {active.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Meta d={d} />
              <div className="inline-flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${STATUS_TONE[d.status]}`}>
                  {d.status.toLowerCase()}
                </span>
                <CurateLink id={d.id} label="Re-curate" />
              </div>
            </li>
          ))}
        </Section>
      )}
    </div>
  )
}

type Row = {
  id: string
  status: string
  decorationMethod: string
  originalFileFormat: string | null
  partnerConfirmedAt: Date | null
  packagingType: { displayName: string }
  partnerService: { partner: { companyName: string } }
}

function Meta({ d }: { d: Row }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-semibold text-ink-900">
        {d.packagingType.displayName} <span className="font-normal text-ink-500">· {d.partnerService.partner.companyName}</span>
      </p>
      <p className="mt-0.5 text-[11.5px] text-ink-500">
        {d.decorationMethod.replace(/_/g, ' ').toLowerCase()} · {d.originalFileFormat ?? 'no file'}
        {d.partnerConfirmedAt ? ` · confirmed ${new Date(d.partnerConfirmedAt).toLocaleDateString()}` : ''}
      </p>
    </div>
  )
}

function CurateLink({ id, label = 'Curate' }: { id: string; label?: string }) {
  return (
    <Link
      href={`/dielines/${id}`}
      className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50"
    >
      <SlidersHorizontal className="h-3.5 w-3.5" /> {label}
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="border-b border-ink-100 bg-zinc-50/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{title}</div>
      <ul className="divide-y divide-ink-100">{children}</ul>
    </section>
  )
}

function Empty() {
  return (
    <li className="px-4 py-10 text-center text-[13px] text-ink-500">
      <SquareDashedBottom className="mx-auto mb-2 h-7 w-7 text-ink-300" />
      Nothing awaiting verification.
    </li>
  )
}
