'use client'

// =============================================================================
// Partner Die-line Studio (standalone /dielines/[id], for the packaging library).
// Thin wrapper around the shared <DielineFrameEditor> — this file owns only the
// data wiring + the top-bar chrome (Exit · status · Saved · preflight · Confirm)
// and persistence to the PackagingDieline row. The editor itself is shared with
// the inline product-builder studio (docs/HANDOFF-TO-CODE-dieline-studio-dedupe.md).
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, ArrowLeft, CircleCheck } from 'lucide-react'
import {
  DEFAULT_FRAME_LAYOUT,
  type FrameLayout,
  type LayoutIssue,
  type NormBox,
} from '@ilaunchify/ui'
import type { DielineEditorData } from '../../../(dashboard)/packaging/dielines/actions'
import {
  saveDielineFrames,
  saveDielineGeometry,
  confirmDieline,
} from '../../../(dashboard)/packaging/dielines/actions'
import {
  DielineFrameEditor,
  type DielineSaveStatus,
} from '../../../(dashboard)/packaging/dielines/DielineFrameEditor'

function asBox(v: unknown, fallback: NormBox): NormBox {
  const b = v as Partial<NormBox> | null
  if (b && typeof b.x === 'number' && typeof b.y === 'number' && typeof b.w === 'number' && typeof b.h === 'number') {
    return { x: b.x, y: b.y, w: b.w, h: b.h }
  }
  return fallback
}

export function DielineStudioShell({ dieline }: { dieline: DielineEditorData }) {
  const [confirmed, setConfirmed] = useState(
    dieline.status === 'PARTNER_CONFIRMED' || dieline.status === 'ADMIN_VERIFIED' || dieline.status === 'ACTIVE',
  )

  const initialLayout = (dieline.frames as FrameLayout) ?? structuredClone(DEFAULT_FRAME_LAYOUT)
  const initialTrim = asBox(dieline.trimBox, { x: 0, y: 0, w: 1, h: 1 })
  const initialSafe = asBox(dieline.safeAreaBox, { x: 0.05, y: 0.05, w: 0.9, h: 0.9 })

  async function onConfirm(issues: LayoutIssue[]) {
    if (issues.length > 0) {
      toast.error(`Fix ${issues.length} preflight issue${issues.length === 1 ? '' : 's'} first.`)
      return
    }
    const r = await confirmDieline(dieline.id)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    setConfirmed(true)
    toast.success('Die-line confirmed')
  }

  return (
    <DielineFrameEditor
      initialLayout={initialLayout}
      initialTrim={initialTrim}
      initialSafe={initialSafe}
      backdrop={{ fileUrl: dieline.fileUrl ?? null, isPdf: dieline.originalFileFormat === 'PDF' }}
      meta={{
        format: dieline.originalFileFormat,
        widthMm: dieline.widthMm,
        heightMm: dieline.heightMm,
        bleedMm: dieline.bleedMm,
      }}
      onPersist={async ({ layout, trim, safe }) => {
        const [a, b] = await Promise.all([
          saveDielineFrames(dieline.id, layout),
          saveDielineGeometry(dieline.id, { trimBox: trim, safeAreaBox: safe }),
        ])
        return { ok: a.ok && b.ok, error: !a.ok ? a.error : !b.ok ? b.error : undefined }
      }}
      topBarLeft={
        <>
          <Link href="/packaging/dielines" className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600 hover:text-ink-900">
            <ArrowLeft className="h-4 w-4" /> Exit
          </Link>
          <span className="h-5 w-px bg-ink-200" />
          <span className="font-display text-[15px] font-bold tracking-tight">Die-line Studio</span>
          <span className="rounded-full border border-ink-200 bg-zinc-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-600">
            {dieline.status.replace(/_/g, ' ').toLowerCase()}
          </span>
        </>
      }
      topBarRight={({ issues, saveStatus }: { issues: LayoutIssue[]; saveStatus: DielineSaveStatus }) => (
        <>
          <span className="flex items-center gap-1 text-[11.5px] text-ink-500">
            {saveStatus === 'saving' ? 'Saving…' : (<><Check className="h-3.5 w-3.5 text-emerald-600" /> Saved</>)}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              issues.length === 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
            title={issues.map((i) => i.message).join('\n')}
          >
            {issues.length === 0 ? 'Preflight clear' : `${issues.length} to fix`}
          </span>
          <button
            onClick={() => onConfirm(issues)}
            disabled={confirmed || issues.length > 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50"
          >
            <CircleCheck className="h-4 w-4" /> {confirmed ? 'Confirmed' : 'Confirm die-line'}
          </button>
        </>
      )}
    />
  )
}
