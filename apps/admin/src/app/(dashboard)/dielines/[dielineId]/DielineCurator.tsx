'use client'

// Side-by-side die-line curator (Slice C9.g).
//   • Left  — the partner's ORIGINAL file, read-only (never edited).
//   • Right — the live NORMALIZED preview, regenerated from the structured spec
//             as the admin edits trim / bleed / safe values.
// Saving regenerates + stores the normalized SVG and marks the die-line
// ADMIN_VERIFIED + ACTIVE.

import { useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, FileWarning, ShieldCheck, SlidersHorizontal, LayoutGrid, ArrowLeft, Check, Boxes, Sparkles, Palette, Layers, Maximize2, X, Box, Square } from 'lucide-react'
import {
  dielineSvgFromSpec,
  DielineFrameEditor,
  DEFAULT_FRAME_LAYOUT,
  SUBSTRATE_SWATCHES,
  substrateById,
  defaultSubstrateId,
  type DielineFold,
  type DielineSurface,
  type FrameLayout,
  type NormBox,
} from '@ilaunchify/ui'
import { curateDieline, saveAdminDielineFrames, saveAdminDielineGeometry, mapDielineToShape, autoParseDieline, propagateDielineFramesAction, type AutoParseDetected } from '../actions'

interface ShapeOption {
  id: string
  name: string
  category: string
  widthMm: number
  heightMm: number
}

interface Spec {
  widthMm: number
  heightMm: number
  bleedMm: number
  safeAreaMm: number
}

interface Props {
  dielineId: string
  status: string
  initial: Spec
  foldLines: Array<{ x1: number; y1: number; x2: number; y2: number; type?: string }> | null
  surfaces: Array<{ name: string; trimBox?: { x: number; y: number; w: number; h: number } | null }> | null
  original: { url: string; contentType: string; filename: string } | null
  /** Frames mode: saved FrameLayout (0..1 slots) or null for the default. */
  frames: unknown | null
  initialTrim: NormBox
  initialSafe: NormBox
  /** Signed URL of the normalized SVG (preferred frame backdrop) or null. */
  normalizedUrl: string | null
  format: string | null
  /** P2 canonical shape mapping. */
  shapeOptions: ShapeOption[]
  currentShapeId: string | null
  suggestedShapeId: string | null
}

export function DielineCurator({
  dielineId,
  status,
  initial,
  foldLines,
  surfaces,
  original,
  frames,
  initialTrim,
  initialSafe,
  normalizedUrl,
  format,
  shapeOptions,
  currentShapeId,
  suggestedShapeId,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [spec, setSpec] = useState<Spec>(initial)
  const [mode, setMode] = useState<'spec' | 'frames'>('spec')
  // Conversion Verifier (P4): overlay original↔normalized + a review ack that
  // gates the verify save. `declared` = the partner's submitted dims (baseline).
  const declared = initial
  const [overlay, setOverlay] = useState(false)
  const [overlayOpacity, setOverlayOpacity] = useState(0.6)
  // Ghost-diff: which outline to overlay on the original. 'detected' shows the
  // auto-parser's lines (in the original's exact viewBox → pixel-aligned) so the
  // admin can confirm they trace the real die line.
  const [overlaySource, setOverlaySource] = useState<'normalized' | 'detected'>('normalized')
  const [reviewed, setReviewed] = useState(false)
  const [report, setReport] = useState<AutoParseDetected | null>(null)
  // Preview dock (Pacdora-style): expand the corner preview into a fullscreen
  // viewport with a 2D ⇄ 3D toggle. 3D pane drops in once three.js is installed.
  const [expanded, setExpanded] = useState(false)
  const [expandView, setExpandView] = useState<'2d' | '3d'>('3d')
  // Substrate / material — preview surface (kraft, white board, film…), defaulted
  // from the mapped canonical shape's category. Becomes the 3D mesh base colour.
  const currentShapeCategory = shapeOptions.find((o) => o.id === currentShapeId)?.category ?? null
  const [substrate, setSubstrate] = useState<string>(() => defaultSubstrateId(currentShapeCategory))
  const surfaceBg = substrateById(substrate).background

  const canSave = status === 'PARTNER_CONFIRMED' || status === 'ACTIVE'
  const valid =
    spec.widthMm > 0 &&
    spec.heightMm > 0 &&
    spec.bleedMm >= 0 &&
    spec.safeAreaMm >= 0 &&
    spec.safeAreaMm * 2 < spec.widthMm &&
    spec.safeAreaMm * 2 < spec.heightMm

  const svg = useMemo(() => {
    if (!valid) return ''
    return dielineSvgFromSpec({
      widthMm: spec.widthMm,
      heightMm: spec.heightMm,
      bleedMm: spec.bleedMm,
      safeAreaMm: spec.safeAreaMm,
      foldLines: (foldLines as DielineFold[] | null) ?? undefined,
      surfaces: (surfaces as DielineSurface[] | null) ?? undefined,
    })
  }, [spec, valid, foldLines, surfaces])

  function save() {
    if (!valid) {
      toast.error('Check the trim, bleed and safe values.')
      return
    }
    start(async () => {
      const r = await curateDieline({
        dielineId,
        widthMm: spec.widthMm,
        heightMm: spec.heightMm,
        bleedMm: spec.bleedMm,
        safeAreaMm: spec.safeAreaMm,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Normalized & verified')
      router.push('/dielines')
      router.refresh()
    })
  }

  function propagateFrames() {
    start(async () => {
      const r = await propagateDielineFramesAction(dielineId)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(
        r.count > 0
          ? `Frames applied to ${r.count} die-line${r.count === 1 ? '' : 's'} of this shape`
          : 'No cluster siblings need frames (map this die-line to a shape first)',
      )
    })
  }

  function detect() {
    start(async () => {
      const r = await autoParseDieline(dielineId)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setSpec({
        widthMm: r.detected.widthMm,
        heightMm: r.detected.heightMm,
        bleedMm: r.detected.bleedMm,
        safeAreaMm: r.detected.safeAreaMm,
      })
      setReport(r.detected)
      toast.success(`Detected at ${Math.round(r.detected.parseScore * 100)}% — review before saving`)
      if (r.detected.unrecognized.length > 0) {
        toast.warning(`${r.detected.unrecognized.length} unrecognized element${r.detected.unrecognized.length === 1 ? '' : 's'} — check nothing was dropped`)
      }
    })
  }

  const backdropUrl = normalizedUrl ?? original?.url ?? null
  const backdropIsPdf = !normalizedUrl && (original?.contentType?.toLowerCase().includes('pdf') ?? false)

  // --- Frames mode: full interactive slot placement on the normalized die-line ---
  if (mode === 'frames') {
    return (
      <div className="space-y-4">
        <ModeToggle mode={mode} setMode={setMode} />
        <div className="h-[calc(100vh-300px)] min-h-[560px] overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <DielineFrameEditor
            initialLayout={structuredClone((frames as FrameLayout | null) ?? DEFAULT_FRAME_LAYOUT)}
            initialTrim={initialTrim}
            initialSafe={initialSafe}
            backdrop={{ fileUrl: backdropUrl, isPdf: backdropIsPdf }}
            meta={{ format, widthMm: spec.widthMm, heightMm: spec.heightMm, bleedMm: spec.bleedMm }}
            onPersist={async ({ layout, trim, safe }) => {
              const [a, b] = await Promise.all([
                saveAdminDielineFrames(dielineId, layout),
                saveAdminDielineGeometry(dielineId, { trimBox: trim, safeAreaBox: safe }),
              ])
              return { ok: a.ok && b.ok, error: !a.ok ? a.error : !b.ok ? b.error : undefined }
            }}
            topBarLeft={
              <>
                <button
                  onClick={() => setMode('spec')}
                  className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600 hover:text-ink-900"
                >
                  <ArrowLeft className="h-4 w-4" /> Spec
                </button>
                <span className="h-5 w-px bg-ink-200" />
                <span className="font-display text-[15px] font-bold tracking-tight">Frame placement</span>
              </>
            }
            topBarRight={({ issues, saveStatus }) => (
              <>
                <span className="flex items-center gap-1 text-[11.5px] text-ink-500">
                  {saveStatus === 'saving' ? 'Saving…' : (<><Check className="h-3.5 w-3.5 text-success-600" /> Saved</>)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    issues.length === 0
                      ? 'border-success-200 bg-success-50 text-success-700'
                      : 'border-warning-200 bg-warning-50 text-warning-800'
                  }`}
                  title={issues.map((i) => i.message).join('\n')}
                >
                  {issues.length === 0 ? 'Preflight clear' : `${issues.length} to fix`}
                </span>
                <button
                  onClick={propagateFrames}
                  disabled={pending}
                  title="Apply these frames to every die-line mapped to the same canonical shape that has none yet"
                  className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Propagate to cluster
                </button>
              </>
            )}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ModeToggle mode={mode} setMode={setMode} />
      <CanonicalShapePicker
        dielineId={dielineId}
        options={shapeOptions}
        currentShapeId={currentShapeId}
        suggestedShapeId={suggestedShapeId}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Partner original" subtitle="Reference only — never modified">
          <OriginalPreview original={original} />
        </Panel>

        <Panel
          title="Normalized preview"
          subtitle={overlay ? 'Overlaid on the original — check the lines line up' : 'Regenerated live from the spec below'}
          action={
            <div className="flex items-center gap-1.5">
              {original && (
                <button
                  onClick={() => setOverlay((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    overlay ? 'border-success-300 bg-success-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" /> Overlay
                </button>
              )}
              <button
                onClick={() => { setExpandView('3d'); setExpanded(true) }}
                title="Open 3D / fullscreen preview"
                className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50"
              >
                <Box className="h-3.5 w-3.5" /> 3D
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>
          }
        >
          <div
            className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl border border-ink-100 p-4"
            style={{ background: surfaceBg }}
          >
            {overlay && original && (
              // Ghost-diff: detected outline is in the original's exact viewBox →
              // both object-contained = pixel-aligned. Original fills the box.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={original.url} alt="" className="absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] object-contain" />
            )}
            {(() => {
              const ghost = overlay && overlaySource === 'detected' && report?.detectedSvg
              const shown = ghost ? report!.detectedSvg : svg
              if (!shown) return <p className="text-[12.5px] text-ink-400">Enter valid trim dimensions to preview.</p>
              return (
                <div
                  className={ghost ? 'absolute inset-4 [&_svg]:h-full [&_svg]:w-full [&_svg]:object-contain' : 'relative w-full max-w-[420px] [&_svg]:h-auto [&_svg]:w-full'}
                  style={overlay ? { opacity: ghost ? 1 : overlayOpacity } : undefined}
                  // SVG is generated by our own pure functions — no user HTML.
                  dangerouslySetInnerHTML={{ __html: shown }}
                />
              )
            })()}
          </div>

          {overlay && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {report?.detectedSvg && (
                <div className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white p-0.5">
                  <button
                    onClick={() => setOverlaySource('normalized')}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${overlaySource === 'normalized' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
                  >
                    Normalized
                  </button>
                  <button
                    onClick={() => setOverlaySource('detected')}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${overlaySource === 'detected' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
                    title="Show the auto-parser's detected lines over the original (ghost-diff)"
                  >
                    Ghost-diff
                  </button>
                </div>
              )}
              {overlaySource === 'detected' ? (
                <span className="text-[11px] text-ink-500">Detected lines should trace the original&rsquo;s die line.</span>
              ) : (
                <label className="flex flex-1 items-center gap-2 text-[11px] text-ink-500">
                  Normalized opacity
                  <input
                    type="range"
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    className="flex-1 accent-pink-500"
                  />
                </label>
              )}
            </div>
          )}

          {/* Material / substrate swatches — switch the preview surface (and the
              future 3D mesh base) to the right paper / film / foil. */}
          <div className="mt-2.5">
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Material</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {SUBSTRATE_SWATCHES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSubstrate(s.id)}
                  title={s.label}
                  aria-label={s.label}
                  className={`h-6 w-6 rounded-full border transition-shadow ${substrate === s.id ? 'border-pink-500 ring-2 ring-pink-200' : 'border-ink-300 hover:border-ink-400'}`}
                  style={{ background: s.chip }}
                />
              ))}
              <span className="ml-1 text-[11px] text-ink-500">{substrateById(substrate).label}</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-pink-600" />
            <h2 className="text-[13.5px] font-bold text-ink-900">Standardize the spec</h2>
          </div>
          <button
            onClick={detect}
            disabled={pending}
            title="Auto-detect trim / bleed / safe from the original (SVG geometry or PDF/AI page boxes)"
            className="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-[11.5px] font-semibold text-pink-700 hover:bg-pink-100 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> Detect from original
          </button>
        </div>
        <p className="mt-1 text-[12px] text-ink-500">
          Trim, bleed and safe area are normalized to the house standard. Fold lines and named surfaces from the
          partner are preserved as-is.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            label="Trim width (mm)"
            value={spec.widthMm}
            onChange={(v) => setSpec((s) => ({ ...s, widthMm: v }))}
          />
          <NumberField
            label="Trim height (mm)"
            value={spec.heightMm}
            onChange={(v) => setSpec((s) => ({ ...s, heightMm: v }))}
          />
          <NumberField
            label="Bleed (mm)"
            value={spec.bleedMm}
            onChange={(v) => setSpec((s) => ({ ...s, bleedMm: v }))}
          />
          <NumberField
            label="Safe inset (mm)"
            value={spec.safeAreaMm}
            onChange={(v) => setSpec((s) => ({ ...s, safeAreaMm: v }))}
          />
        </div>

        {!valid && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-warning-700">
            <FileWarning className="h-3.5 w-3.5" /> Width and height must be positive; safe inset must fit inside the trim.
          </p>
        )}

        {/* Conversion check — measurement audit vs the partner's declared dims. */}
        <div className="mt-5 rounded-xl border border-ink-100 bg-ink-50/50 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-600">Conversion check — declared vs normalized</p>
          <div className="overflow-hidden rounded-lg border border-ink-100 bg-white">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50 text-[10.5px] uppercase tracking-wider text-ink-500">
                  <th className="px-3 py-1.5 text-left font-semibold">Measure</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Declared</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Normalized</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Δ</th>
                </tr>
              </thead>
              <tbody>
                <AuditRow label="Trim width" declared={declared.widthMm} current={spec.widthMm} unit="mm" />
                <AuditRow label="Trim height" declared={declared.heightMm} current={spec.heightMm} unit="mm" />
                <AuditRow label="Bleed" declared={declared.bleedMm} current={spec.bleedMm} unit="mm" />
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">
            Toggle <span className="font-semibold text-ink-600">Overlay</span> above to confirm the normalized lines sit on the
            original. The original file is never modified and ships to the printer untouched.
          </p>

          {report && (
            <div className="mt-3 rounded-lg border border-ink-100 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-600">
                  Detection report
                  <span className="ml-1.5 rounded border border-ink-200 bg-ink-50 px-1 py-px text-[9.5px] font-semibold tracking-normal text-ink-500">
                    {report.source === 'pdf' ? 'PDF page boxes' : 'SVG geometry'}
                  </span>
                </p>
                <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-700">
                  {Math.round(report.parseScore * 100)}% overall
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div
                  className="h-16 w-16 shrink-0 overflow-hidden rounded border border-ink-100 [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: report.detectedSvg }}
                />
                <div className="flex flex-wrap gap-1.5">
                  <ConfChip label="Trim" v={report.confidence.trim} />
                  <ConfChip label="Bleed" v={report.confidence.bleed} />
                  <ConfChip label="Safe" v={report.confidence.safe} />
                  <ConfChip label="Folds" v={report.confidence.folds} />
                </div>
              </div>
              {report.unrecognized.length > 0 ? (
                <p className="mt-2 inline-flex items-start gap-1.5 text-[11.5px] font-medium text-warning-700">
                  <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {report.unrecognized.length} unrecognized element{report.unrecognized.length === 1 ? '' : 's'} — confirm
                  nothing was dropped: {report.unrecognized.slice(0, 6).join(', ')}
                  {report.unrecognized.length > 6 ? '…' : ''}
                </p>
              ) : (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-success-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Every element accounted for — no coverage gaps.
                </p>
              )}
              {report.separations && report.separations.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">Spot colours / layers:</span>
                  {report.separations.slice(0, 8).map((s) => (
                    <span key={s} className="rounded border border-info-200 bg-info-50 px-1.5 py-px text-[10.5px] font-medium text-info-700">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <label className="mt-3 flex items-start gap-2 text-[12px] text-ink-700">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-ink-300 text-success-600"
          />
          I compared the original and confirmed the normalized lines + measurements are accurate.
        </label>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-400">
            The original file stays immutable. Saving stores a normalized copy and stamps the die-line verified.
          </p>
          <button
            onClick={save}
            disabled={pending || !valid || !canSave || !reviewed}
            title={!reviewed ? 'Confirm the review checkbox first' : undefined}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-success-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {pending ? 'Saving…' : 'Save normalized & verify'}
          </button>
        </div>
      </div>

      {expanded && (
        <PreviewDockModal
          svg={svg}
          originalUrl={original?.url ?? null}
          view={expandView}
          setView={setExpandView}
          surfaceBg={surfaceBg}
          shape={shape3dForCategory(currentShapeCategory)}
          widthMm={spec.widthMm}
          heightMm={spec.heightMm}
          baseColor={substrateById(substrate).chip}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  )
}

// Three.js viewer — client-only (WebGL needs window). Dynamic-import keeps it
// out of the SSR graph, matching how the Fabric canvas components are mounted.
const Dieline3DViewer = dynamic(
  () => import('@ilaunchify/ui').then((m) => m.Dieline3DViewer),
  {
    ssr: false,
    loading: () => <p className="text-[12px] text-ink-400">Loading 3D…</p>,
  },
)

function shape3dForCategory(category: string | null): 'BOX' | 'CYLINDER' | 'FLAT' {
  switch ((category ?? '').toUpperCase()) {
    case 'BOX_PANEL':
      return 'BOX'
    case 'BOTTLE_WRAP':
    case 'TUB_LID':
      return 'CYLINDER'
    default:
      return 'FLAT'
  }
}

function PreviewDockModal({
  svg,
  originalUrl,
  view,
  setView,
  surfaceBg,
  shape,
  widthMm,
  heightMm,
  baseColor,
  onClose,
}: {
  svg: string
  originalUrl: string | null
  view: '2d' | '3d'
  setView: (v: '2d' | '3d') => void
  surfaceBg: string
  shape: 'BOX' | 'CYLINDER' | 'FLAT'
  widthMm: number
  heightMm: number
  baseColor: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ink-200 px-4 py-3">
          <div className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white p-1">
            <button
              onClick={() => setView('3d')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${view === '3d' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
            >
              <Box className="h-3.5 w-3.5" /> 3D fold
            </button>
            <button
              onClick={() => setView('2d')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${view === '2d' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
            >
              <Square className="h-3.5 w-3.5" /> 2D die-line
            </button>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-500 hover:bg-ink-100" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8" style={{ background: surfaceBg }}>
          {view === '2d' ? (
            <div className="max-h-full max-w-[640px] overflow-auto [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            // 3D fold preview — the normalized die-line wrapped on its structure.
            // A mis-folded box reveals a parse error at a glance (§8).
            <div className="flex h-full w-full max-w-3xl flex-col">
              <Dieline3DViewer
                shape={shape}
                widthMm={widthMm}
                heightMm={heightMm}
                textureSvg={svg}
                baseColor={baseColor}
              />
              {originalUrl && (
                <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="mt-1 shrink-0 self-center text-[11px] font-semibold text-pink-700 hover:underline">
                  Compare with the original file ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ConfChip({ label, v }: { label: string; v: number }) {
  const tone = v === 0 ? 'border-ink-200 bg-ink-50 text-ink-400' : v >= 0.9 ? 'border-success-200 bg-success-50 text-success-700' : v >= 0.7 ? 'border-info-200 bg-info-50 text-info-700' : 'border-warning-200 bg-warning-50 text-warning-800'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${tone}`}>
      {label} {v === 0 ? '—' : `${Math.round(v * 100)}%`}
    </span>
  )
}

function AuditRow({ label, declared, current, unit }: { label: string; declared: number; current: number; unit: string }) {
  const delta = Math.round((current - declared) * 100) / 100
  const within = Math.abs(delta) <= 0.5
  return (
    <tr className="border-b border-ink-50 last:border-0">
      <td className="px-3 py-1.5 text-ink-700">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-ink-500">{declared}{unit}</td>
      <td className="px-3 py-1.5 text-right tabular-nums font-medium text-ink-900">{current}{unit}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${delta === 0 ? 'text-ink-400' : within ? 'text-success-700' : 'text-warning-700'}`}>
        {delta > 0 ? '+' : ''}{delta}{unit}
      </td>
    </tr>
  )
}

function ModeToggle({ mode, setMode }: { mode: 'spec' | 'frames'; setMode: (m: 'spec' | 'frames') => void }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors'
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white p-1">
      <button
        onClick={() => setMode('spec')}
        className={`${base} ${mode === 'spec' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> Spec
      </button>
      <button
        onClick={() => setMode('frames')}
        className={`${base} ${mode === 'frames' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
      >
        <LayoutGrid className="h-3.5 w-3.5" /> Frames
      </button>
    </div>
  )
}

function CanonicalShapePicker({
  dielineId,
  options,
  currentShapeId,
  suggestedShapeId,
}: {
  dielineId: string
  options: ShapeOption[]
  currentShapeId: string | null
  suggestedShapeId: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [shapeId, setShapeId] = useState<string | null>(currentShapeId)

  function map(next: string | null) {
    setShapeId(next)
    start(async () => {
      const r = await mapDielineToShape(dielineId, next)
      if (!r.ok) {
        toast.error(r.error)
        setShapeId(currentShapeId)
        return
      }
      toast.success(next ? 'Mapped to canonical shape' : 'Unmapped')
      router.refresh()
    })
  }

  const suggested = suggestedShapeId ? options.find((o) => o.id === suggestedShapeId) : null
  const grouped = useMemo(() => {
    const m = new Map<string, ShapeOption[]>()
    for (const o of options) {
      const arr = m.get(o.category) ?? []
      arr.push(o)
      m.set(o.category, arr)
    }
    return [...m.entries()]
  }, [options])

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Boxes className="h-4 w-4 text-pink-600" />
        <h2 className="text-[13.5px] font-bold text-ink-900">Canonical shape</h2>
        {shapeId ? (
          <span className="rounded-full border border-success-200 bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
            Mapped
          </span>
        ) : (
          <span className="rounded-full border border-warning-200 bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-800">
            Unmapped
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] text-ink-500">
        Map this submission to a house-standard shape so its conventions stay consistent and it clusters with other
        partners&rsquo; die-lines of the same shape.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={shapeId ?? ''}
          disabled={pending}
          onChange={(e) => map(e.target.value || null)}
          className="min-w-[260px] rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
        >
          <option value="">— Not mapped —</option>
          {grouped.map(([cat, opts]) => (
            <optgroup key={cat} label={cat.replace(/_/g, ' ').toLowerCase()}>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.widthMm}×{o.heightMm}mm)
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {suggested && shapeId !== suggested.id && (
          <button
            onClick={() => map(suggested.id)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-3 py-1.5 text-[12px] font-semibold text-pink-700 hover:bg-pink-100 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> Suggested: {suggested.name}
          </button>
        )}
      </div>

      {/* Design authoring: once a die-line is mapped to a canonical shape, the
          admin can open the Design Studio on that shape to author a template
          (manually or — later — via AI) that propagates to creators everywhere. */}
      <div className="mt-4 border-t border-ink-100 pt-3">
        {shapeId ? (
          <a
            href={`${CREATOR_URL}/studio?adminMode=1&dieCut=${shapeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-800"
          >
            <Palette className="h-4 w-4" /> Design in Studio
          </a>
        ) : (
          <p className="text-[12px] text-ink-400">Map this die-line to a shape to design a template on it in the Studio.</p>
        )}
      </div>
    </div>
  )
}

const CREATOR_URL = process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'

function Panel({ title, subtitle, children, action }: { title: string; subtitle: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
        <div>
          <p className="text-[12.5px] font-bold text-ink-800">{title}</p>
          <p className="text-[11px] text-ink-500">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function OriginalPreview({ original }: { original: Props['original'] }) {
  if (!original) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-ink-200 bg-ink-50/40 text-center">
        <p className="px-6 text-[12.5px] text-ink-400">No original file is attached to this die-line.</p>
      </div>
    )
  }
  const ct = original.contentType.toLowerCase()
  const isImage = ct.startsWith('image/')
  const isPdf = ct.includes('pdf')

  return (
    <div className="space-y-2">
      <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={original.url} alt={original.filename} className="max-h-[360px] w-full object-contain" />
        ) : isPdf ? (
          <iframe src={original.url} title={original.filename} className="h-[360px] w-full" />
        ) : (
          <a
            href={original.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
          >
            Open {original.filename}
          </a>
        )}
      </div>
      <p className="truncate text-[11px] text-ink-400">{original.filename}</p>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</span>
      <input
        type="number"
        min={0}
        step={0.5}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      />
    </label>
  )
}
