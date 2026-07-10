'use client'

// Co-creation Collaboration Room shell — PRESENTATIONAL-ONLY, shared by the
// creator and partner apps via a `mode` prop (same pattern as
// PackagingStudioShell). UX contract: iLaunchify-cocreation-demo.html screens
// ④/⑤/⑥ — object rail + versioned detail + per-line comments + label pins +
// activity/decision log + messages.
//
// All mutations arrive as async callbacks (server-action wrappers owned by
// the rendering app, which also owns membership guards + revalidation). Copy
// rule: "milestone payment protection", never "escrow" (Stripe posture).

import * as React from 'react'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { Textarea } from '../primitives/textarea'

// ---------------------------------------------------------------------------
// Data shapes (serialized by the server page — no Prisma types cross here)
// ---------------------------------------------------------------------------

export interface RoomObjectVersion {
  version: number
  /** { rows: [{name, amount, note}] } for RECIPE; { fields: [{label, value}] } otherwise. */
  payload: unknown
  submittedByPartner: boolean
  createdAt: string
}

export interface RoomObjectComment {
  id: string
  anchor: string | null
  authorRole: string // CREATOR | PARTNER
  body: string
  createdAt: string
}

export interface RoomShellObject {
  id: string
  kind: string // RECIPE | LABEL | PACKAGING | SAMPLE | SPEC_SHEET
  status: string // BuildObjectStatus
  currentVersion: number
  versions: RoomObjectVersion[]
  comments: RoomObjectComment[]
}

export interface RoomShellMilestone {
  id: string
  kind: string
  status: string
}

export interface RoomShellEvent {
  id: string
  kind: string
  data: Record<string, unknown>
  createdAt: string
}

export interface RoomShellMessage {
  id: string
  authorRole: string
  body: string
  createdAt: string
}

type Result = { ok: boolean; error?: string }

export interface CoCreationRoomShellProps {
  mode: 'creator' | 'partner'
  briefTitle: string
  creatorName: string
  partnerName: string
  ndaSigned: boolean
  objects: RoomShellObject[]
  milestones: RoomShellMilestone[]
  events: RoomShellEvent[]
  messages: RoomShellMessage[]
  onSubmitVersion: (objectId: string, payload: Record<string, unknown>) => Promise<Result>
  onReview: (objectId: string, decision: 'APPROVE' | 'REQUEST_CHANGES', note?: string) => Promise<Result>
  onReopen: (objectId: string) => Promise<Result>
  onComment: (objectId: string, body: string, anchor?: string) => Promise<Result>
  onMessage: (body: string) => Promise<Result>
}

// ---------------------------------------------------------------------------

const OBJECT_META: Record<string, { icon: string; name: string }> = {
  RECIPE: { icon: '🧪', name: 'Recipe / formula' },
  LABEL: { icon: '🏷️', name: 'Label' },
  PACKAGING: { icon: '📦', name: 'Packaging' },
  SAMPLE: { icon: '🧾', name: 'Sample & spec' },
  SPEC_SHEET: { icon: '📄', name: 'Spec sheet' },
}

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-ink-100 text-ink-700' },
  SUBMITTED: { label: 'Submitted', cls: 'bg-info-50 text-info-800' },
  IN_REVIEW: { label: 'Needs review', cls: 'bg-info-50 text-info-800' },
  CHANGES_REQUESTED: { label: 'Changes requested', cls: 'bg-warning-50 text-warning-800' },
  APPROVED: { label: 'Approved', cls: 'bg-success-50 text-success-800' },
  LOCKED: { label: 'Locked', cls: 'bg-success-50 text-success-800' },
}

const MILESTONE_LABEL: Record<string, string> = {
  DISCOVERY: 'Discovery',
  SAMPLE: 'Sample',
  TOOLING: 'Tooling',
  PRODUCTION: 'Production',
}

interface RecipeRow {
  name: string
  amount: string
  note: string
}

function recipeRows(payload: unknown): RecipeRow[] {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { rows?: unknown }).rows)) {
    return ((payload as { rows: unknown[] }).rows as Partial<RecipeRow>[]).map((r) => ({
      name: String(r.name ?? ''),
      amount: String(r.amount ?? ''),
      note: String(r.note ?? ''),
    }))
  }
  return []
}

interface FieldRow {
  label: string
  value: string
}

function fieldRows(payload: unknown): FieldRow[] {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { fields?: unknown }).fields)) {
    return ((payload as { fields: unknown[] }).fields as Partial<FieldRow>[]).map((f) => ({
      label: String(f.label ?? ''),
      value: String(f.value ?? ''),
    }))
  }
  return []
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

function eventText(e: RoomShellEvent): string {
  const by = typeof e.data.by === 'string' ? e.data.by : 'Someone'
  const kind = typeof e.data.objectKind === 'string' ? (OBJECT_META[e.data.objectKind]?.name ?? e.data.objectKind) : ''
  const v = typeof e.data.version === 'number' ? ` v${e.data.version}` : ''
  switch (e.kind) {
    case 'ROOM_CREATED':
      return 'Room created — NDA + private workspace initialized.'
    case 'OBJECT_SUBMITTED':
      return `${by} submitted ${kind}${v} for review.`
    case 'OBJECT_APPROVED':
      return `${by} approved ${kind}${v}.`
    case 'OBJECT_CHANGES_REQUESTED':
      return `${by} requested changes on ${kind}${v}.`
    case 'OBJECT_REOPENED':
      return `${by} re-opened ${kind}.`
    case 'COMMENT_ADDED':
      return `${by} commented on ${kind}.`
    default:
      return e.kind.replaceAll('_', ' ').toLowerCase()
  }
}

// ---------------------------------------------------------------------------

export function CoCreationRoomShell(props: CoCreationRoomShellProps) {
  const { mode, objects } = props
  const [selectedId, setSelectedId] = React.useState(objects[0]?.id ?? '')
  const [rightTab, setRightTab] = React.useState<'activity' | 'messages'>('activity')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const selected = objects.find((o) => o.id === selectedId) ?? objects[0]

  async function run(fn: () => Promise<Result>) {
    setBusy(true)
    setError(null)
    const res = await fn()
    if (!res.ok) setError(res.error ?? 'Something went wrong')
    setBusy(false)
  }

  const released = props.milestones.filter((m) => m.status === 'RELEASED').length
  const meName = mode === 'creator' ? props.creatorName : props.partnerName

  return (
    <div className="space-y-4">
      {/* Room header */}
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-ink-200 bg-white px-5 py-4">
        <div>
          <div className="font-display text-ui-subhead">{props.briefTitle}</div>
          <div className="text-ui-caption text-ink-500">
            {props.creatorName} × {props.partnerName} · viewing as {meName} (
            {mode === 'creator' ? 'Creator' : 'Manufacturer'})
          </div>
        </div>
        <span className="ml-auto rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-ui-caption font-medium text-ink-700">
          {props.ndaSigned ? '● NDA signed' : 'NDA pending — finalizing with counsel'}
        </span>
        <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-ui-caption font-medium text-ink-700">
          🔒 IP: Creator-owned
        </span>
      </div>

      {error ? (
        <p className="rounded-xl bg-danger-50 px-3 py-2 text-ui-caption text-danger-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_300px]">
        {/* Left rail — objects + milestones */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-ink-200 bg-white p-3">
            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Build objects
            </div>
            {objects.map((o) => {
              const meta = OBJECT_META[o.kind] ?? { icon: '▫️', name: o.kind }
              const pill = STATUS_PILL[o.status] ?? STATUS_PILL.DRAFT!
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className={`flex w-full items-center gap-2 rounded-2xl px-2 py-2.5 text-left transition ${
                    selected?.id === o.id ? 'bg-ink-50 ring-1 ring-ink-200' : 'hover:bg-ink-50'
                  }`}
                >
                  <span className="text-lg">{meta.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui-caption font-semibold">{meta.name}</span>
                    <span className="block text-[11px] text-ink-500">
                      v{o.currentVersion}
                      {o.comments.length ? ` · ${o.comments.length} comments` : ''}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pill.cls}`}>
                    {pill.label}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="rounded-3xl border border-ink-200 bg-white p-4">
            <div className="flex items-center justify-between text-ui-caption">
              <span className="font-semibold">Milestones · payment protection</span>
              <span className="text-ink-500">
                {released} / {props.milestones.length} released
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-pink-500"
                style={{ width: `${props.milestones.length ? (released / props.milestones.length) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-2 space-y-1">
              {props.milestones.map((m) => (
                <div key={m.id} className="flex justify-between text-[11px] text-ink-500">
                  <span>{MILESTONE_LABEL[m.kind] ?? m.kind}</span>
                  <span>{m.status === 'PENDING' ? 'awaiting terms' : m.status.toLowerCase().replaceAll('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center — object detail */}
        <div className="rounded-3xl border border-ink-200 bg-white p-5">
          {selected ? (
            <ObjectDetail
              key={selected.id}
              object={selected}
              mode={mode}
              meName={meName}
              busy={busy}
              onSubmitVersion={(payload) => run(() => props.onSubmitVersion(selected.id, payload))}
              onReview={(d, note) => run(() => props.onReview(selected.id, d, note))}
              onReopen={() => run(() => props.onReopen(selected.id))}
              onComment={(body, anchor) => run(() => props.onComment(selected.id, body, anchor))}
            />
          ) : (
            <p className="text-ui-caption text-ink-500">No objects in this room yet.</p>
          )}
        </div>

        {/* Right rail — activity / messages */}
        <div className="flex min-h-[420px] flex-col rounded-3xl border border-ink-200 bg-white">
          <div className="flex gap-1 border-b border-ink-100 p-2">
            {(
              [
                ['activity', 'Activity log'],
                ['messages', 'Messages'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setRightTab(t)}
                className={`flex-1 rounded-xl px-3 py-1.5 text-ui-caption font-medium transition ${
                  rightTab === t ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {rightTab === 'activity' ? (
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {props.events.length === 0 ? (
                <p className="text-ui-caption text-ink-500">Decisions and submissions log here.</p>
              ) : (
                props.events.map((e) => (
                  <div key={e.id} className="flex gap-2">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pink-500" aria-hidden />
                    <div>
                      <div className="text-ui-caption">{eventText(e)}</div>
                      <div className="text-[10px] text-ink-500">{timeAgo(e.createdAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <MessagesRail
              messages={props.messages}
              mode={mode}
              creatorName={props.creatorName}
              partnerName={props.partnerName}
              busy={busy}
              onSend={(body) => run(() => props.onMessage(body))}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Object detail (versions, comments, role-aware actions)
// ---------------------------------------------------------------------------

function ObjectDetail({
  object,
  mode,
  meName,
  busy,
  onSubmitVersion,
  onReview,
  onReopen,
  onComment,
}: {
  object: RoomShellObject
  mode: 'creator' | 'partner'
  meName: string
  busy: boolean
  onSubmitVersion: (payload: Record<string, unknown>) => void
  onReview: (decision: 'APPROVE' | 'REQUEST_CHANGES', note?: string) => void
  onReopen: () => void
  onComment: (body: string, anchor?: string) => void
}) {
  const meta = OBJECT_META[object.kind] ?? { icon: '▫️', name: object.kind }
  const pill = STATUS_PILL[object.status] ?? STATUS_PILL.DRAFT!
  const versions = [...object.versions].sort((a, b) => a.version - b.version)
  const latest = versions[versions.length - 1]
  const [viewVersion, setViewVersion] = React.useState<number | 'compare'>(latest?.version ?? 1)
  const [editing, setEditing] = React.useState(false)
  const [changeNote, setChangeNote] = React.useState('')
  const [openThread, setOpenThread] = React.useState<string | null>(null)
  const [reply, setReply] = React.useState('')

  const viewing =
    viewVersion === 'compare' ? latest : versions.find((v) => v.version === viewVersion) ?? latest
  const previous = versions.length > 1 ? versions[versions.length - 2] : undefined

  const isRecipe = object.kind === 'RECIPE'
  const rows = viewing ? recipeRows(viewing.payload) : []
  const prevRows = previous ? recipeRows(previous.payload) : []
  const fields = viewing ? fieldRows(viewing.payload) : []

  // Editable draft for a new version, seeded from the latest payload.
  const [draftRows, setDraftRows] = React.useState<RecipeRow[]>(() =>
    latest ? recipeRows(latest.payload) : [{ name: '', amount: '', note: '' }],
  )
  const [draftFields, setDraftFields] = React.useState<FieldRow[]>(() =>
    latest && fieldRows(latest.payload).length
      ? fieldRows(latest.payload)
      : [{ label: '', value: '' }],
  )

  const canSubmit =
    (mode === 'partner' || object.kind === 'LABEL') &&
    (object.status === 'DRAFT' || object.status === 'CHANGES_REQUESTED')
  const canReview = mode === 'creator' && object.status === 'IN_REVIEW'
  const canReopen = object.status === 'APPROVED' || object.status === 'LOCKED'

  function threadFor(anchor: string) {
    return object.comments.filter((c) => c.anchor === anchor)
  }

  function submitDraft() {
    const payload = isRecipe
      ? { rows: draftRows.filter((r) => r.name.trim()) }
      : { fields: draftFields.filter((f) => f.label.trim() || f.value.trim()) }
    onSubmitVersion(payload)
    setEditing(false)
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{meta.icon}</span>
        <div>
          <h2 className="font-display text-ui-subhead">{meta.name}</h2>
          <p className="text-[11px] text-ink-500">
            v{object.currentVersion}
            {latest ? ` · ${latest.submittedByPartner ? 'submitted by maker' : 'submitted by creator'}` : ' · nothing submitted yet'}
          </p>
        </div>
        <span className={`ml-auto rounded-full px-3 py-1 text-ui-caption font-semibold ${pill.cls}`}>
          {pill.label}
        </span>
      </div>

      {/* Version tabs */}
      {versions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {versions.map((v) => (
            <button
              key={v.version}
              type="button"
              onClick={() => setViewVersion(v.version)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                viewVersion === v.version
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 text-ink-500 hover:text-ink-900'
              }`}
            >
              v{v.version}
              {v.version === latest?.version ? ' · latest' : ''}
            </button>
          ))}
          {versions.length > 1 && isRecipe ? (
            <button
              type="button"
              onClick={() => setViewVersion('compare')}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                viewVersion === 'compare'
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 text-ink-500 hover:text-ink-900'
              }`}
            >
              ⇄ Compare
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Body */}
      <div className="mt-4 space-y-1.5">
        {versions.length === 0 && !editing ? (
          <p className="rounded-xl bg-ink-50 px-3 py-4 text-center text-ui-caption text-ink-500">
            {canSubmit
              ? 'Nothing submitted yet — add the first version below.'
              : `Waiting for ${mode === 'creator' ? 'the maker' : 'the creator'} to submit the first version.`}
          </p>
        ) : isRecipe ? (
          rows.map((r, idx) => {
            const anchor = `row:${idx}`
            const thread = threadFor(anchor)
            const prev = viewVersion === 'compare' ? prevRows[idx] : undefined
            const changed =
              prev && (prev.amount !== r.amount || prev.name !== r.name || prev.note !== r.note)
            return (
              <div key={idx}>
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                    changed ? 'border-pink-500 bg-pink-50' : 'border-ink-100'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-ui-caption">
                    <b>{r.name}</b>
                    {r.note ? <span className="text-ink-500"> · {r.note}</span> : null}
                  </span>
                  <span className="text-ui-caption font-semibold">
                    {r.amount}
                    {changed && prev ? (
                      <span className="ml-1 text-[10px] font-semibold text-pink-700">
                        (was {prev.amount || '—'})
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenThread(openThread === anchor ? null : anchor)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      thread.length
                        ? 'border-pink-500 bg-pink-50 text-pink-700'
                        : 'border-ink-200 text-ink-500 hover:text-ink-900'
                    }`}
                  >
                    💬{thread.length ? ` ${thread.length}` : ''}
                  </button>
                </div>
                {openThread === anchor ? (
                  <div className="ml-4 mt-1 space-y-2 rounded-xl bg-ink-50 p-3">
                    {thread.map((c) => (
                      <div key={c.id} className="text-ui-caption">
                        <b>{c.authorRole === 'CREATOR' ? 'Creator' : 'Maker'}</b>{' '}
                        <span className="text-[10px] text-ink-500">{timeAgo(c.createdAt)}</span>
                        <div>{c.body}</div>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder={`Reply as ${meName}…`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && reply.trim()) {
                            onComment(reply, anchor)
                            setReply('')
                          }
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || !reply.trim()}
                        onClick={() => {
                          onComment(reply, anchor)
                          setReply('')
                        }}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        ) : fields.length ? (
          fields.map((f, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-xl border border-ink-100 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-ui-caption font-semibold">{f.label}</span>
              <span className="text-ui-caption text-ink-700">{f.value}</span>
            </div>
          ))
        ) : versions.length > 0 ? (
          <p className="rounded-xl bg-ink-50 px-3 py-3 text-ui-caption text-ink-500">
            This version has no structured fields.
          </p>
        ) : null}
      </div>

      {/* New-version editor */}
      {canSubmit ? (
        editing || versions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-ink-200 p-3">
            <div className="text-ui-caption font-semibold">
              {versions.length === 0 ? 'First version' : `Submit v${object.currentVersion + 1}`}
            </div>
            <div className="mt-2 space-y-2">
              {isRecipe
                ? draftRows.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={r.name}
                        placeholder="Ingredient"
                        onChange={(e) =>
                          setDraftRows((rows2) => rows2.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                        }
                        className="flex-1"
                      />
                      <Input
                        value={r.amount}
                        placeholder="Amount"
                        onChange={(e) =>
                          setDraftRows((rows2) => rows2.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                        }
                        className="w-24"
                      />
                      <Input
                        value={r.note}
                        placeholder="Note"
                        onChange={(e) =>
                          setDraftRows((rows2) => rows2.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
                        }
                        className="w-28"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove row"
                        onClick={() => setDraftRows((rows2) => rows2.filter((_, j) => j !== i))}
                      >
                        ✕
                      </Button>
                    </div>
                  ))
                : draftFields.map((f, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={f.label}
                        placeholder="Field (e.g. Format)"
                        onChange={(e) =>
                          setDraftFields((fs) => fs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                        }
                        className="w-40"
                      />
                      <Input
                        value={f.value}
                        placeholder="Value (e.g. 12oz slim can, matte)"
                        onChange={(e) =>
                          setDraftFields((fs) => fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                        }
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove field"
                        onClick={() => setDraftFields((fs) => fs.filter((_, j) => j !== i))}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    isRecipe
                      ? setDraftRows((r) => [...r, { name: '', amount: '', note: '' }])
                      : setDraftFields((f) => [...f, { label: '', value: '' }])
                  }
                >
                  ＋ Add {isRecipe ? 'ingredient' : 'field'}
                </Button>
                <span className="flex-1" />
                {versions.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                ) : null}
                <Button variant="primary" size="sm" disabled={busy} onClick={submitDraft}>
                  {busy ? 'Submitting…' : 'Submit for review'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <Button variant="pink" size="sm" onClick={() => setEditing(true)}>
              Submit new version
            </Button>
          </div>
        )
      ) : null}

      {/* Review actions */}
      {canReview ? (
        <div className="mt-4 rounded-2xl border border-ink-200 p-3">
          <div className="text-ui-caption text-ink-500">Review the {meta.name.toLowerCase()}, then decide.</div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Optional note with your decision…"
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onReview('REQUEST_CHANGES', changeNote.trim() || undefined)}
            >
              Request changes
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => onReview('APPROVE', changeNote.trim() || undefined)}
            >
              ✓ Approve v{object.currentVersion}
            </Button>
          </div>
        </div>
      ) : null}

      {canReopen ? (
        <div className="mt-4 flex items-center gap-3">
          <span className="text-ui-caption text-ink-500">
            {object.status === 'APPROVED' ? '✓ Approved — any change re-opens review.' : '🔒 Locked.'}
          </span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" disabled={busy} onClick={onReopen}>
            Re-open
          </Button>
        </div>
      ) : null}

      {/* Unanchored comments */}
      <ObjectThread
        comments={object.comments.filter((c) => !c.anchor)}
        meName={meName}
        busy={busy}
        onComment={(b) => onComment(b)}
      />
    </div>
  )
}

function ObjectThread({
  comments,
  meName,
  busy,
  onComment,
}: {
  comments: RoomObjectComment[]
  meName: string
  busy: boolean
  onComment: (body: string) => void
}) {
  const [body, setBody] = React.useState('')
  return (
    <div className="mt-5 border-t border-ink-100 pt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        Discussion ({comments.length})
      </div>
      <div className="mt-2 space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="text-ui-caption">
            <b>{c.authorRole === 'CREATOR' ? 'Creator' : 'Maker'}</b>{' '}
            <span className="text-[10px] text-ink-500">{timeAgo(c.createdAt)}</span>
            <div>{c.body}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Comment as ${meName}…`}
          rows={2}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !body.trim()}
          onClick={() => {
            onComment(body)
            setBody('')
          }}
        >
          Send
        </Button>
      </div>
    </div>
  )
}

function MessagesRail({
  messages,
  mode,
  creatorName,
  partnerName,
  busy,
  onSend,
}: {
  messages: RoomShellMessage[]
  mode: 'creator' | 'partner'
  creatorName: string
  partnerName: string
  busy: boolean
  onSend: (body: string) => void
}) {
  const [body, setBody] = React.useState('')
  const meRole = mode === 'creator' ? 'CREATOR' : 'PARTNER'
  const endRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-ui-caption text-ink-500">
            Say hello — everything stays in the room, no email needed.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.authorRole === meRole
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-ui-caption ${
                    mine ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-900'
                  }`}
                >
                  <div className={`text-[10px] font-semibold ${mine ? 'text-ink-300' : 'text-ink-500'}`}>
                    {m.authorRole === 'CREATOR' ? creatorName : partnerName}
                  </div>
                  {m.body}
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 border-t border-ink-100 p-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && body.trim()) {
              onSend(body)
              setBody('')
            }
          }}
        />
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !body.trim()}
          onClick={() => {
            onSend(body)
            setBody('')
          }}
        >
          ➤
        </Button>
      </div>
    </>
  )
}
