// =============================================================================
// Admin Lead detail (#575) — v2 admin surface pattern
//
// "Leads" in this app are Partner rows in the pre-onboarding funnel (DRAFT /
// LEAD / INVITED — see ilaunchify-admin-sidebar-v3-locked memory + the list
// page header copy). There is no separate Lead model, no convert-to-creator
// path — these are partner applicants we either qualify (→ INVITED, send
// magic link) or disqualify (→ delete draft). This page mirrors the v2
// chrome from /admin/orders/[orderId]: cream rounded-3xl header band + main
// column of detail cards + sticky right rail of action cards.
//
// Required reading on top of the task spec:
//   • orders/[orderId]/page.tsx — chrome reference
//   • leads/page.tsx              — status enum + tone maps
//   • memory: ilaunchify-admin-surface-pattern.md
// =============================================================================

import { notFound } from 'next/navigation'
import {
  Building2,
  Calendar,
  Globe,
  Mail,
  MapPin,
  Phone,
  Factory,
  Package as PackageIcon,
  Printer,
  Warehouse as WarehouseIcon,
  Activity,
  StickyNote,
  Info,
  User as UserIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { listEntityHistory } from '@ilaunchify/audit'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import {
  StatusCard,
  AssignCard,
  TagsCard,
  QuickContactCard,
  NotesThread,
  type LeadNoteUI,
} from './LeadActions'

export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------------
// Tone + label maps (mirror leads/page.tsx)
// -----------------------------------------------------------------------------

const STATUS_TONE: Record<
  string,
  { dot: string; bg: string; text: string; border: string; label: string }
> = {
  DRAFT: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-200',
    label: 'Pending review',
  },
  LEAD: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-200',
    label: 'Lead',
  },
  INVITED: {
    dot: 'bg-sky-500',
    bg: 'bg-sky-50',
    text: 'text-sky-900',
    border: 'border-sky-200',
    label: 'Invited',
  },
  IN_PROGRESS: {
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-900',
    border: 'border-blue-200',
    label: 'Onboarding',
  },
  UNDER_REVIEW: {
    dot: 'bg-pink-500',
    bg: 'bg-pink-50',
    text: 'text-pink-900',
    border: 'border-pink-200',
    label: 'Under review',
  },
  ACTIVE: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    border: 'border-emerald-200',
    label: 'Active partner',
  },
}

const SERVICE_LABELS: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
  WAREHOUSE: 'Warehouse / 3PL',
}

const SERVICE_ICON: Record<string, LucideIcon> = {
  MANUFACTURING: Factory,
  COPACKING: PackageIcon,
  LABEL_PRINTING: Printer,
  WAREHOUSE: WarehouseIcon,
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ leadId: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { leadId } = await params
  const partner = await prisma.partner.findUnique({
    where: { id: leadId },
    select: { companyName: true },
  })
  return { title: partner ? `${partner.companyName} — Leads` : 'Lead — Admin' }
}

export default async function LeadDetail({ params }: PageProps) {
  const { leadId } = await params

  const [partner, history, adminUsers] = await Promise.all([
    prisma.partner.findUnique({
      where: { id: leadId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            stripeAccountStatus: true,
            stripeAccountId: true,
            createdAt: true,
          },
        },
        services: true,
        primaryRegion: { select: { id: true, name: true, code: true } },
      },
    }),
    listEntityHistory('Lead', leadId, 50),
    prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, email: true },
      orderBy: { email: 'asc' },
    }),
  ])
  if (!partner) notFound()

  // ---- Notes blob — stored as JSON on Partner.leadNotes -----------------
  const blob = parseNotesBlob(partner.leadNotes)
  const assignedToUserId = blob.assignedToUserId ?? null
  const assignedAdmin =
    assignedToUserId != null
      ? adminUsers.find((u) => u.id === assignedToUserId) ?? null
      : null

  // ---- Snapshot fields (some may live inside leadNotes legacy JSON) ------
  const legacyRaw: Record<string, unknown> = (() => {
    if (!partner.leadNotes) return {}
    try {
      const parsed = JSON.parse(partner.leadNotes)
      // Older rows used leadNotes as a freeform application notes blob.
      // Drop our v2 keys so we don't print them as snapshot fields.
      if (parsed && typeof parsed === 'object') {
        const { notes: _n, assignedToUserId: _a, ...rest } = parsed as Record<string, unknown>
        return rest
      }
      return {}
    } catch {
      return { raw: partner.leadNotes }
    }
  })()

  const tone =
    STATUS_TONE[partner.status] ?? {
      dot: 'bg-ink-400',
      bg: 'bg-ink-50',
      text: 'text-ink-800',
      border: 'border-ink-200',
      label: partner.status,
    }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <AdminDetailHeader
        backHref="/leads"
        backLabel="All leads"
        eyebrow="Inbox · Lead"
        title={partner.companyName}
        meta={
          <>
            {partner.legalName && partner.legalName !== partner.companyName && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-ink-400" aria-hidden="true" />
                  {partner.legalName}
                </span>
                <span className="text-ink-400">·</span>
              </>
            )}
            <a
              href={`mailto:${partner.user.email}`}
              className="inline-flex items-center gap-1 text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
            >
              <Mail className="h-3 w-3" aria-hidden="true" />
              {partner.user.email}
            </a>
            <span className="text-ink-400">·</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3 text-ink-400" aria-hidden="true" />
              Lead since {formatRelative(partner.createdAt)}
            </span>
          </>
        }
        status={
          <div className="flex flex-col items-end gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold uppercase tracking-wider',
                tone.bg,
                tone.text,
                tone.border,
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', tone.dot)} aria-hidden="true" />
              {tone.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] text-ink-700">
              <UserIcon className="h-3 w-3 text-ink-400" aria-hidden="true" />
              {assignedAdmin ? (
                <>Assigned to <span className="font-semibold text-ink-900">{assignedAdmin.email}</span></>
              ) : (
                <span className="text-ink-500">Unassigned</span>
              )}
            </span>
          </div>
        }
      />

      {/* TWO COLUMN GRID */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr,340px]">
        {/* LEFT — Main */}
        <div className="space-y-6">
          <SnapshotCard
            partner={partner}
            legacy={legacyRaw}
            servicesCount={partner.services.length}
            primaryRegionName={partner.primaryRegion?.name ?? null}
          />
          <ServicesCard services={partner.services} />
          <ActivityCard history={history} />
          <NotesCard leadId={leadId} notes={blob.notes} />
        </div>

        {/* RIGHT — Sticky rail */}
        <aside className="space-y-6 md:sticky md:top-6 md:self-start">
          <StatusCard leadId={leadId} currentStatus={partner.status} />
          <AssignCard
            leadId={leadId}
            assignedToUserId={assignedToUserId}
            adminUsers={adminUsers}
          />
          <TagsCard />
          <QuickContactCard
            email={partner.user.email}
            phone={partner.contactPhone}
          />
        </aside>
      </div>
    </div>
  )
}

// =============================================================================
// LEFT COLUMN CARDS
// =============================================================================

type PartnerForSnapshot = {
  contactPhone: string | null
  websiteUrl: string | null
  city: string | null
  state: string | null
  country: string
  addressLine1: string | null
  leadSource: string | null
  createdAt: Date
  user: { stripeAccountId: string | null; stripeAccountStatus: string | null }
}

function SnapshotCard({
  partner,
  legacy,
  servicesCount,
  primaryRegionName,
}: {
  partner: PartnerForSnapshot
  legacy: Record<string, unknown>
  servicesCount: number
  primaryRegionName: string | null
}) {
  const location = [partner.city, partner.state, partner.country].filter(Boolean).join(', ')
  const stripeConnected = Boolean(partner.user.stripeAccountId)

  return (
    <Card icon={Info} title="Lead snapshot" subtitle="What we know so far.">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field
          label="Source"
          value={partner.leadSource ? humanize(partner.leadSource) : '—'}
        />
        <Field
          label="Services declared"
          value={`${servicesCount} declared`}
        />
        <Field
          label="Website"
          value={
            partner.websiteUrl ? (
              <a
                href={partner.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-pink-700 hover:text-pink-800"
              >
                <Globe className="h-3 w-3" aria-hidden="true" />
                {partner.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            ) : (
              '—'
            )
          }
        />
        <Field
          label="Phone"
          value={
            partner.contactPhone ? (
              <a href={`tel:${partner.contactPhone}`} className="inline-flex items-center gap-1 text-pink-700 hover:text-pink-800">
                <Phone className="h-3 w-3" aria-hidden="true" />
                {partner.contactPhone}
              </a>
            ) : (
              '—'
            )
          }
        />
        <Field
          label="Location"
          value={
            location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 text-ink-400" aria-hidden="true" />
                {location}
              </span>
            ) : (
              '—'
            )
          }
        />
        <Field
          label="Primary region"
          value={primaryRegionName ?? '—'}
        />
        <Field
          label="Stripe Connect"
          value={
            stripeConnected ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {partner.user.stripeAccountStatus ?? 'Connected'}
              </span>
            ) : (
              <span className="text-ink-500">Not connected</span>
            )
          }
        />
        <Field
          label="Submitted"
          value={new Date(partner.createdAt).toLocaleString()}
        />
      </dl>

      {/* Legacy application JSON, if any — keeps backward compat with rows
          where /partners/apply stuffed everything into leadNotes. */}
      {Object.keys(legacy).length > 0 && (
        <details className="mt-4 rounded-xl border border-ink-100 bg-ink-50/40 p-3">
          <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-wider text-ink-700">
            Application metadata
          </summary>
          <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(legacy).map(([k, v]) => (
              <Field key={k} label={humanize(k)} value={String(v ?? '—')} />
            ))}
          </dl>
        </details>
      )}
    </Card>
  )
}

function ServicesCard({
  services,
}: {
  services: { id: string; type: string; status: string; disclosureLevel: string }[]
}) {
  return (
    <Card
      icon={Factory}
      title="Services declared"
      subtitle={services.length === 0 ? 'Nothing declared yet' : `${services.length} service${services.length === 1 ? '' : 's'}`}
    >
      {services.length === 0 ? (
        <Empty label="Lead has not declared any services." />
      ) : (
        <ul className="space-y-2">
          {services.map((s) => {
            const Icon = SERVICE_ICON[s.type] ?? Factory
            const label = SERVICE_LABELS[s.type] ?? s.type
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2.5"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50 text-pink-700">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-ink-900">{label}</p>
                  <p className="text-[12px] uppercase tracking-wider text-ink-700">
                    {s.status} · Disclosure: {s.disclosureLevel.replace(/_/g, ' ').toLowerCase()}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function ActivityCard({
  history,
}: {
  history: Array<{
    id: string
    action: string
    fromValue: string | null
    toValue: string | null
    actorRole: string
    at: Date
    payload: unknown
  }>
}) {
  return (
    <Card
      icon={Activity}
      title="Activity timeline"
      subtitle={history.length === 0 ? 'No audit events yet' : `${history.length} event${history.length === 1 ? '' : 's'}`}
    >
      {history.length === 0 ? (
        <Empty label="No activity logged for this lead yet." />
      ) : (
        <ol className="relative">
          {history.map((ev, i) => (
            <li key={ev.id} className="flex gap-3 pb-3 last:pb-0">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex h-2.5 w-2.5 shrink-0 rounded-full ring-4',
                    'bg-pink-500 ring-pink-100',
                  )}
                />
                {i < history.length - 1 && (
                  <span aria-hidden="true" className="mt-1 w-px flex-1 bg-ink-200" />
                )}
              </div>
              <div className="-mt-0.5 min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-[12px] font-semibold text-ink-900">
                    {humanize(ev.action)}
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-600">
                    {ev.actorRole.toLowerCase()}
                  </span>
                  {ev.fromValue && ev.toValue && (
                    <span className="text-[10.5px] text-ink-500">
                      {ev.fromValue} → {ev.toValue}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10.5px] tabular-nums text-ink-500">
                  {new Date(ev.at).toLocaleString()}
                </p>
                {renderPayloadPreview(ev.payload) && (
                  <p className="mt-1 text-[11.5px] text-ink-700">
                    {renderPayloadPreview(ev.payload)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function NotesCard({
  leadId,
  notes,
}: {
  leadId: string
  notes: LeadNoteUI[]
}) {
  return (
    <Card
      icon={StickyNote}
      title="Notes"
      subtitle={notes.length === 0 ? 'No notes yet' : `${notes.length} note${notes.length === 1 ? '' : 's'}`}
    >
      <NotesThread leadId={leadId} notes={notes} />
    </Card>
  )
}

// =============================================================================
// Reusable bits (mirror orders/[orderId] page)
// =============================================================================

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
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
            {subtitle && (
              <p className="mt-1 text-[11.5px] text-ink-500">{subtitle}</p>
            )}
          </div>
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
        {label}
      </dt>
      <dd className="mt-0.5 text-[12.5px] text-ink-900">{value}</dd>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function humanize(s: string): string {
  return s
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatRelative(d: Date | string): string {
  const t = new Date(d).getTime()
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function renderPayloadPreview(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const preview = obj.preview ?? obj.partnerEmail ?? obj.companyName ?? obj.reason
  if (preview != null && typeof preview === 'string') return preview
  return null
}

function parseNotesBlob(raw: string | null | undefined): {
  notes: LeadNoteUI[]
  assignedToUserId?: string | null
} {
  if (!raw) return { notes: [] }
  try {
    const parsed = JSON.parse(raw) as {
      notes?: Array<{
        id: string
        body: string
        authorEmail?: string
        at: string
      }>
      assignedToUserId?: string | null
    }
    return {
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.map((n) => ({
            id: n.id,
            body: n.body,
            authorEmail: n.authorEmail ?? '',
            at: n.at,
          }))
        : [],
      assignedToUserId: parsed.assignedToUserId ?? null,
    }
  } catch {
    return { notes: [] }
  }
}
