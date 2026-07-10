// =============================================================================
// Admin Brief detail — co-creation oversight (spec §10/§16 P0, 2026-07-10)
// =============================================================================
//
// READ-ONLY observability surface — NO action buttons, no mutations. Briefs
// move through their FSM from the creator/partner apps only.
//
// Layout follows the locked detail shape (AdminDetailHeader + stat strip,
// then left-2/3 content cards + right-1/3 meta):
//   LEFT:  BriefDetailsCard (origin / formulation / claims / commercials)
//          PrivatePayloadCard — the staged-reveal payload, clearly marked
//            "Private — revealed to the selected maker only" (admin oversight
//            may see it; pool/partner APIs never serve it)
//          InterestsCard (partner · status · fit · terms)
//   RIGHT: MetaCard (status / room link / timestamps / ids)

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Lightbulb,
  Handshake,
  Package,
  Wallet,
  Clock,
  Lock,
  DoorOpen,
  FileText,
  Building2,
} from 'lucide-react'
import type { InterestStatus } from '@ilaunchify/db'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import {
  BRIEF_ORIGIN_LABEL,
  BRIEF_STATUS_LABEL,
  BRIEF_STATUS_PILL,
} from '../briefs-data'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ briefId: string }>
}

const INTEREST_STATUS_PILL: Record<
  InterestStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  SUBMITTED: { bg: 'bg-info-100', text: 'text-info-700', border: 'border-info-200', dot: 'bg-info-500', label: 'Submitted' },
  SHORTLISTED: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500', label: 'Shortlisted' },
  SELECTED: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500', label: 'Selected' },
  PASSED: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400', label: 'Passed' },
  WITHDRAWN: { bg: 'bg-danger-100', text: 'text-danger-700', border: 'border-danger-200', dot: 'bg-danger-500', label: 'Withdrawn' },
}

const FORMULATION_LABEL: Record<string, string> = {
  CREATOR_PROVIDED: 'Creator-provided formula',
  MAKER_FORMULATES: 'Maker formulates',
}

export async function generateMetadata({ params }: PageProps) {
  const { briefId } = await params
  const b = await prisma.productBrief.findUnique({
    where: { id: briefId },
    select: { title: true },
  })
  return { title: `${b?.title ?? 'Brief'} — Admin` }
}

export default async function BriefDetailPage({ params }: PageProps) {
  const { briefId } = await params

  const brief = await prisma.productBrief.findUnique({
    where: { id: briefId },
    include: {
      creator: { select: { id: true, displayName: true } },
      categoryRef: { select: { name: true } },
      room: { select: { id: true, status: true } },
      attachments: { orderBy: { createdAt: 'asc' } },
      interests: {
        orderBy: [{ fitScore: 'desc' }, { createdAt: 'asc' }],
        include: {
          partner: { select: { id: true, companyName: true } },
        },
      },
    },
  })

  if (!brief) notFound()

  const tone = BRIEF_STATUS_PILL[brief.status]

  return (
    <div className="space-y-6">
      <AdminDetailHeader
        backHref="/briefs"
        backLabel="All briefs"
        eyebrow="Marketplace · Co-creation · Brief"
        title={brief.title}
        meta={
          <>
            <Link
              href={`/creators/${brief.creator.id}`}
              className="font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:underline"
            >
              {brief.creator.displayName ?? '—'}
            </Link>
            <span className="text-ink-300">·</span>
            <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-[2px] text-[11px] font-medium text-ink-700">
              {brief.nicheSlug}
            </span>
            <span className="text-ink-300">·</span>
            <span>{brief.categoryRef?.name ?? brief.category}</span>
            <span className="text-ink-300">·</span>
            <span>{BRIEF_ORIGIN_LABEL[brief.origin]}</span>
          </>
        }
        status={
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
              tone.bg,
              tone.text,
              tone.border,
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
            {BRIEF_STATUS_LABEL[brief.status]}
          </span>
        }
      >
        <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100 sm:grid-cols-4">
          <Stat icon={Handshake} label="Interests" value={brief.interests.length} />
          <Stat
            icon={Package}
            label="Target volume"
            value={brief.targetVolume ? brief.targetVolume.toLocaleString() : '—'}
          />
          <Stat
            icon={Wallet}
            label="Budget"
            value={formatBudget(brief.budgetLow, brief.budgetHigh)}
          />
          <Stat
            icon={Clock}
            label="Timeline"
            value={brief.timelineWeeks ? `${brief.timelineWeeks} wks` : '—'}
          />
        </div>
      </AdminDetailHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <BriefDetailsCard brief={brief} />
          <PrivatePayloadCard
            privateFormula={brief.privateFormula}
            privateNotes={brief.privateNotes}
            attachments={brief.attachments}
          />
          <InterestsCard interests={brief.interests} />
        </div>
        <div className="space-y-6">
          <MetaCard brief={brief} />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Cards
// =============================================================================

function BriefDetailsCard({
  brief,
}: {
  brief: {
    origin: 'HAVE_RECIPE' | 'HAVE_IDEA'
    formulationMode: string
    claims: string[]
    targetVolume: number | null
    timelineWeeks: number | null
    budgetLow: unknown
    budgetHigh: unknown
  }
}) {
  return (
    <Card icon={Lightbulb} title="Brief details" subtitle="Public projection — what the pool sees">
      <dl className="divide-y divide-ink-100">
        <Row label="Origin door">{BRIEF_ORIGIN_LABEL[brief.origin]}</Row>
        <Row label="Formulation">
          {FORMULATION_LABEL[brief.formulationMode] ?? brief.formulationMode}
        </Row>
        <Row label="Must-have claims">
          {brief.claims.length === 0 ? (
            <span className="text-ink-400">—</span>
          ) : (
            <span className="flex flex-wrap justify-end gap-1">
              {brief.claims.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center rounded-full bg-pink-50 px-2 py-[2px] text-[10.5px] font-medium text-pink-700"
                >
                  {c}
                </span>
              ))}
            </span>
          )}
        </Row>
        <Row label="Target volume">
          {brief.targetVolume ? brief.targetVolume.toLocaleString() : '—'}
        </Row>
        <Row label="Budget range">{formatBudget(brief.budgetLow, brief.budgetHigh)}</Row>
        <Row label="Timeline">
          {brief.timelineWeeks ? `${brief.timelineWeeks} weeks` : '—'}
        </Row>
      </dl>
    </Card>
  )
}

function PrivatePayloadCard({
  privateFormula,
  privateNotes,
  attachments,
}: {
  privateFormula: unknown
  privateNotes: string | null
  attachments: Array<{
    id: string
    isPrivate: boolean
    assetId: string
    kind: string
  }>
}) {
  const privateAttachments = attachments.filter((a) => a.isPrivate)
  const publicAttachments = attachments.filter((a) => !a.isPrivate)
  const empty = !privateFormula && !privateNotes && privateAttachments.length === 0

  return (
    <Card
      icon={Lock}
      title="Private payload"
      subtitle="Staged reveal (§9) — never served through pool or interest APIs"
    >
      {/* Privacy posture banner — admin oversight may see this; makers only after selection + NDA. */}
      <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2.5">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-700" aria-hidden="true" />
        <p className="text-[12px] leading-relaxed text-warning-800">
          <span className="font-semibold">Private — revealed to the selected maker only</span>{' '}
          (after selection + mutual NDA, inside the room). Shown here for admin oversight.
        </p>
      </div>

      {empty ? (
        <Empty label="No private payload on this brief." />
      ) : (
        <div className="space-y-3">
          {privateFormula != null && (
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
                Private formula
              </p>
              <pre className="mt-1.5 max-h-72 overflow-auto rounded-lg border border-ink-200 bg-ink-50/60 p-3 font-mono text-[10.5px] leading-relaxed text-ink-800">
                {JSON.stringify(privateFormula, null, 2)}
              </pre>
            </div>
          )}
          {privateNotes && (
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
                Private notes
              </p>
              <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-ink-200 bg-ink-50/60 p-3 text-[12.5px] leading-relaxed text-ink-800">
                {privateNotes}
              </p>
            </div>
          )}
          {privateAttachments.length > 0 && (
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
                Private attachments
              </p>
              <ul className="mt-1.5 divide-y divide-ink-100 rounded-lg border border-ink-200">
                {privateAttachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 px-3 py-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                    <span className="text-[12px] font-medium capitalize text-ink-800">{a.kind}</span>
                    <span className="ml-auto font-mono text-[10.5px] text-ink-400">
                      {a.assetId.slice(0, 8)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-warning-100 px-2 py-[1px] text-[9.5px] font-bold uppercase tracking-wider text-warning-800">
                      Private
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {publicAttachments.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
            Public attachments
          </p>
          <ul className="mt-1.5 divide-y divide-ink-100 rounded-lg border border-ink-200">
            {publicAttachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 px-3 py-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                <span className="text-[12px] font-medium capitalize text-ink-800">{a.kind}</span>
                <span className="ml-auto font-mono text-[10.5px] text-ink-400">
                  {a.assetId.slice(0, 8)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function InterestsCard({
  interests,
}: {
  interests: Array<{
    id: string
    status: InterestStatus
    fitScore: number
    priceLow: unknown
    priceHigh: unknown
    moq: number | null
    leadTimeWeeks: number | null
    offersSample: boolean
    createdAt: Date
    partner: { id: string; companyName: string }
  }>
}) {
  return (
    <Card
      icon={Handshake}
      title="Interests"
      subtitle={
        interests.length === 0
          ? 'No interests yet'
          : `${interests.length} manufacturer${interests.length === 1 ? '' : 's'} · sorted by fit`
      }
    >
      {interests.length === 0 ? (
        <Empty label="No manufacturer has expressed interest yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">Partner</th>
                <th className="px-2 py-2 text-left font-semibold">Status</th>
                <th className="px-2 py-2 text-right font-semibold">Fit</th>
                <th className="px-2 py-2 text-right font-semibold">Price range</th>
                <th className="px-2 py-2 text-right font-semibold">MOQ</th>
                <th className="px-2 py-2 text-right font-semibold">Lead time</th>
                <th className="px-2 py-2 text-center font-semibold">Sample</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {interests.map((i) => {
                const tone = INTEREST_STATUS_PILL[i.status]
                return (
                  <tr key={i.id} className="hover:bg-pink-50/20">
                    <td className="px-2 py-2.5 align-top">
                      <Link
                        href={`/partners/${i.partner.id}`}
                        className="font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                      >
                        {i.partner.companyName}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 align-top">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium',
                          tone.bg,
                          tone.text,
                          tone.border,
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                        {tone.label}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right align-top tabular-nums font-semibold text-ink-900">
                      {i.fitScore}
                    </td>
                    <td className="px-2 py-2.5 text-right align-top tabular-nums text-ink-700">
                      {formatBudget(i.priceLow, i.priceHigh)}
                    </td>
                    <td className="px-2 py-2.5 text-right align-top tabular-nums text-ink-700">
                      {i.moq ? i.moq.toLocaleString() : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-right align-top tabular-nums text-ink-700">
                      {i.leadTimeWeeks ? `${i.leadTimeWeeks} wks` : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-center align-top">
                      {i.offersSample ? (
                        <span className="inline-flex items-center rounded-full bg-success-100 px-2 py-[1px] text-[9.5px] font-bold uppercase tracking-wider text-success-800">
                          Yes
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function MetaCard({
  brief,
}: {
  brief: {
    id: string
    status: string
    createdAt: Date
    updatedAt: Date
    room: { id: string; status: string } | null
    creator: { id: string; displayName: string | null }
  }
}) {
  return (
    <Card icon={Building2} title="Meta" subtitle="Identifiers & timeline">
      <dl className="divide-y divide-ink-100">
        <Row label="Status">{BRIEF_STATUS_LABEL[brief.status as never] ?? brief.status}</Row>
        <Row label="Room">
          {brief.room ? (
            <Link
              href={`/rooms/${brief.room.id}`}
              className="inline-flex items-center gap-1 font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:underline"
            >
              <DoorOpen className="h-3 w-3" aria-hidden="true" />
              Open room
            </Link>
          ) : (
            <span className="text-ink-400">—</span>
          )}
        </Row>
        <Row label="Created">
          {brief.createdAt.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Row>
        <Row label="Updated">
          {brief.updatedAt.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Row>
        <Row label="Brief ID">
          <span className="font-mono text-[10.5px] text-ink-500">{brief.id}</span>
        </Row>
        <Row label="Audit trail">
          <Link
            href={`/audit?entityType=ProductBrief&entityId=${brief.id}`}
            className="font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:underline"
          >
            View in audit log
          </Link>
        </Row>
      </dl>
    </Card>
  )
}

// =============================================================================
// Shared chrome (canonical detail-card shape — creators/[creatorId]/page.tsx)
// =============================================================================

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Lightbulb
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-[15px] font-semibold leading-none tracking-tight text-ink-900">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-[11.5px] text-ink-500">{subtitle}</p>}
          </div>
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-[12px] uppercase tracking-wider text-ink-700">{label}</dt>
      <dd className="text-right text-[12.5px] font-medium text-ink-900">{children}</dd>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Lightbulb
  label: string
  value: number | string
}) {
  return (
    <div className="px-5 py-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 font-display text-[20px] font-semibold tabular-nums leading-none tracking-tight text-ink-900">
        {value}
      </p>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function formatBudget(low: unknown, high: unknown): string {
  const l = low == null ? null : Number(low)
  const h = high == null ? null : Number(high)
  if (l == null && h == null) return '—'
  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    })
  if (l != null && h != null) return `${fmt(l)} – ${fmt(h)}`
  return fmt((l ?? h)!)
}
