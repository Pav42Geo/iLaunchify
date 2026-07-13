'use client'

// Room label Studio — client editor (A8). The creator (or an NDA-gated invited
// designer with canEdit) places BRAND-layer artwork on the maker's normalized
// die-line. The substrate is a locked, non-selectable Fabric group sent to the
// back and NEVER persisted into designJson (it's re-added from ctx each open);
// on submit it's excluded from the canvas export and re-supplied to the composer
// so it appears exactly once. Regulated panels are a follow-up (reserved zones).
//
// Fabric v6 idioms mirror packages/ui/src/canvas (loadSVGFromString →
// groupSVGElements; canvas.toSVG()). Reuses the addText factory from
// @ilaunchify/ui so brand text matches the product Studio.

import { useCallback, useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import { addText, composeLabelProofSvg, extractSvgInner, CANVAS_PROPERTIES_TO_INCLUDE } from '@ilaunchify/ui'
import { creatorSubmitLabelProof } from '@/app/(dashboard)/rooms/[roomId]/actions'
import type { RoomLabelStudioContext } from '@/lib/room-label-design'
import { saveRoomLabelDesign } from './actions'

const PX_PER_MM = 3.0
const SUBSTRATE_TYPE = 'die-substrate' // marker so it's filtered out of designJson
const AUTOSAVE_MS = 1500

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function RoomLabelStudioClient({
  ctx,
  currentUserId,
  currentUserName,
}: {
  ctx: RoomLabelStudioContext
  currentUserId: string
  currentUserName: string
}) {
  void currentUserId // C6 (presence/lock) will use these
  void currentUserName
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const canvasRef = useRef<fabric.Canvas | null>(null)
  const substrateRef = useRef<fabric.FabricObject | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canEdit = ctx.access.canEdit
  const pxW = Math.round(ctx.widthMm * PX_PER_MM)
  const pxH = Math.round(ctx.heightMm * PX_PER_MM)

  // Serialize only the brand layer (substrate is re-added from ctx each open).
  const brandDesignJson = useCallback((canvas: fabric.Canvas) => {
    const json = canvas.toObject([...CANVAS_PROPERTIES_TO_INCLUDE]) as { objects?: Array<{ customType?: string }> }
    if (Array.isArray(json.objects)) {
      json.objects = json.objects.filter((o) => o.customType !== SUBSTRATE_TYPE)
    }
    return json
  }, [])

  const scheduleSave = useCallback(() => {
    if (!canEdit) return
    const canvas = canvasRef.current
    if (!canvas) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      const res = await saveRoomLabelDesign(ctx.roomId, brandDesignJson(canvas))
      setSaveState(res.ok ? 'saved' : 'error')
    }, AUTOSAVE_MS)
  }, [canEdit, ctx.roomId, brandDesignJson])

  // Mount the Fabric canvas once.
  useEffect(() => {
    const el = canvasElRef.current
    if (!el || canvasRef.current) return
    let disposed = false

    const canvas = new fabric.Canvas(el, {
      width: pxW,
      height: pxH,
      backgroundColor: '#FFFFFF',
      selection: canEdit,
      preserveObjectStacking: true,
    })
    canvasRef.current = canvas

    async function init() {
      // 1. Restore the saved brand layer (clears the canvas first).
      if (ctx.designJson && typeof ctx.designJson === 'object') {
        try {
          await canvas.loadFromJSON(ctx.designJson)
        } catch {
          /* corrupt draft — start from the substrate only */
        }
      }
      if (disposed) return

      // 2. Add the maker's normalized die-line as a locked substrate, sent to back.
      try {
        const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ctx.widthMm} ${ctx.heightMm}">${ctx.substrateSvg}</svg>`
        const parsed = await fabric.loadSVGFromString(doc)
        const objects = (parsed.objects ?? []).filter((o): o is fabric.FabricObject => o != null)
        if (objects.length > 0) {
          const group = fabric.util.groupSVGElements(objects, parsed.options)
          group.set({
            left: 0,
            top: 0,
            originX: 'left',
            originY: 'top',
            scaleX: PX_PER_MM,
            scaleY: PX_PER_MM,
            selectable: false,
            evented: false,
            hoverCursor: 'default',
          })
          group.set('customType', SUBSTRATE_TYPE)
          substrateRef.current = group as unknown as fabric.FabricObject
          canvas.add(group as unknown as fabric.FabricObject)
          canvas.sendObjectToBack(group as unknown as fabric.FabricObject)
        }
      } catch {
        /* substrate failed to parse — editor still usable, proof will note it */
      }
      if (disposed) return

      // Non-editors: freeze every object.
      if (!canEdit) {
        canvas.forEachObject((o) => o.set({ selectable: false, evented: false }))
      }
      canvas.requestRenderAll()

      if (canEdit) {
        canvas.on('object:added', scheduleSave)
        canvas.on('object:modified', scheduleSave)
        canvas.on('object:removed', scheduleSave)
      }
      setReady(true)
    }
    void init()

    return () => {
      disposed = true
      if (saveTimer.current) clearTimeout(saveTimer.current)
      canvasRef.current = null
      void canvas.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addHeading = () => {
    const canvas = canvasRef.current
    if (!canvas || !canEdit) return
    addText(canvas, 'Your brand', { fontSize: 40, fontWeight: 700 })
  }
  const addBodyText = () => {
    const canvas = canvasRef.current
    if (!canvas || !canEdit) return
    addText(canvas, 'Tagline or copy', { fontSize: 22 })
  }

  async function handleSubmit() {
    const canvas = canvasRef.current
    if (!canvas || submitting) return
    setSubmitting(true)
    setSubmitError(null)

    // Exclude the substrate from the canvas export, then re-supply it to the
    // composer so it appears exactly once (and stays the immutable base layer).
    const substrate = substrateRef.current
    if (substrate) canvas.remove(substrate)
    const brandDoc = canvas.toSVG()
    if (substrate) {
      canvas.add(substrate)
      canvas.sendObjectToBack(substrate)
    }

    const brandInner = extractSvgInner(brandDoc)
    const scaledBrand = `<g transform="scale(${(1 / PX_PER_MM).toFixed(5)})">${brandInner}</g>`
    const svg = composeLabelProofSvg(
      { substrate: ctx.substrateSvg, brand: scaledBrand, regulated: null },
      { widthMm: ctx.widthMm, heightMm: ctx.heightMm },
    )

    const res = await creatorSubmitLabelProof(ctx.roomId, ctx.labelObjectId, {
      svg,
      dielineId: ctx.dielineId,
      widthMm: ctx.widthMm,
      heightMm: ctx.heightMm,
      designId: ctx.designId,
      ...(ctx.latestVersion > 0 ? { designVersion: ctx.latestVersion } : {}),
    })

    if (res.ok) {
      window.location.href = `/rooms/${ctx.roomId}?object=${ctx.labelObjectId}`
      return
    }
    setSubmitError(res.error ?? 'Could not send the proof — please try again.')
    setSubmitting(false)
  }

  return (
    <div className="flex h-screen flex-col bg-ink-50">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-ink-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink-900">{ctx.briefTitle} · Label</div>
          <div className="truncate text-xs text-ink-500">
            Designing on {ctx.partnerName}’s die-line
            {!canEdit && ' · view only'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && (
            <span className="text-xs text-ink-400">
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''}
            </span>
          )}
          <a href={`/rooms/${ctx.roomId}`} className="rounded-full border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50">
            Back to room
          </a>
          {ctx.access.isOwner && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !ready}
              className="rounded-full bg-pink-600 px-5 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send to room for approval'}
            </button>
          )}
        </div>
      </header>

      {submitError && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">{submitError}</div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Tool rail (editors only) */}
        {canEdit && (
          <aside className="w-48 shrink-0 space-y-2 border-r border-ink-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Brand layer</div>
            <button onClick={addHeading} className="w-full rounded-lg border border-ink-200 px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-50">
              + Heading
            </button>
            <button onClick={addBodyText} className="w-full rounded-lg border border-ink-200 px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-50">
              + Text
            </button>
            <p className="pt-2 text-[11px] leading-tight text-ink-400">
              The die-line and any regulated panels are locked — you design the brand layer only.
            </p>
          </aside>
        )}

        {/* Canvas stage */}
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
          <div className="rounded-lg bg-white shadow-sm ring-1 ring-ink-200">
            <canvas ref={canvasElRef} />
          </div>
        </main>
      </div>
    </div>
  )
}
