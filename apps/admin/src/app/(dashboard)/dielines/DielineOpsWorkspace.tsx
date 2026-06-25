'use client'

// Die-line Operations workspace (P1). Triage Inbox + lenses (By packaging type ·
// By partner) over partner-submitted die-lines. Search + status chips + priority
// sort + attention badges. Every row opens the Curator; PARTNER_CONFIRMED rows
// also get inline verify / send-back. docs/DIELINE_MANAGEMENT_UX.md §3.

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  SquareDashedBottom,
  SlidersHorizontal,
  Search,
  Inbox,
  Layers,
  Building2,
  ChevronDown,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Sparkles,
  Boxes,
  Shapes,
  Wand2,
} from 'lucide-react'
import { DielineReviewActions } from './DielineReviewActions'
import { mapDielinesToShape } from './actions'

export interface ShapeOption {
  id: string
  name: string
  category: string
  widthMm: number
  heightMm: number
}

export interface OpsRow {
  id: string
  status: string
  decorationMethod: string
  originalFileFormat: string | null
  widthMm: number | null
  heightMm: number | null
  parseScore: number | null
  partnerConfirmedAt: string | null
  adminVerifiedAt: string | null
  uploadedAt: string
  isNormalized: boolean
  thumbnailUrl: string | null
  packagingTypeName: string
  partnerName: string
  offeringCount: number
  canonicalShapeName: string | null
  clusterKey: string | null
}

type Lens = 'inbox' | 'packaging' | 'partner' | 'shape'
type StatusFilter = 'all' | 'awaiting' | 'lowconf' | 'active'

const LOW_CONF = 0.7

// Priority for the Inbox sort: lower = more urgent.
function priority(r: OpsRow): number {
  if (r.status === 'PARTNER_CONFIRMED') return 0
  if (r.status === 'UPLOADED' || r.status === 'PARSED') return 1
  if (r.parseScore != null && r.parseScore < LOW_CONF && !r.isNormalized) return 1
  if (r.status === 'ADMIN_VERIFIED') return 2
  return 3 // ACTIVE / normalized
}

function pretty(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase()
}

export function DielineOpsWorkspace({ rows, shapeOptions }: { rows: OpsRow[]; shapeOptions: ShapeOption[] }) {
  const [lens, setLens] = useState<Lens>('inbox')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const kpis = useMemo(() => {
    let awaiting = 0
    let lowConf = 0
    let active = 0
    for (const r of rows) {
      if (r.status === 'PARTNER_CONFIRMED') awaiting++
      if (r.parseScore != null && r.parseScore < LOW_CONF && !r.isNormalized) lowConf++
      if (r.status === 'ACTIVE') active++
    }
    return { awaiting, lowConf, active, total: rows.length }
  }, [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter === 'awaiting' && r.status !== 'PARTNER_CONFIRMED') return false
      if (statusFilter === 'active' && r.status !== 'ACTIVE') return false
      if (statusFilter === 'lowconf' && !(r.parseScore != null && r.parseScore < LOW_CONF && !r.isNormalized)) return false
      if (!needle) return true
      return (
        r.partnerName.toLowerCase().includes(needle) ||
        r.packagingTypeName.toLowerCase().includes(needle) ||
        pretty(r.decorationMethod).includes(needle)
      )
    })
  }, [rows, q, statusFilter])

  const inboxRows = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const pa = priority(a)
        const pb = priority(b)
        if (pa !== pb) return pa - pb
        // within a band: lower parse confidence first, then most recent
        const sa = a.parseScore ?? 1
        const sb = b.parseScore ?? 1
        if (sa !== sb) return sa - sb
        return (b.partnerConfirmedAt ?? b.uploadedAt).localeCompare(a.partnerConfirmedAt ?? a.uploadedAt)
      }),
    [filtered],
  )

  const groups = useMemo(() => {
    if (lens === 'inbox') return null
    const key =
      lens === 'packaging'
        ? (r: OpsRow) => r.packagingTypeName
        : lens === 'partner'
          ? (r: OpsRow) => r.partnerName
          : // shape lens: mapped → canonical name; unmapped → its aspect cluster
            (r: OpsRow) => r.canonicalShapeName ?? `Unmapped · ${r.clusterKey ?? 'other'}`
    const map = new Map<string, OpsRow[]>()
    for (const r of filtered) {
      const k = key(r)
      const arr = map.get(k) ?? []
      arr.push(r)
      map.set(k, arr)
    }
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items,
        awaiting: items.filter((i) => i.status === 'PARTNER_CONFIRMED').length,
        unmappedIds: items.filter((i) => !i.canonicalShapeName).map((i) => i.id),
      }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name))
  }, [filtered, lens])

  return (
    <div className="space-y-6">
      {/* Cream hero */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">Packaging · Die-line Operations</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Die-line Operations
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Triage partner-submitted die-lines, normalize their geometry + mandatory-element frames, and activate them for
          the Design Studio. Originals are never modified.
        </p>
        <Link
          href="/dielines/readiness"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
        >
          <Boxes className="h-3.5 w-3.5" /> Product readiness →
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Awaiting review" value={kpis.awaiting} icon={Clock} tone="violet" active={statusFilter === 'awaiting'} onClick={() => setStatusFilter(statusFilter === 'awaiting' ? 'all' : 'awaiting')} />
        <Kpi label="Low confidence" value={kpis.lowConf} icon={AlertTriangle} tone="amber" active={statusFilter === 'lowconf'} onClick={() => setStatusFilter(statusFilter === 'lowconf' ? 'all' : 'lowconf')} />
        <Kpi label="Active" value={kpis.active} icon={CheckCircle2} tone="emerald" active={statusFilter === 'active'} onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')} />
        <Kpi label="Total die-lines" value={kpis.total} icon={Boxes} tone="ink" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
      </div>

      {/* Lens tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white p-1">
          <LensTab icon={Inbox} label="Inbox" active={lens === 'inbox'} onClick={() => setLens('inbox')} />
          <LensTab icon={Shapes} label="By shape" active={lens === 'shape'} onClick={() => setLens('shape')} />
          <LensTab icon={Layers} label="By packaging" active={lens === 'packaging'} onClick={() => setLens('packaging')} />
          <LensTab icon={Building2} label="By partner" active={lens === 'partner'} onClick={() => setLens('partner')} />
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search partner, packaging, decoration…"
            className="w-[280px] rounded-full border border-ink-200 bg-white py-2 pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : lens === 'inbox' ? (
        <ul className="overflow-hidden rounded-2xl border border-ink-200 bg-white divide-y divide-ink-100">
          {inboxRows.map((r) => (
            <RowCard key={r.id} r={r} />
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          {groups!.map((g) => (
            <GroupSection
              key={g.name}
              name={g.name}
              count={g.items.length}
              awaiting={g.awaiting}
              bar={
                lens === 'shape' && g.unmappedIds.length > 0 ? (
                  <BatchMapBar unmappedIds={g.unmappedIds} shapeOptions={shapeOptions} />
                ) : null
              }
            >
              {g.items.map((r) => (
                <RowCard key={r.id} r={r} hideContextName={lens} />
              ))}
            </GroupSection>
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  icon: typeof Clock
  tone: 'violet' | 'amber' | 'emerald' | 'ink'
  active: boolean
  onClick: () => void
}) {
  const iconBg = {
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    ink: 'bg-ink-100 text-ink-700',
  }[tone]
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border bg-white p-4 text-left transition-colors hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
        active ? 'border-pink-300 ring-1 ring-pink-200' : 'border-ink-200'
      }`}
    >
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <p className="mt-3 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-600">{label}</p>
      <p className="mt-0.5 font-display text-[28px] font-semibold leading-none tabular-nums text-ink-900">{value}</p>
    </button>
  )
}

function LensTab({ icon: Icon, label, active, onClick }: { icon: typeof Inbox; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
        active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function GroupSection({ name, count, awaiting, children, bar }: { name: string; count: number; awaiting: number; children: React.ReactNode; bar?: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-ink-100 bg-zinc-50/60 px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="text-[13px] font-semibold text-ink-900">{name}</span>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{count}</span>
        </span>
        {awaiting > 0 && (
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
            {awaiting} awaiting
          </span>
        )}
      </button>
      {bar}
      {open && <ul className="divide-y divide-ink-100">{children}</ul>}
    </section>
  )
}

function BatchMapBar({ unmappedIds, shapeOptions }: { unmappedIds: string[]; shapeOptions: ShapeOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [shapeId, setShapeId] = useState('')

  function run() {
    if (!shapeId) return
    start(async () => {
      const r = await mapDielinesToShape(unmappedIds, shapeId)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Mapped ${unmappedIds.length} die-line${unmappedIds.length === 1 ? '' : 's'}`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-pink-50/40 px-4 py-2">
      <Wand2 className="h-3.5 w-3.5 text-pink-600" />
      <span className="text-[11.5px] font-medium text-ink-700">
        {unmappedIds.length} unmapped — map the whole cluster at once:
      </span>
      <select
        value={shapeId}
        onChange={(e) => setShapeId(e.target.value)}
        disabled={pending}
        className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <option value="">Choose canonical shape…</option>
        {shapeOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({o.widthMm}×{o.heightMm}mm)
          </option>
        ))}
      </select>
      <button
        onClick={run}
        disabled={pending || !shapeId}
        className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
      >
        {pending ? 'Mapping…' : `Map ${unmappedIds.length}`}
      </button>
    </div>
  )
}

function RowCard({ r, hideContextName }: { r: OpsRow; hideContextName?: Lens }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Thumb url={r.thumbnailUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-semibold text-ink-900">{r.packagingTypeName}</p>
          <StatusBadges r={r} />
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-500">
          {hideContextName !== 'partner' && <>{r.partnerName} · </>}
          {pretty(r.decorationMethod)} · {r.originalFileFormat ?? 'no file'}
          {r.widthMm && r.heightMm ? ` · ${r.widthMm}×${r.heightMm}mm` : ''}
          {r.offeringCount > 0 ? ` · used by ${r.offeringCount} offering${r.offeringCount === 1 ? '' : 's'}` : ''}
          {r.canonicalShapeName ? ` · ▸ ${r.canonicalShapeName}` : ''}
        </p>
      </div>
      <div className="inline-flex shrink-0 items-center gap-2">
        {r.status === 'PARTNER_CONFIRMED' && <DielineReviewActions dielineId={r.id} />}
        <Link
          href={`/dielines/${r.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> {r.isNormalized ? 'Re-curate' : 'Curate'}
        </Link>
      </div>
    </li>
  )
}

function Thumb({ url }: { url: string | null }) {
  if (url) {
    return (
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-ink-100 bg-zinc-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="h-full w-full object-contain" />
      </div>
    )
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-ink-200 bg-ink-50/40">
      <SquareDashedBottom className="h-5 w-5 text-ink-300" />
    </div>
  )
}

function StatusBadges({ r }: { r: OpsRow }) {
  const badges: React.ReactNode[] = []
  if (r.status === 'PARTNER_CONFIRMED')
    badges.push(<Badge key="aw" tone="violet" icon={Clock}>Awaiting review</Badge>)
  if (r.status === 'UPLOADED') badges.push(<Badge key="new" tone="blue" icon={Sparkles}>New upload</Badge>)
  if (r.status === 'PARSED') badges.push(<Badge key="pa" tone="sky">Parsed</Badge>)
  if (r.parseScore != null && r.parseScore < LOW_CONF && !r.isNormalized)
    badges.push(
      <Badge key="lc" tone="amber" icon={AlertTriangle}>
        {Math.round(r.parseScore * 100)}% parse
      </Badge>,
    )
  if (r.status === 'ACTIVE') badges.push(<Badge key="ac" tone="emerald" icon={CheckCircle2}>Active</Badge>)
  else if (r.status === 'ADMIN_VERIFIED') badges.push(<Badge key="vf" tone="emerald">Verified</Badge>)
  return <>{badges}</>
}

function Badge({ tone, icon: Icon, children }: { tone: 'violet' | 'blue' | 'sky' | 'amber' | 'emerald'; icon?: typeof Clock; children: React.ReactNode }) {
  const cls = {
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${cls}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-16 text-center">
      <SquareDashedBottom className="mx-auto mb-2 h-8 w-8 text-ink-300" />
      <p className="text-[13px] font-semibold text-ink-700">No die-lines match</p>
      <p className="mt-0.5 text-[12px] text-ink-500">Try clearing the search or status filter.</p>
    </div>
  )
}
