// Prepress pre-flight check engine (C9).
//
// Validates a design against the bound partner's PartnerPrintOutputSpec BEFORE
// the export bundle is generated. Errors block export; warnings require ack
// (the existing DS-69 export-gate pattern). Every finding names the partner-spec
// field that triggered it, so the creator understands WHY ("Greenfield Bottling
// requires PDF/X-1a; your artwork uses live transparency").
//
// Pure function — no canvas, no I/O. The Studio extracts a normalized
// `PreflightDesignSummary` from the Fabric canvas and passes it here, which keeps
// the rules deterministic + unit-verifiable. Mirrors compliance.ts's result
// shape (counts + outcome + findings).
//
// What V1 checks DETERMINISTICALLY (from the design summary):
//   • bleed coverage      — artwork extends to the bleed line      → ERROR
//   • raster DPI          — every image ≥ partner minDpi at size   → ERROR
//   • font policy         — live text when OUTLINE_TO_PATHS required → ERROR
//   • color space         — declared space ≠ partner colorSpace    → ERROR
//   • spot-color book      — declared spot's book ≠ spotColorLibrary → WARNING
//   • safe area           — text crossing the safe-area box        → WARNING
// TAC and undeclared color-space are NOT machine-checkable from an RGB canvas in
// V1; those stay manual (the spec sheet carries the limits to the printer).

export interface PreflightBox {
  x: number
  y: number
  w: number
  h: number
}

export interface PreflightDesignSummary {
  /** Overall printable-artwork bounds in mm (union of all objects), or null if empty. */
  artworkBounds: PreflightBox | null
  /** Raster/image elements with natural pixel size + placed mm size. */
  rasterElements: Array<{
    label?: string
    naturalWidthPx: number
    placedWidthMm: number
  }>
  /** Text elements: their font + whether outlined-to-paths, and bounds (mm). */
  textElements: Array<{ label?: string; outlined: boolean; bounds: PreflightBox }>
  /** Declared spot colors used in the artwork (fullSpec + PMS book). */
  spotColors: Array<{ fullSpec: string; book: string }>
  /** Declared document color space, when the design carries one (else null). */
  declaredColorSpace?: string | null
}

export interface PreflightDieline {
  /** Total extent including bleed (mm). */
  bleedExtent: { w: number; h: number }
  /** Safe-area box (mm). */
  safeBox: PreflightBox
}

export interface PreflightPartnerSpec {
  minDpi: number
  bleedMm: number
  colorSpace: string
  fontPolicy: 'EMBED' | 'OUTLINE_TO_PATHS' | 'EITHER'
  spotColorLibrary: string // PmsBook value, e.g. "COATED"
  /** Partner name, for human-readable "X requires…" messages. */
  partnerName?: string
}

export interface PreflightInput {
  design: PreflightDesignSummary
  dieline: PreflightDieline
  spec: PreflightPartnerSpec
}

export type PreflightSeverity = 'ERROR' | 'WARNING'

export interface PreflightFinding {
  id: string
  severity: PreflightSeverity
  title: string
  detail: string
  /** The PartnerPrintOutputSpec field that drove this check. */
  specField: string
}

export interface PreflightResult {
  findings: PreflightFinding[]
  errorCount: number
  warningCount: number
  outcome: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL'
}

const MM_TOLERANCE = 0.5

function who(spec: PreflightPartnerSpec): string {
  return spec.partnerName ? `${spec.partnerName} requires` : 'Your partner requires'
}

/** Run pre-flight. Pure — no side effects. */
export function runPreflight(input: PreflightInput): PreflightResult {
  const { design, dieline, spec } = input
  const findings: PreflightFinding[] = []

  // ---- Bleed coverage — artwork must extend to the bleed line on all sides ---
  if (!design.artworkBounds) {
    findings.push({
      id: 'bleed-empty',
      severity: 'ERROR',
      title: 'No artwork on the label',
      detail: 'The label has no printable artwork to export.',
      specField: 'bleedMm',
    })
  } else {
    const b = design.artworkBounds
    const reachesLeft = b.x <= MM_TOLERANCE
    const reachesTop = b.y <= MM_TOLERANCE
    const reachesRight = b.x + b.w >= dieline.bleedExtent.w - MM_TOLERANCE
    const reachesBottom = b.y + b.h >= dieline.bleedExtent.h - MM_TOLERANCE
    if (!(reachesLeft && reachesTop && reachesRight && reachesBottom)) {
      findings.push({
        id: 'bleed-coverage',
        severity: 'ERROR',
        title: 'Artwork does not reach the bleed line',
        detail: `${who(spec)} ${spec.bleedMm}mm bleed — extend background art past the trim to the bleed edge on all sides, or it may print with white slivers.`,
        specField: 'bleedMm',
      })
    }
  }

  // ---- Raster DPI — every image must meet the partner minimum at final size --
  for (const r of design.rasterElements) {
    if (r.placedWidthMm <= 0 || r.naturalWidthPx <= 0) continue
    const dpi = Math.round(r.naturalWidthPx / (r.placedWidthMm / 25.4))
    if (dpi < spec.minDpi) {
      findings.push({
        id: `dpi-${r.label ?? 'image'}-${dpi}`,
        severity: 'ERROR',
        title: `Low resolution: ${r.label ?? 'image'} is ${dpi} DPI`,
        detail: `${who(spec)} ≥ ${spec.minDpi} DPI at final size. Use a larger source image or scale this one down.`,
        specField: 'minDpi',
      })
    }
  }

  // ---- Font policy ----------------------------------------------------------
  if (spec.fontPolicy === 'OUTLINE_TO_PATHS') {
    const live = design.textElements.filter((t) => !t.outlined)
    if (live.length > 0) {
      findings.push({
        id: 'font-outline',
        severity: 'ERROR',
        title: `${live.length} text element${live.length === 1 ? '' : 's'} not outlined`,
        detail: `${who(spec)} fonts outlined to paths. Convert text to outlines before export.`,
        specField: 'fontPolicy',
      })
    }
  }

  // ---- Color space (only when the design declares one) ----------------------
  if (design.declaredColorSpace && design.declaredColorSpace !== spec.colorSpace) {
    findings.push({
      id: 'color-space',
      severity: 'ERROR',
      title: `Color space is ${design.declaredColorSpace}, not ${spec.colorSpace}`,
      detail: `${who(spec)} ${spec.colorSpace} artwork. Convert the document color space before export.`,
      specField: 'colorSpace',
    })
  }

  // ---- Spot-color book ------------------------------------------------------
  for (const s of design.spotColors) {
    if (s.book && s.book !== spec.spotColorLibrary) {
      findings.push({
        id: `spot-book-${s.fullSpec}`,
        severity: 'WARNING',
        title: `${s.fullSpec} is ${s.book}, partner book is ${spec.spotColorLibrary}`,
        detail: `${who(spec)} the ${spec.spotColorLibrary} PANTONE book for this substrate. Re-pick the ${spec.spotColorLibrary} variant for an accurate match.`,
        specField: 'spotColorLibrary',
      })
    }
  }

  // ---- Safe area — critical text should stay inside the safe box -------------
  const sb = dieline.safeBox
  for (const t of design.textElements) {
    const inside =
      t.bounds.x >= sb.x - MM_TOLERANCE &&
      t.bounds.y >= sb.y - MM_TOLERANCE &&
      t.bounds.x + t.bounds.w <= sb.x + sb.w + MM_TOLERANCE &&
      t.bounds.y + t.bounds.h <= sb.y + sb.h + MM_TOLERANCE
    if (!inside) {
      findings.push({
        id: `safe-${t.label ?? 'text'}`,
        severity: 'WARNING',
        title: `Text outside the safe area: ${t.label ?? 'text'}`,
        detail: 'Keep important text + logos inside the safe area so trimming variance never clips them.',
        specField: 'bleedMm',
      })
    }
  }

  const errorCount = findings.filter((f) => f.severity === 'ERROR').length
  const warningCount = findings.length - errorCount
  const outcome: PreflightResult['outcome'] =
    errorCount > 0 ? 'FAIL' : warningCount > 0 ? 'PASS_WITH_WARNINGS' : 'PASS'

  return { findings, errorCount, warningCount, outcome }
}
