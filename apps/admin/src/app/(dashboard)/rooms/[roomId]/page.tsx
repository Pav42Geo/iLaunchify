// =============================================================================
// Admin Room detail — co-creation oversight (spec §10/§16 P0, 2026-07-10)
// =============================================================================
//
// READ-ONLY observability surface — NO action buttons, no mutations. Rooms
// move through their FSM from the creator/partner apps only.
//
// Privacy posture: the decision log (RoomEvent) and all structured metadata
// are shown; chat MESSAGE BODIES are never rendered — only the count.
//
// Layout follows the locked detail shape (AdminDetailHeader + stat strip,
// then left-2/3 content cards + right-1/3 meta):
//   LEFT:  BuildObjectsCard (kind · status · currentVersion)
//          MilestonesCard (kind · status · amount · released)
//          DecisionLogCard (latest 50 RoomEvents: kind · by · when)
//   RIGHT: MetaCard (brief / partner / NDA / timestamps / ids)
//          MessagesCard (count only — bodies stay private)

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  DoorOpen,
  Boxes,
  Landmark,
  History,
  MessageSquare,
  Building2,
  FileSignature,
  Lightbulb,
} from 'lucide-react'
import type {
  BuildObjectKind,
  BuildObjectStatus,
  MilestoneKind,
  MilestoneStatus,
} from '@ilaunchify/db'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { ROOM_STATUS_LABEL, ROOM_STATUS_PILL } from '../rooms-data'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ roomId: string }>
}

// -----------------------------------------------------------------------------
// Presentation lookups
// -----------------------------------------------------------------------------

const OBJECT_KIND_LABEL: Record<BuildObjectKind, string> = {
  RECIPE: 'Recipe',
  LABEL: 'Label',
  PACKAGING: 'Packaging',
  SAMPLE: 'Sample',
  SPEC_SHEET: 'Spec sheet',
}

const OBJECT_STATUS_PILL: Record<
  BuildObjectStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  DRAFT: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400', label: 'Draft' },
  SUBMITTED: { bg: 'bg-info-100', text: 'text-info-700', border: 'border-info-200', dot: 'bg-info-500', label: 'Submitted' },
  IN_REVIEW: { bg: 'bg-warning-100', text: 'text-warning-800', border: 'border-warning-200', dot: 'bg-warning-500', label: 'In review' },
  CHANGES_REQUESTED: { bg: 'bg-danger-100', text: 'text-danger-700', border: 'border-danger-200', dot: 'bg-danger-500', label: 'Changes requested' },
  APPROVED: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500', label: 'Approved' },
  LOCKED: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500', label: 'Locked' },
}

const MILESTONE_KIND_LABEL: Record<MilestoneKind, string> = {
  DISCOVERY: 'Discovery',
  SAMPLE: 'Sample',
  TOOLING: 'Tooling',
  PRODUCTION: 'Production',
}

const MILESTONE_STATUS_PILL: Record<
  MilestoneStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  PENDING: { bg: 'bg-ink-100', text: 'text-ink-700', border: 'border-ink-200', dot: 'bg-ink-400', label: 'Pending' },
  FUNDED_ESCROW: { bg: 'bg-info-100', text: 'text-info-700', border: 'border-info-200', dot: 'bg-info-500', label: 'Funded' },
  RELEASED: { bg: 'bg-success-100', text: 'text-success-800', border: 'border-success-200', dot: 'bg-success-500', label: 'Released' },
  REFUNDED: { bg: 'bg-warning-100', text: 'text-warning-800', border: 'border-warning-200', dot: 'bg-warning-500', label: 'Refunded' },
  DISPUTED: { bg: 'bg-danger-100', text: 'text-danger-700', border: 'border-danger-200', dot: 'bg-danger-500', label: 'Disputed' },
}

export async function generateMetadata({ params }: PageProps) {
  const { roomId } = await params
  const r = await prisma.coCreationRoom.findUnique({
    where: { id: roomId },
    select: { brief: { select: { title: true } } },
  })
  return { title: `${r?.brief.title ?? 'Room'} — Admin` }
}

export default async function RoomDetailPage({ params }: PageProps) {
  const { roomId } = await params

  const room = await prisma.coCreationRoom.findUnique({
    where: { id: roomId },
    include: {
      brief: {
        select: {
          id: true,
          title: true,
          nicheSlug: true,
          creator: { select: { id: true, displayName: true } },
        },
      },
      partner: { select: { id: true, companyName: true } },
      objects: { orderBy: { createdAt: 'asc' } },
      milestones: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 50 },
      _count: { select: { messages: true, events: true } },
    },
  })

  if (!room) notFound()

  const tone = ROOM_STATUS_PILL[room.status]
  const milestonesReleased = room.milestones.filter((m) => m.status === 'RELEASED').length

  return (
    <div className="space-y-6">
      <AdminDetailHeader
        backHref="/rooms"
        backLabel="All rooms"
        eyebrow="Marketplace · Co-creation · Room"
        title={room.brief.title}
        meta={
          <>
            <Link
              href={`/creators/${room.brief.creator.id}`}
              className="font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:underline"
            >
              {room.brief.creator.displayName ?? '—'}
            </Link>
            <span className="text-ink-400">×</span>
            <Link
              href={`/partners/${room.partner.id}`}
              className="font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:underline"
            >
              {room.partner.companyName}
            </Link>
            <span className="text-ink-300">·</span>
            {room.ndaSignedAt ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-100 px-2 py-[2px] text-[11px] font-medium text-success-800"
                title={room.ndaSignedAt.toLocaleString()}
              >
                <FileSignature className="h-3 w-3" aria-hidden="true" />
                NDA signed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-warning-100 px-2 py-[2px] text-[11px] font-medium text-warning-800">
                <FileSignature className="h-3 w-3" aria-hidden="true" />
                NDA pending
              </span>
            )}
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
            {ROOM_STATUS_LABEL[room.status]}
          </span>
        }
      >
        <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100 sm:grid-cols-4">
          <Stat icon={Boxes} label="Build objects" value={room.objects.length} />
          <Stat
            icon={Landmark}
            label="Milestones"
            value={
              room.milestones.length === 0
                ? '—'
                : `${milestonesReleased}/${room.milestones.length} released`
            }
          />
          <Stat icon={History} label="Log events" value={room._count.events} />
          <Stat icon={MessageSquare} label="Messages" value={room._count.messages} />
        </div>
      </AdminDetailHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <BuildObjectsCard objects={room.objects} />
          <MilestonesCard milestones={room.milestones} />
          <DecisionLogCard events={room.events} totalEvents={room._count.events} />
        </div>
        <div className="space-y-6">
          <MetaCard room={room} />
          <MessagesCard count={room._count.messages} />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Cards
// =============================================================================

function BuildObjectsCard({
  objects,
}: {
  objects: Array<{
    id: string
    kind: BuildObjectKind
    status: BuildObjectStatus
    currentVersion: number
    updatedAt: Date
  }>
}) {
  return (
    <Card
      icon={Boxes}
      title="Build objects"
      subtitle={
        objects.length === 0
          ? 'No objects yet'
          : `${objects.length} of 5 kinds in play`
      }
    >
      {objects.length === 0 ? (
        <Empty label="The maker hasn't started any build object yet." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {objects.map((o) => {
            const pill = OBJECT_STATUS_PILL[o.status]
            return (
              <li key={o.id} className="flex items-center gap-3 px-1.5 py-2.5">
                <span className="min-w-0 flex-1 text-[12.5px] font-medium text-ink-900">
                  {OBJECT_KIND_LABEL[o.kind]}
                </span>
                <span className="font-mono text-[10.5px] text-ink-500">
                  v{o.currentVersion}
                </span>
                <span
                  className="text-[11px] text-ink-500"
                  title={o.updatedAt.toLocaleString()}
                >
                  {formatRelative(o.updatedAt)}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium',
                    pill.bg,
                    pill.text,
                    pill.border,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', pill.dot)} />
                  {pill.label}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function MilestonesCard({
  milestones,
}: {
  milestones: Array<{
    id: string
    kind: MilestoneKind
    status: MilestoneStatus
    amount: unknown
    releasedAt: Date | null
  }>
}) {
  return (
    <Card
      icon={Landmark}
      title="Milestones"
      subtitle={
        milestones.length === 0
          ? 'No milestones yet'
          : `${milestones.filter((m) => m.status === 'RELEASED').length} of ${milestones.length} released`
      }
    >
      {milestones.length === 0 ? (
        <Empty label="No milestone has been set up in this room yet." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {milestones.map((m) => {
            const pill = MILESTONE_STATUS_PILL[m.status]
            return (
              <li key={m.id} className="flex items-center gap-3 px-1.5 py-2.5">
                <span className="min-w-0 flex-1 text-[12.5px] font-medium text-ink-900">
                  {MILESTONE_KIND_LABEL[m.kind]}
                </span>
                <span className="text-[12.5px] font-semibold tabular-nums text-ink-900">
                  {formatMoney(m.amount)}
                </span>
                {m.releasedAt && (
                  <span
                    className="text-[11px] text-ink-500"
                    title={m.releasedAt.toLocaleString()}
                  >
                    {formatRelative(m.releasedAt)}
                  </span>
                )}
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium',
                    pill.bg,
                    pill.text,
                    pill.border,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', pill.dot)} />
                  {pill.label}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function DecisionLogCard({
  events,
  totalEvents,
}: {
  events: Array<{
    id: string
    kind: string
    data: unknown
    createdAt: Date
  }>
  totalEvents: number
}) {
  return (
    <Card
      icon={History}
      title="Decision log"
      subtitle={
        totalEvents === 0
          ? 'No events yet'
          : totalEvents > events.length
            ? `Latest ${events.length} of ${totalEvents.toLocaleString()} events`
            : `${totalEvents} event${totalEvents === 1 ? '' : 's'}`
      }
    >
      {events.length === 0 ? (
        <Empty label="Room activity surfaces here as decisions are made." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {events.map((e) => {
            const by = eventActor(e.data)
            return (
              <li key={e.id} className="flex items-center gap-3 px-1.5 py-2.5">
                <span className="inline-flex rounded-md border border-ink-200 bg-ink-50 px-1.5 py-[2px] font-mono text-[10.5px] font-semibold text-ink-800">
                  {e.kind}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-600">
                  {by ?? '—'}
                </span>
                <span
                  className="whitespace-nowrap text-[11px] text-ink-500"
                  title={e.createdAt.toLocaleString()}
                >
                  {formatRelative(e.createdAt)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function MetaCard({
  room,
}: {
  room: {
    id: string
    ndaSignedAt: Date | null
    createdAt: Date
    updatedAt: Date
    brief: { id: string; title: string; nicheSlug: string }
    partner: { id: string; companyName: string }
  }
}) {
  return (
    <Card icon={Building2} title="Meta" subtitle="Identifiers & timeline">
      <dl className="divide-y divide-ink-100">
        <Row label="Brief">
          <Link
            href={`/briefs/${room.brief.id}`}
            className="inline-flex items-center gap-1 font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:underline"
          >
            <Lightbulb className="h-3 w-3" aria-hidden="true" />
            Open brief
          </Link>
        </Row>
        <Row label="Partner">
          <Link
            href={`/partners/${room.partner.id}`}
            className="font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:underline"
          >
            {room.partner.companyName}
          </Link>
        </Row>
        <Row label="Niche">
          <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-[2px] text-[11px] font-medium text-ink-700">
            {room.brief.nicheSlug}
          </span>
        </Row>
        <Row label="NDA">
          {room.ndaSignedAt
            ? room.ndaSignedAt.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Pending'}
        </Row>
        <Row label="Created">
          {room.createdAt.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Row>
        <Row label="Updated">
          {room.updatedAt.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Row>
        <Row label="Room ID">
          <span className="font-mono text-[10.5px] text-ink-500">{room.id}</span>
        </Row>
        <Row label="Audit trail">
          <Link
            href={`/audit?entityType=CoCreationRoom&entityId=${room.id}`}
            className="font-semibold text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:underline"
          >
            View in audit log
          </Link>
        </Row>
      </dl>
    </Card>
  )
}

function MessagesCard({ count }: { count: number }) {
  return (
    <Card icon={MessageSquare} title="Messages" subtitle="Metadata only">
      <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
        {count.toLocaleString()}
      </p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
        Message bodies are private to the creator and maker — admin oversight
        logs metadata (counts, decision events) but never chat content.
      </p>
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
  icon: typeof DoorOpen
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
  icon: typeof DoorOpen
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

/** Pull the actor out of a RoomEvent's JSON payload (convention: data.by). */
function eventActor(data: unknown): string | null {
  if (data && typeof data === 'object' && 'by' in data) {
    const by = (data as Record<string, unknown>).by
    if (typeof by === 'string' && by.length > 0) return by
  }
  return null
}

function formatMoney(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 30 * 86400) return `${Math.floor(diff / (7 * 86400))}w ago`
  if (diff < 365 * 86400) return `${Math.floor(diff / (30 * 86400))}mo ago`
  return `${Math.floor(diff / (365 * 86400))}y ago`
}
