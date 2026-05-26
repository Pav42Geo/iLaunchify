'use client'

// DieCutFrame — non-interactive overlay showing bleed / trim / safe area /
// placement zones on top of the Fabric.js canvas. Per docs/DESIGN_STUDIO_REBUILD.md §3.
//
// Renders as absolutely-positioned divs with pointer-events: none so it never
// intercepts canvas clicks. Color conventions (matching the legacy + Pavel's
// reference screenshots):
//   - Bleed area: dashed sky-blue border + 3% blue tint
//   - Trim line:  solid black border
//   - Safe area:  dashed red border
//   - Zones:      dashed orange border + 8% orange tint + label
//
// All coordinates are computed from the same pxPerMm + bleed/trim/safe values
// the Stage uses, so they stay in lockstep with the canvas dimensions.

import type { DieCutSpec, GuideVisibility, ZoneSpec } from './types'

interface DieCutFrameProps {
  dieCut: DieCutSpec
  pxPerMm?: number
  guides?: GuideVisibility
  zones?: ZoneSpec[]
  className?: string
}

const COLORS = {
  bleed: '#00a3ff',
  trim: '#111111',
  safe: '#ff1744',
  zone: '#ff9800',
  zoneFill: 'rgba(255, 152, 0, 0.08)',
  bleedFill: 'rgba(0, 163, 255, 0.03)',
} as const

export function DieCutFrame({
  dieCut,
  pxPerMm = 3.0,
  guides = { bleed: true, trim: true, safe: true, zones: true },
  zones = [],
  className,
}: DieCutFrameProps) {
  const bleedPx = dieCut.bleedMm * pxPerMm
  const safePx = dieCut.safeAreaMm * pxPerMm
  const trimWidthPx = dieCut.widthMm * pxPerMm
  const trimHeightPx = dieCut.heightMm * pxPerMm
  const fullWidthPx = trimWidthPx + 2 * bleedPx
  const fullHeightPx = trimHeightPx + 2 * bleedPx

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: fullWidthPx,
        height: fullHeightPx,
        pointerEvents: 'none',
        zIndex: 10,
      }}
      aria-hidden
    >
      {/* Bleed area — outermost rectangle (the entire canvas) */}
      {guides.bleed && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: `2px dashed ${COLORS.bleed}`,
            background: COLORS.bleedFill,
          }}
        />
      )}

      {/* Trim line — where the cut happens */}
      {guides.trim && (
        <div
          style={{
            position: 'absolute',
            left: bleedPx,
            top: bleedPx,
            width: trimWidthPx,
            height: trimHeightPx,
            border: `2px solid ${COLORS.trim}`,
          }}
        />
      )}

      {/* Safe area — inset where content should live */}
      {guides.safe && (
        <div
          style={{
            position: 'absolute',
            left: bleedPx + safePx,
            top: bleedPx + safePx,
            width: trimWidthPx - 2 * safePx,
            height: trimHeightPx - 2 * safePx,
            border: `1.5px dashed ${COLORS.safe}`,
          }}
        />
      )}

      {/* Placement zones */}
      {guides.zones &&
        zones.map((zone) => (
          <ZoneOverlay key={zone.id} zone={zone} bleedPx={bleedPx} pxPerMm={pxPerMm} />
        ))}
    </div>
  )
}

function ZoneOverlay({
  zone,
  bleedPx,
  pxPerMm,
}: {
  zone: ZoneSpec
  bleedPx: number
  pxPerMm: number
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: bleedPx + zone.x * pxPerMm,
        top: bleedPx + zone.y * pxPerMm,
        width: zone.widthMm * pxPerMm,
        height: zone.heightMm * pxPerMm,
        border: `2px dashed ${COLORS.zone}`,
        background: COLORS.zoneFill,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#7c4a00',
          background: 'rgba(255,255,255,0.65)',
          padding: '2px 6px',
          borderRadius: 3,
        }}
      >
        {zone.name}
      </span>
    </div>
  )
}

/**
 * Convenience legend chip strip that goes in the Product drawer
 * to explain the color-coded guides.
 */
export function DieCutLegend({ guides }: { guides: GuideVisibility }) {
  const items: Array<{ label: string; color: string; shown: boolean; style: 'solid' | 'dashed' }> = [
    { label: 'Bleed', color: COLORS.bleed, shown: guides.bleed, style: 'dashed' },
    { label: 'Trim', color: COLORS.trim, shown: guides.trim, style: 'solid' },
    { label: 'Safety', color: COLORS.safe, shown: guides.safe, style: 'dashed' },
    { label: 'Zones', color: COLORS.zone, shown: guides.zones, style: 'dashed' },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span
          key={it.label}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            color: it.color,
            borderWidth: 1.5,
            borderStyle: it.style,
            borderColor: it.color,
            opacity: it.shown ? 1 : 0.35,
          }}
        >
          {it.label}
        </span>
      ))}
    </div>
  )
}
