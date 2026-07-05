'use client'

// F — job-progress capture panel (docs/EMAIL_NOTIFICATION_CENTER.md Part 3).
// The daily-flow surface: post a note, revise the ETA, or mark a milestone —
// each lands on the creator's live order timeline and notifies them. This is
// the operation-level signal MES/ShipBob-style customers expect between
// "accepted" and "shipped".

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MessageSquarePlus, CalendarClock, Flag } from 'lucide-react'
import { submitProgressUpdate, type ProgressKind, type ProgressUpdateRow } from './progress-actions'

const MILESTONES: Array<{ slug: string; label: string }> = [
  { slug: 'materials-sourced', label: 'Materials sourced' },
  { slug: 'in-production', label: 'In production' },
  { slug: 'proof-approved-plates-made', label: 'Plates made' },
  { slug: 'printing', label: 'Printing' },
  { slug: 'finishing', label: 'Finishing' },
  { slug: 'quality-inspection', label: 'Quality inspection' },
  { slug: 'packaging', label: 'Packaging' },
  { slug: 'awaiting-pickup', label: 'Awaiting carrier pickup' },
]

const KIND_TABS: Array<{ kind: ProgressKind; label: string; icon: typeof MessageSquarePlus }> = [
  { kind: 'NOTE', label: 'Note', icon: MessageSquarePlus },
  { kind: 'ETA', label: 'Revise ETA', icon: CalendarClock },
  { kind: 'MILESTONE', label: 'Milestone', icon: Flag },
]

export function ProgressUpdatePanel({
  dispatchId,
  canPost,
  currentEtaAt,
  updates,
}: {
  dispatchId: string
  canPost: boolean
  currentEtaAt: string | null
  updates: ProgressUpdateRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<ProgressKind>('NOTE')
  const [body, setBody] = useState('')
  const [etaAt, setEtaAt] = useState('')
  const [milestone, setMilestone] = useState(MILESTONES[0]?.slug ?? 'in-production')

  async function submit() {
    setBusy(true)
    try {
      const r = await submitProgressUpdate({
        dispatchId,
        kind,
        body: body || undefined,
        etaAt: kind === 'ETA' ? etaAt : undefined,
        milestone: kind === 'MILESTONE' ? milestone : undefined,
      })
      if (r.ok) {
        toast.success('Update posted — the creator can see it on their order timeline')
        setBody('')
        setEtaAt('')
        router.refresh()
      } else {
        toast.error(r.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200'

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
          <MessageSquarePlus className="h-4 w-4 text-ink-500" aria-hidden="true" /> Progress updates
        </h2>
        {currentEtaAt && (
          <span className="rounded-full bg-ink-50 px-3 py-1 text-[12px] tabular-nums text-ink-700">
            Current ETA{' '}
            {new Date(currentEtaAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] text-ink-600">
        Keep the creator in the loop between states — notes, revised ETAs, and milestones show up
        on their live order timeline the moment you post them.
      </p>

      {canPost && (
        <div className="mt-4 rounded-xl border border-ink-100 p-4">
          <div className="flex gap-1" role="tablist" aria-label="Update type">
            {KIND_TABS.map((t) => (
              <button
                key={t.kind}
                type="button"
                role="tab"
                aria-selected={kind === t.kind}
                onClick={() => setKind(t.kind)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                  kind === t.kind ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'
                }`}
              >
                <t.icon className="h-3.5 w-3.5" aria-hidden="true" /> {t.label}
              </button>
            ))}
          </div>

          {kind === 'ETA' && (
            <label className="mt-3 block text-[12px] font-medium text-ink-700">
              Revised delivery date
              <input type="date" value={etaAt} onChange={(e) => setEtaAt(e.target.value)} className={inputCls} />
            </label>
          )}
          {kind === 'MILESTONE' && (
            <label className="mt-3 block text-[12px] font-medium text-ink-700">
              Milestone
              <select value={milestone} onChange={(e) => setMilestone(e.target.value)} className={inputCls}>
                {MILESTONES.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="mt-3 block text-[12px] font-medium text-ink-700">
            {kind === 'NOTE' ? 'Update' : 'Note (optional)'}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder={
                kind === 'ETA'
                  ? 'Why the date moved (the creator sees this)…'
                  : 'What happened on the floor today…'
              }
              className={inputCls}
            />
          </label>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="rounded-full bg-ink-900 px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              {busy ? 'Posting…' : 'Post update'}
            </button>
          </div>
        </div>
      )}

      {updates.length > 0 ? (
        <ul className="mt-4 divide-y divide-ink-50 rounded-xl border border-ink-100">
          {updates.map((u) => (
            <li key={u.id} className="px-4 py-2.5 text-[13px]">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                  {u.kind === 'ETA' ? 'ETA' : u.kind === 'MILESTONE' ? 'Milestone' : u.kind === 'PHOTO' ? 'Photo' : 'Note'}
                </span>
                <span className="text-ink-900">
                  {u.kind === 'ETA' && u.etaAt
                    ? `Revised to ${new Date(u.etaAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
                    : u.kind === 'MILESTONE' && u.milestone
                      ? u.milestone.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
                      : (u.body ?? '')}
                </span>
                <time className="ml-auto text-[11.5px] tabular-nums text-ink-400">
                  {new Date(u.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </time>
              </div>
              {u.kind !== 'NOTE' && u.body && <p className="mt-0.5 text-[12px] text-ink-600">{u.body}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[12px] text-ink-500">
          No updates yet{canPost ? ' — post the first one above.' : '.'}
        </p>
      )}
    </section>
  )
}
