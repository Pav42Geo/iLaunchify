'use client'

// Per-channel kill switches + maintenance note (CHANNEL_MANAGEMENT_SPEC §3.4a).
// Ingest / Push pause are capability-level switches — the channel stays visible
// to creators, but one direction of traffic stops. The note is surfaced
// verbatim in the creator hub while a pause is on.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { cn } from '@ilaunchify/ui'
import { Download, Upload, MessageSquareText } from 'lucide-react'
import { setChannelOps } from './actions'

export function ChannelOpsControls({
  channelId,
  initialIngestPaused,
  initialPushPaused,
  initialNote,
}: {
  channelId: string
  initialIngestPaused: boolean
  initialPushPaused: boolean
  initialNote: string | null
}) {
  const [ingestPaused, setIngestPaused] = useState(initialIngestPaused)
  const [pushPaused, setPushPaused] = useState(initialPushPaused)
  const [note, setNote] = useState(initialNote ?? '')
  const [editingNote, setEditingNote] = useState(false)
  const [isPending, startTransition] = useTransition()

  function flip(kind: 'ingest' | 'push') {
    const next = kind === 'ingest' ? !ingestPaused : !pushPaused
    const setter = kind === 'ingest' ? setIngestPaused : setPushPaused
    setter(next)
    startTransition(async () => {
      const res = await setChannelOps({
        channelId,
        ...(kind === 'ingest' ? { ingestPaused: next } : { pushPaused: next }),
      })
      if (!res.ok) {
        setter(!next)
        toast.error(res.error)
      } else {
        toast.success(
          next
            ? `${kind === 'ingest' ? 'Order ingest' : 'Listing push'} paused — set a maintenance note so creators know why.`
            : `${kind === 'ingest' ? 'Order ingest' : 'Listing push'} resumed`,
        )
      }
    })
  }

  function saveNote() {
    setEditingNote(false)
    startTransition(async () => {
      const res = await setChannelOps({ channelId, maintenanceNote: note })
      if (!res.ok) toast.error(res.error)
      else toast.success(note.trim() ? 'Maintenance note saved' : 'Maintenance note cleared')
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <PauseChip
          icon={Download}
          label="Ingest"
          paused={ingestPaused}
          disabled={isPending}
          onClick={() => flip('ingest')}
        />
        <PauseChip
          icon={Upload}
          label="Push"
          paused={pushPaused}
          disabled={isPending}
          onClick={() => flip('push')}
        />
        <button
          type="button"
          onClick={() => setEditingNote((v) => !v)}
          title={note.trim() ? `Maintenance note: ${note}` : 'Set a maintenance note'}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase transition',
            note.trim()
              ? 'border-info-300 bg-info-50 text-info-700'
              : 'border-ink-200 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-700',
          )}
        >
          <MessageSquareText className="h-3 w-3" />
          Note
        </button>
      </div>
      {editingNote && (
        <div className="flex items-center gap-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Creator-facing note, e.g. “Shopify API maintenance — syncs resume 14:00 UTC”"
            className="w-[340px] rounded-lg border border-ink-200 px-2 py-1 text-[12px] focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-200"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- opened by explicit click
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveNote()
              if (e.key === 'Escape') setEditingNote(false)
            }}
          />
          <button
            type="button"
            onClick={saveNote}
            disabled={isPending}
            className="rounded-full bg-ink-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}

function PauseChip({
  icon: Icon,
  label,
  paused,
  disabled,
  onClick,
}: {
  icon: typeof Download
  label: string
  paused: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={paused ? `${label} is PAUSED platform-wide — click to resume` : `Pause ${label.toLowerCase()} platform-wide`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase transition disabled:opacity-50',
        paused
          ? 'border-danger-300 bg-danger-50 text-danger-700'
          : 'border-success-200 bg-success-50 text-success-700 hover:border-success-400',
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
      <span className="font-medium normal-case">{paused ? 'paused' : 'on'}</span>
    </button>
  )
}
