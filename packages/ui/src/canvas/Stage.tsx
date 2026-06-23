'use client'

// Stage — the Fabric.js canvas mount point.
// Per docs/DESIGN_STUDIO_REBUILD.md §3 (canvas foundation).
//
// Wraps a <canvas> element and instantiates a Fabric.Canvas on mount.
// Calls onReady(canvas) once the instance is live so the parent shell can
// wire up tool drawers, register event handlers, etc.
//
// Fabric.js cannot SSR — this is a 'use client' component. The host page
// dynamically loads it via next/dynamic with ssr:false (see canvas page.tsx).

import { useEffect, useRef } from 'react'
import * as fabric from 'fabric'
import type { DieCutSpec } from './types'
import { computeSmartGuides, type SGRect, type SGGap } from './smartGuides'

// ---------------------------------------------------------------------------
// Selection chrome — Canva-style (Pavel 2026-06-23). Solid brand-pink border
// (no dashes) + filled WHITE circular handles ringed in pink, with a little
// padding so the box sits just off the artwork. Applied once to the Fabric
// object prototype so every object on every canvas inherits it.
// ---------------------------------------------------------------------------
const SELECTION_PINK = '#FF2E63'
const SELECTION_CHROME = {
  cornerStyle: 'circle' as const,
  transparentCorners: false,
  cornerColor: '#FFFFFF',
  cornerStrokeColor: SELECTION_PINK,
  cornerSize: 11,
  touchCornerSize: 20,
  borderColor: SELECTION_PINK,
  borderScaleFactor: 1.5,
  borderDashArray: null as number[] | null,
  padding: 4,
  borderOpacityWhenMoving: 1,
}
let selectionChromeApplied = false
function applySelectionChrome(): void {
  if (selectionChromeApplied) return
  selectionChromeApplied = true
  const f = fabric as unknown as Record<string, { prototype: Record<string, unknown> } | undefined>
  for (const klass of ['FabricObject', 'Object', 'ActiveSelection']) {
    const proto = f[klass]?.prototype
    if (proto) Object.assign(proto, SELECTION_CHROME)
  }
}

/** Canva-style measurement pill — pink-bordered when normal, filled pink (symmetry
 *  match) when the two surrounding gaps are equal. */
function drawGuidePill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  text: string,
  equal: boolean,
): void {
  const w = ctx.measureText(text).width + 10
  const h = 15
  ctx.save()
  ctx.beginPath()
  const rr = (ctx as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect
  if (rr) rr.call(ctx, cx - w / 2, cy - h / 2, w, h, 4)
  else ctx.rect(cx - w / 2, cy - h / 2, w, h)
  ctx.fillStyle = equal ? SELECTION_PINK : '#ffffff'
  ctx.strokeStyle = SELECTION_PINK
  ctx.lineWidth = 1
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = equal ? '#ffffff' : SELECTION_PINK
  ctx.fillText(text, cx, cy)
  ctx.restore()
}

interface StageProps {
  dieCut: DieCutSpec
  /** Pixels per millimeter. Lets parent control zoom. Default 3.0 = roughly 76 DPI. */
  pxPerMm?: number
  /**
   * View-zoom multiplier. When set, Fabric's internal setZoom(viewZoom)
   * is applied so that object coordinates (stored in BASE-pixel space —
   * i.e. as if viewZoom were 1) render scaled in lockstep with the
   * resized canvas DOM. Without this, the canvas dimensions grow but
   * objects keep their original pixel positions, causing them to appear
   * to drift relative to the die-cut frame during ctrl-wheel zoom
   * (DS-73.1).
   *
   * CanvasLayoutShell drives this via its own `zoom` state, while
   * `pxPerMm` is left at `basePxPerMm * viewZoom` so dimensions still
   * scale correctly.
   */
  viewZoom?: number
  /** Background color INSIDE the bleed area (i.e. the printable surface color). */
  surfaceColor?: string
  /** Called once when the Fabric.Canvas is ready. Parent uses it to add
   *  tools, register handlers, snapshot for history, etc. The canvas
   *  outlives this prop — it lives until Stage unmounts, at which point
   *  it's disposed. Consumers should null out their ref on unmount. */
  onReady?: (canvas: fabric.Canvas) => void
  /** Called once the initialDesignJson has finished loading (or immediately
   *  when there is none). Distinct from onReady, which fires synchronously
   *  while loadFromJSON is still pending — anything that must run against the
   *  hydrated object set (e.g. cert-badge reconcile) belongs here. */
  onHydrated?: (canvas: fabric.Canvas) => void
  /** Optional initial design state (Fabric JSON). Loaded after canvas instantiation. */
  initialDesignJson?: object | null
  /** Optional className on the wrapper. */
  className?: string
}

export function Stage({
  dieCut,
  pxPerMm = 3.0,
  viewZoom = 1,
  surfaceColor = '#ffffff',
  onReady,
  onHydrated,
  initialDesignJson,
  className,
}: StageProps) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)

  // Canvas pixel dimensions = (trim + 2× bleed) × pxPerMm.
  // The visible printable area extends from (bleed, bleed) to (bleed+trim, bleed+trim).
  const fullWidthMm = dieCut.widthMm + 2 * dieCut.bleedMm
  const fullHeightMm = dieCut.heightMm + 2 * dieCut.bleedMm
  const pixelWidth = Math.round(fullWidthMm * pxPerMm)
  const pixelHeight = Math.round(fullHeightMm * pxPerMm)

  useEffect(() => {
    if (!canvasElRef.current) return

    applySelectionChrome()

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: pixelWidth,
      height: pixelHeight,
      backgroundColor: surfaceColor,
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
      fireRightClick: true,
      // Corner scaling is ALWAYS proportional — no Shift-to-distort (Pavel 2026-06-23).
      uniformScaling: true,
      uniScaleKey: null,
    })

    // Hover affordance — outline the object under the cursor (unless it's the
    // active selection) so it's obvious what you're about to grab, Canva-style.
    let hovered: fabric.FabricObject | null = null
    const clearHover = () => {
      if (hovered) {
        hovered = null
        canvas.requestRenderAll()
      }
    }
    canvas.on('mouse:over', (e) => {
      const t = (e as { target?: fabric.FabricObject }).target
      if (!t || t.selectable === false) {
        clearHover()
        return
      }
      if (t !== hovered) {
        hovered = t
        canvas.requestRenderAll()
      }
    })
    canvas.on('mouse:out', clearHover)
    canvas.on('mouse:down', clearHover)
    canvas.on('after:render', () => {
      if (!hovered || hovered === canvas.getActiveObject()) return
      try {
        const r = hovered.getBoundingRect()
        // getBoundingRect is in object space — apply the viewport transform so the
        // outline lands on the object at any zoom.
        const vpt = (canvas.viewportTransform as number[] | undefined) ?? [1, 0, 0, 1, 0, 0]
        const z = vpt[0] || 1
        const x = r.left * z + (vpt[4] || 0)
        const y = r.top * z + (vpt[5] || 0)
        const ctx = canvas.getContext()
        ctx.save()
        ctx.strokeStyle = SELECTION_PINK
        ctx.globalAlpha = 0.85
        ctx.lineWidth = 1.5
        ctx.setLineDash([])
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, r.width * z - 1), Math.max(0, r.height * z - 1))
        ctx.restore()
      } catch {
        /* getBoundingRect on a disposed/odd object — ignore */
      }
    })

    // ---- Smart alignment guides + spacing measurements (Canva-style) --------
    // While dragging, snap the object's edges/center to the die-line trim box,
    // its center, and other objects' edges/centers (sticky), and show guide lines
    // + distance pills with equal-spacing (symmetry) detection.
    let guides: { vLines: number[]; hLines: number[]; gaps: SGGap[] } | null = null
    const frameRect: SGRect = {
      left: dieCut.bleedMm * pxPerMm,
      top: dieCut.bleedMm * pxPerMm,
      width: dieCut.widthMm * pxPerMm,
      height: dieCut.heightMm * pxPerMm,
    }
    const bbox = (o: fabric.FabricObject): SGRect => {
      const r = o.getBoundingRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height }
    }
    const clearGuides = () => {
      if (guides) {
        guides = null
        canvas.requestRenderAll()
      }
    }
    canvas.on('object:moving', (e) => {
      const t = (e as { target?: fabric.FabricObject }).target
      if (!t) return
      const z = canvas.getZoom() || 1
      const others = canvas
        .getObjects()
        .filter((o) => o !== t && (o.width ?? 0) > 0 && (o.height ?? 0) > 0)
        .map(bbox)
      const res = computeSmartGuides(bbox(t), frameRect, others, { threshold: 6 / z, zoom: 1 })
      if (res.dx || res.dy) {
        t.set({ left: (t.left ?? 0) + res.dx, top: (t.top ?? 0) + res.dy })
        t.setCoords()
      }
      guides = res.vLines.length || res.hLines.length || res.gaps.length ? res : null
      canvas.requestRenderAll()
    })
    canvas.on('mouse:up', clearGuides)
    canvas.on('object:modified', clearGuides)
    canvas.on('after:render', () => {
      if (!guides) return
      const vpt = (canvas.viewportTransform as number[] | undefined) ?? [1, 0, 0, 1, 0, 0]
      const z = vpt[0] || 1
      const ex = vpt[4] || 0
      const ey = vpt[5] || 0
      const toX = (x: number) => x * z + ex
      const toY = (y: number) => y * z + ey
      const ctx = canvas.getContext()
      const W = canvas.getWidth()
      const H = canvas.getHeight()
      ctx.save()
      ctx.strokeStyle = SELECTION_PINK
      ctx.lineWidth = 1
      ctx.setLineDash([])
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const x of guides.vLines) {
        const sx = toX(x)
        ctx.beginPath()
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx, H)
        ctx.stroke()
      }
      for (const y of guides.hLines) {
        const sy = toY(y)
        ctx.beginPath()
        ctx.moveTo(0, sy)
        ctx.lineTo(W, sy)
        ctx.stroke()
      }
      for (const gap of guides.gaps) {
        const label = String(Math.round(gap.dist))
        if (gap.axis === 'x') {
          const x1 = toX(gap.a)
          const x2 = toX(gap.b)
          const y = toY(gap.cross)
          ctx.beginPath()
          ctx.moveTo(x1, y)
          ctx.lineTo(x2, y)
          ctx.moveTo(x1, y - 4)
          ctx.lineTo(x1, y + 4)
          ctx.moveTo(x2, y - 4)
          ctx.lineTo(x2, y + 4)
          ctx.stroke()
          drawGuidePill(ctx, (x1 + x2) / 2, y, label, gap.equal)
        } else {
          const y1 = toY(gap.a)
          const y2 = toY(gap.b)
          const x = toX(gap.cross)
          ctx.beginPath()
          ctx.moveTo(x, y1)
          ctx.lineTo(x, y2)
          ctx.moveTo(x - 4, y1)
          ctx.lineTo(x + 4, y1)
          ctx.moveTo(x - 4, y2)
          ctx.lineTo(x + 4, y2)
          ctx.stroke()
          drawGuidePill(ctx, x, (y1 + y2) / 2, label, gap.equal)
        }
      }
      ctx.restore()
    })

    // Fabric v6 copies class defaults onto each instance at construction, so
    // setting the prototype isn't enough for objects already built from JSON —
    // stamp the selection chrome onto every object so SELECTED objects show the
    // same pink border + white handles, not Fabric's grey defaults.
    const styleObject = (o: fabric.FabricObject | undefined | null) => {
      if (!o) return
      try {
        o.set(SELECTION_CHROME)
        o.set('centeredRotation', true)
        o.set('lockScalingFlip', true) // never mirror-flip on over-drag
        // Control visibility, Canva-style:
        //   - Hide the top rotation handle (mtr) — rotation is the pill below.
        //   - Corners (tl/tr/bl/br) stay → ALWAYS proportional resize.
        //   - All native side handles (ml/mr/mt/mb) are hidden; the mid-edge BARS
        //     rendered in ObjectActions replace them (stretch for vectors/photos,
        //     proportional-centered enlarge for text / QR / barcode).
        const withControls = o as unknown as { setControlsVisibility?: (v: Record<string, boolean>) => void }
        withControls.setControlsVisibility?.({ mtr: false, ml: false, mr: false, mt: false, mb: false })
      } catch {
        /* odd/disposed object — ignore */
      }
    }
    canvas.on('object:added', (e) => styleObject((e as { target?: fabric.FabricObject }).target))

    // DS-73.1 — apply the initial view zoom so the canvas mounts at
    // the right scale when the parent state is non-1 (e.g. an
    // out-of-band navigation that restored a zoom level).
    canvas.setZoom(viewZoom)

    fabricRef.current = canvas

    // Strict mode mounts/unmounts/remounts the effect. The async
    // loadFromJSON().then(renderAll) from the FIRST mount can resolve
    // AFTER the strict-mode dispose, at which point renderAll() runs
    // against a disposed canvas and crashes inside fabric's clearRect
    // call. This flag short-circuits the async callback when the
    // cleanup has already fired.
    let cancelled = false

    if (initialDesignJson) {
      canvas
        .loadFromJSON(initialDesignJson)
        .then(() => {
          if (cancelled) return
          canvas.getObjects().forEach(styleObject)
          canvas.renderAll()
          onHydrated?.(canvas)
        })
        .catch(() => {
          // Swallow — usually fires when dispose raced ahead of the
          // load promise. Same defensive intent as the cancelled flag.
        })
    } else {
      onHydrated?.(canvas)
    }

    onReady?.(canvas)

    return () => {
      cancelled = true
      // Null the ref FIRST so any concurrent effect that reads
      // fabricRef.current sees the disposed state.
      fabricRef.current = null
      // Async dispose so React's strict-mode double-mount doesn't blow up.
      try {
        const result = canvas.dispose() as unknown
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          ;(result as Promise<unknown>).catch(() => {})
        }
      } catch {
        // already disposed; safe to ignore
      }
    }
    // We deliberately only re-init when the die-cut identity changes — pxPerMm /
    // surfaceColor changes are applied via the canvas API in their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dieCut.id])

  // React to pxPerMm / surfaceColor changes without re-creating the canvas.
  // Wrapped in try/catch because canvas.setDimensions + renderAll go
  // through the same clearRect path that crashes on a disposed canvas —
  // we don't want a stale effect run (e.g. one queued before strict-mode
  // dispose) to take down the page.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    // fabric v6 sets a `disposed` flag during cleanup; bail before we
    // touch the canvas context.
    if ((canvas as unknown as { disposed?: boolean }).disposed) return
    try {
      canvas.setDimensions({ width: pixelWidth, height: pixelHeight })
      canvas.backgroundColor = surfaceColor
      // DS-73.1 — viewport zoom. Object coordinates are stored in BASE
      // pixel space (i.e. as if viewZoom were 1). Fabric's setZoom
      // multiplies all rendered positions by viewZoom, so objects scale
      // in lockstep with the resized canvas DOM and stay anchored to
      // the die-cut frame.
      canvas.setZoom(viewZoom)
      canvas.renderAll()
    } catch (err) {
      console.warn('[Stage] resize/render skipped — canvas not ready:', err)
    }
  }, [pixelWidth, pixelHeight, surfaceColor, viewZoom])

  return (
    <div className={className} style={{ width: pixelWidth, height: pixelHeight, position: 'relative' }}>
      <canvas ref={canvasElRef} />
    </div>
  )
}
