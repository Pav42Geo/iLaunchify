'use client'

// Room label Studio — client editor (A8 + C6 presence/lock + C9 attribution).
// The creator (or an NDA-gated invited designer with canEdit) places BRAND-layer
// artwork on the maker's normalized die-line. The substrate is a locked Fabric
// group sent to the back and NEVER persisted into designJson (re-added from ctx
// each open); on submit it's excluded from the canvas export and re-supplied to
// composeLabelProofSvg so it appears exactly once. Regulated panels are a
// follow-up (reserved zones).
//
// C6: editing is turn-based (D-W4). Effective editability = access.canEdit AND
// holding the lock; pokeEditLock is polled to acquire/heartbeat/wait, the server
// save also re-checks the lock. Fabric v6 idioms mirror packages/ui/src/canvas.

import { useCallback, useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import { addText, composeLabelProofSvg, extractSvgInner, CANVAS_PROPERTIES_TO_INCLUDE, NutritionFactsSvg } from '@ilaunchify/ui'
import { creatorSubmitLabelProof } from '@/app/(dashboard)/rooms/[roomId]/actions'
import { requestDesignReviewAction } from '@/app/(dashboard)/rooms/[roomId]/design-team-actions'
import type { RoomLabelStudioContext } from '@/lib/room-label-design'
import { saveRoomLabelDesign, pokeEditLock, releaseEditLock, type EditLockView } from './actions'

const PX_PER_MM = 3.0
const SUBSTRATE_TYPE = 'die-substrate' // marker so it's filtered out of designJson
const AUTOSAVE_MS = 1500
const LOCK_POLL_MS = 20_000 // < EDIT_LOCK_STALE_MS (90s) so the holder stays live

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
  void currentUserId
  void currentUserName
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const canvasRef = useRef<fabric.Canvas | null>(null)
  const substrateRef = useRef<fabric.FabricObject | null>(null)
  const regulatedRef = useRef<HTMLDivElement | null>(null) // hidden A11 panel, serialized at submit
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lock, setLock] = useState<EditLockView | null>(null)
  const [reviewPending, setReviewPending] = useState(ctx.openReviewPending)
  const [requestingReview, setRequestingReview] = useState(false)

  const hasEditAccess = ctx.access.canEdit
  const notReady = ctx.submitReadiness.outcome === 'NOT_READY'
  const canEditNow = hasEditAccess && !!lock?.iHold
  const canEditNowRef = useRef(false)
  canEditNowRef.current = canEditNow

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
    if (!canEditNowRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      const res = await saveRoomLabelDesign(ctx.roomId, brandDesignJson(canvas))
      setSaveState(res.ok ? 'saved' : 'error')
    }, AUTOSAVE_MS)
  }, [ctx.roomId, brandDesignJson])

  // Mount the Fabric canvas once (interactivity toggled later by the lock).
  useEffect(() => {
    const el = canvasElRef.current
    if (!el || canvasRef.current) return
    let disposed = false

    const canvas = new fabric.Canvas(el, {
      width: pxW,
      height: pxH,
      backgroundColor: '#FFFFFF',
      selection: false,
      preserveObjectStacking: true,
    })
    canvasRef.current = canvas

    async function init() {
      if (ctx.designJson && typeof ctx.designJson === 'object') {
        try {
          await canvas.loadFromJSON(ctx.designJson)
        } catch {
          /* corrupt draft — start from the substrate only */
        }
      }
      if (disposed) return

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
        /* substrate failed to parse — editor still usable */
      }
      if (disposed) return

      canvas.on('object:added', scheduleSave)
      canvas.on('object:modified', scheduleSave)
      canvas.on('object:removed', scheduleSave)
      canvas.requestRenderAll()
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

  // Toggle brand-object interactivity with the lock (substrate stays locked).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.selection = canEditNow
    canvas.forEachObject((o) => {
      if ((o as { customType?: string }).customType === SUBSTRATE_TYPE) return
      o.set({ selectable: canEditNow, evented: canEditNow })
    })
    if (!canEditNow) canvas.discardActiveObject()
    canvas.requestRenderAll()
  }, [canEditNow, ready])

  // C6 lock: poll to acquire/heartbeat/wait; release on leave.
  useEffect(() => {
    if (!hasEditAccess) return
    let alive = true
    const tick = async () => {
      const v = await pokeEditLock(ctx.roomId)
      if (alive) setLock(v)
    }
    void tick()
    const iv = setInterval(tick, LOCK_POLL_MS)
    const onHide = () => {
      void releaseEditLock(ctx.roomId)
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      alive = false
      clearInterval(iv)
      window.removeEventListener('pagehide', onHide)
      void releaseEditLock(ctx.roomId)
    }
  }, [hasEditAccess, ctx.roomId])

  // C7 — mark this design ready for internal review (designer or owner; the
  // service skips a self-ping for the owner). One PENDING request per room.
  const requestReview = async () => {
    if (requestingReview || reviewPending) return
    setRequestingReview(true)
    const r = await requestDesignReviewAction(ctx.roomId, ctx.designId)
    if (r.ok) setReviewPending(true)
    setRequestingReview(false)
  }

  const requestControl = async () => setLock(await pokeEditLock(ctx.roomId))
  const giveControl = async () => {
    await releaseEditLock(ctx.roomId)
    setLock(await pokeEditLock(ctx.roomId))
  }

  const addHeading = () => {
    const canvas = canvasRef.current
    if (canvas && canEditNow) addText(canvas, 'Your brand', { fontSize: 40, fontWeight: 700 })
  }
  const addBodyText = () => {
    const canvas = canvasRef.current
    if (canvas && canEditNow) addText(canvas, 'Tagline or copy', { fontSize: 22 })
  }

  async function handleSubmit() {
    const canvas = canvasRef.current
    if (!canvas || submitting) return
    setSubmitting(true)
    setSubmitError(null)

    const substrate = substrateRef.current
    if (substrate) canvas.remove(substrate)
    const brandDoc = canvas.toSVG()
    if (substrate) {
      canvas.add(substrate)
      canvas.sendObjectToBack(substrate)
    }

    const brandInner = extractSvgInner(brandDoc)
    const scaledBrand = `<g transform="scale(${(1 / PX_PER_MM).toFixed(5)})">${brandInner}</g>`

    // A11 — composite the deterministic regulated panel (rendered hidden as a
    // real, style-isolated SVG) into its die-line frame, in mm. The panel's
    // viewBox is 320 units wide (authoritative geometry); scale to the frame.
    let regulatedLayer: string | null = null
    const regulatedFrames: string[] = []
    if (ctx.regulated && regulatedRef.current) {
      const svgEl = regulatedRef.current.querySelector('svg')
      if (svgEl) {
        const b = ctx.regulated.frameBoxMm
        regulatedLayer = `<g transform="translate(${b.x.toFixed(3)} ${b.y.toFixed(3)}) scale(${(b.w / 320).toFixed(5)})">${extractSvgInner(svgEl.outerHTML)}</g>`
        regulatedFrames.push('NUTRITION_FACTS')
      }
    }

    const svg = composeLabelProofSvg(
      { substrate: ctx.substrateSvg, brand: scaledBrand, regulated: regulatedLayer },
      { widthMm: ctx.widthMm, heightMm: ctx.heightMm },
    )

    const res = await creatorSubmitLabelProof(ctx.roomId, ctx.labelObjectId, {
      svg,
      dielineId: ctx.dielineId,
      widthMm: ctx.widthMm,
      heightMm: ctx.heightMm,
      designId: ctx.designId,
      regulatedFrames,
      ...(ctx.latestVersion > 0 ? { designVersion: ctx.latestVersion } : {}),
    })

    if (res.ok) {
      window.location.href = `/rooms/${ctx.roomId}?object=${ctx.labelObjectId}`
      return
    }
    setSubmitError(res.error ?? 'Could not send the proof — please try again.')
    setSubmitting(false)
  }

  // Presence line (C6).
  const presence = (() => {
    if (!hasEditAccess) return 'View only'
    if (!lock) return null
    if (lock.iHold) {
      return lock.pendingRequesterName ? `${lock.pendingRequesterName} wants to edit` : 'You’re editing'
    }
    return lock.holderName ? `${lock.holderName} is editing — you’re viewing` : null
  })()

  return (
    <div className="flex h-screen flex-col bg-ink-50">
      <header className="flex items-center justify-between gap-4 border-b border-ink-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink-900">{ctx.briefTitle} · Label</div>
          <div className="truncate text-xs text-ink-500">Designing on {ctx.partnerName}’s die-line</div>
        </div>
        <div className="flex items-center gap-3">
          {presence && <span className="text-xs text-ink-500">{presence}</span>}
          {/* Holder sees a takeover request → can hand control over. */}
          {lock?.iHold && lock.pendingRequesterName && (
            <button type="button" onClick={giveControl} className="rounded-full border border-pink-300 px-3 py-1.5 text-xs font-medium text-pink-700 hover:bg-pink-50">
              Give control
            </button>
          )}
          {/* Waiter can request the turn. */}
          {hasEditAccess && lock && !lock.iHold && (
            <button type="button" onClick={requestControl} className="rounded-full border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
              {lock.state === 'WAITING' ? 'Requested…' : 'Request edit control'}
            </button>
          )}
          {canEditNow && (
            <span className="text-xs text-ink-400">
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''}
            </span>
          )}
          {hasEditAccess && (
            <button
              type="button"
              onClick={requestReview}
              disabled={reviewPending || requestingReview}
              title="Ask the room to review this design"
              className="rounded-full border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60"
            >
              {reviewPending ? 'Review requested' : requestingReview ? 'Requesting…' : 'Ready for review'}
            </button>
          )}
          <a href={`/rooms/${ctx.roomId}`} className="rounded-full border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50">
            Back to room
          </a>
          {ctx.access.isOwner && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !ready}
              title={notReady ? (ctx.submitReadiness.blocking[0] ?? 'Recipe Facts are incomplete — you can still send') : undefined}
              className="rounded-full bg-pink-600 px-5 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send to room for approval'}
            </button>
          )}
        </div>
      </header>

      {submitError && <div className="border-b border-danger-200 bg-danger-50 px-5 py-2 text-sm text-danger-700">{submitError}</div>}

      {ctx.access.isOwner && notReady && (
        <div className="border-b border-warning-200 bg-warning-50 px-5 py-2 text-sm text-warning-800">
          Heads up — {ctx.submitReadiness.blocking[0] ?? 'the recipe Facts are incomplete'}. You can still send the proof; the maker reviews it before printing.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Tool rail — only when I actually hold the edit turn. */}
        {canEditNow && (
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

        <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
          <div className="rounded-lg bg-white shadow-sm ring-1 ring-ink-200">
            <canvas ref={canvasElRef} />
          </div>
        </main>

        {/* Version attribution (C9) */}
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-l border-ink-200 bg-white p-4 lg:block">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Versions</div>
          {ctx.versions.length === 0 ? (
            <p className="mt-3 text-xs text-ink-400">No saves yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {ctx.versions.map((v) => (
                <li key={v.version} className="rounded-lg border border-ink-100 px-3 py-2">
                  <div className="text-xs font-medium text-ink-800">v{v.version}</div>
                  <div className="text-[11px] text-ink-500">
                    {v.savedByName} · {new Date(v.savedAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      {/* A11 — regulated panel rendered off-screen as a real style-isolated SVG;
          serialized + composited into the proof at submit (never editable). */}
      {ctx.regulated && (
        <div ref={regulatedRef} aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
          <NutritionFactsSvg
            data={ctx.regulated.panel}
            ingredientStatement={ctx.regulated.ingredientStatement ?? undefined}
            contains={ctx.regulated.contains ?? undefined}
            widthPx={null}
          />
        </div>
      )}
    </div>
  )
}
