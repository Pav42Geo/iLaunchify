'use client'

// =============================================================================
// Design Studio (Admin mode) — Die-line Curation library. Rendered on the shared
// PackagingStudioShell chrome (no 3D toggle — curation is 2D/canvas). The Library
// drawer lists die-lines grouped BY CATEGORY with search + status filter. "Curate"
// opens the shared DielineFrameEditor full-view "in the same place"; the top bar
// carries a Mark-verified action. Reuses the die-line curation actions.
// =============================================================================

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, Loader2, PencilRuler, Search, ArrowLeft, ShieldCheck, Check, ChevronDown, ChevronRight } from 'lucide-react'
import {
  PackagingStudioShell,
  DielineFrameEditor,
  DEFAULT_FRAME_LAYOUT,
  type StudioRailItem,
} from '@ilaunchify/ui'
import { getDielineEditorData, saveDielineFrames, markDielineVerified, type DielineEditorData } from './actions'
import type { DielineLibraryData, DielineLibItem } from './loader'

const STATUS_STYLE: Record<string, string> = {
  UPLOADED: 'bg-ink-100 text-ink-600',
  PARSED: 'bg-sky-50 text-sky-700',
  PARTNER_CONFIRMED: 'bg-amber-50 text-amber-700',
  ADMIN_VERIFIED: 'bg-pink-50 text-pink-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  ARCHIVED: 'bg-ink-100 text-ink-400',
}
const prettyStatus = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export function DielineLibraryClient({ data }: { data: DielineLibraryData }) {
  const router = useRouter()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState<string>('ALL')
  const [loadingId, setLoadingId] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<{ item: DielineLibItem; data: DielineEditorData } | null>(null)
  const [verifying, setVerifying] = React.useState(false)
  const [verified, setVerified] = React.useState(false)

  const statuses = React.useMemo(() => {
    const set = new Set<string>()
    data.groups.forEach((g) => g.items.forEach((it) => set.add(it.status)))
    return Array.from(set).sort()
  }, [data])

  async function curate(item: DielineLibItem) {
    setLoadingId(item.id)
    const d = await getDielineEditorData(item.id).catch(() => null)
    setLoadingId(null)
    if (d) {
      setVerified(item.verified)
      setEditing({ item, data: d })
    }
  }

  async function onVerify() {
    if (!editing) return
    setVerifying(true)
    const res = await markDielineVerified(editing.item.id).catch(() => null)
    setVerifying(false)
    if (res && res.ok) {
      setVerified(true)
      router.refresh()
    }
  }

  // Curation canvas — opens "in the same place" (full view).
  if (editing) {
    const ed = editing
    return (
      <div className="fixed inset-0 z-[80] flex flex-col bg-white">
        <DielineFrameEditor
          initialLayout={structuredClone(ed.data.frames ?? DEFAULT_FRAME_LAYOUT)}
          initialTrim={ed.data.trim}
          initialSafe={ed.data.safe}
          backdrop={{ fileUrl: ed.data.backdropUrl, isPdf: false }}
          onPersist={async ({ layout, trim, safe }) => {
            const res = await saveDielineFrames(ed.item.id, { layout, trim, safe }).catch(() => null)
            return res && res.ok ? { ok: true } : { ok: false, error: (res && !res.ok && res.error) || 'Could not save.' }
          }}
          topBarLeft={
            <button onClick={() => setEditing(null)} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:border-ink-400">
              <ArrowLeft className="h-4 w-4" /> Back to library
              <span className="ml-1 max-w-[200px] truncate text-ink-400">· {ed.item.shapeName}</span>
            </button>
          }
          topBarRight={() => (
            <button
              onClick={onVerify}
              disabled={verifying || verified}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${verified ? 'bg-emerald-50 text-emerald-700' : 'border border-pink-500 bg-pink-500 text-white hover:bg-pink-600'}`}
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : verified ? <Check className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {verified ? 'Verified' : 'Mark verified'}
            </button>
          )}
        />
      </div>
    )
  }

  const rail: StudioRailItem[] = [{ key: 'library', label: 'Die-lines', icon: <Inbox className="h-5 w-5" /> }]

  const drawer = (
    <LibraryDrawer
      groups={data.groups}
      counts={data.counts}
      q={q}
      onQ={setQ}
      status={status}
      onStatus={setStatus}
      statuses={statuses}
      onCurate={curate}
      loadingId={loadingId}
    />
  )

  return (
    <div className="fixed inset-0 z-[70]">
      <PackagingStudioShell
        mode="admin"
        studioName="Die-line Curation (Admin)"
        brand={<div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-ink-900 text-white"><PencilRuler className="h-4 w-4" /></div>}
        centerSlot={
          <span className="inline-flex items-center gap-2 text-[12px] text-ink-500">
            <span className="h-5 w-px bg-ink-200" />
            <span className="font-medium text-ink-700">{data.counts.total} die-lines · {data.counts.categories} categories</span>
          </span>
        }
        showViewToggle={false}
        rail={rail}
        activeTool="library"
        onToolChange={() => undefined}
        drawer={drawer}
      >
        <div className="max-w-sm rounded-2xl border border-dashed border-ink-300 bg-white/70 p-8 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-ink-50 text-ink-400"><PencilRuler className="h-5 w-5" /></div>
          <div className="text-[13.5px] font-semibold text-ink-800">Curate a die-line</div>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-[12px] leading-relaxed text-ink-500">Pick a die-line from the <b>library</b> (grouped by category) to lay its frames on the canvas and mark it verified.</p>
        </div>
      </PackagingStudioShell>
    </div>
  )
}

function LibraryDrawer({
  groups,
  counts,
  q,
  onQ,
  status,
  onStatus,
  statuses,
  onCurate,
  loadingId,
}: {
  groups: DielineLibraryData['groups']
  counts: DielineLibraryData['counts']
  q: string
  onQ: (v: string) => void
  status: string
  onStatus: (v: string) => void
  statuses: string[]
  onCurate: (item: DielineLibItem) => void
  loadingId: string | null
}) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  const query = q.trim().toLowerCase()

  const shownGroups = groups
    .map((g) => ({
      category: g.category,
      items: g.items.filter((it) => {
        if (status !== 'ALL' && it.status !== status) return false
        if (query && !(`${it.shapeName} ${it.packagingName}`.toLowerCase().includes(query))) return false
        return true
      }),
    }))
    .filter((g) => g.items.length > 0)

  function toggle(cat: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-100 p-3">
        <div className="mb-2 grid grid-cols-3 gap-1.5 text-center">
          <Stat label="Total" value={counts.total} />
          <Stat label="Framed" value={counts.withFrames} />
          <Stat label="Verified" value={counts.verified} />
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input value={q} onChange={(e) => onQ(e.target.value)} placeholder="Search die-lines…" className="w-full rounded-full border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-[12.5px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <StatusChip label="All" active={status === 'ALL'} onClick={() => onStatus('ALL')} />
          {statuses.map((s) => (
            <StatusChip key={s} label={prettyStatus(s)} active={status === s} onClick={() => onStatus(s)} />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {shownGroups.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-ink-400">No die-lines match.</p>
        ) : (
          shownGroups.map((g) => {
            const isCollapsed = collapsed.has(g.category)
            return (
              <div key={g.category} className="mb-2">
                <button onClick={() => toggle(g.category)} className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500 hover:bg-ink-50">
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {g.category}
                  <span className="ml-auto rounded-full bg-ink-100 px-1.5 py-0.5 text-[9.5px] text-ink-500">{g.items.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="mt-1 space-y-1.5">
                    {g.items.map((it) => (
                      <div key={it.id} className="rounded-xl border border-ink-200 bg-white p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-semibold text-ink-900">{it.shapeName}</p>
                            <p className="truncate text-[10.5px] text-ink-400">{it.packagingName}{it.dims ? ` · ${it.dims}` : ''}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${STATUS_STYLE[it.status] ?? 'bg-ink-100 text-ink-500'}`}>{prettyStatus(it.status)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            onClick={() => onCurate(it)}
                            disabled={loadingId === it.id}
                            className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
                          >
                            {loadingId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <PencilRuler className="h-3 w-3" />} Curate
                          </button>
                          {it.hasFrames && <span className="text-[10px] text-emerald-600">✓ framed</span>}
                          {it.verified && <span className="inline-flex items-center gap-0.5 text-[10px] text-pink-600"><ShieldCheck className="h-3 w-3" /> verified</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-1 py-1.5">
      <p className="text-[15px] font-bold tabular-nums text-ink-900">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
    </div>
  )
}

function StatusChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition ${active ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}>
      {label}
    </button>
  )
}
