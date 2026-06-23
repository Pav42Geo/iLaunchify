'use client'

// Side-by-side die-line curator (Slice C9.g).
//   • Left  — the partner's ORIGINAL file, read-only (never edited).
//   • Right — the live NORMALIZED preview, regenerated from the structured spec
//             as the admin edits trim / bleed / safe values.
// Saving regenerates + stores the normalized SVG and marks the die-line
// ADMIN_VERIFIED + ACTIVE.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, FileWarning, ShieldCheck, SlidersHorizontal, LayoutGrid, ArrowLeft, Check, Boxes, Sparkles } from 'lucide-react'
import {
  dielineSvgFromSpec,
  DielineFrameEditor,
  DEFAULT_FRAME_LAYOUT,
  type DielineFold,
  type DielineSurface,
  type FrameLayout,
  type NormBox,
} from '@ilaunchify/ui'
import { curateDieline, saveAdminDielineFrames, saveAdminDielineGeometry, mapDielineToShape } from '../actions'

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

        <Panel title="Normalized preview" subtitle="Regenerated live from the spec below">
          <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-ink-100 bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-4">
            {svg ? (
              <div
                className="w-full max-w-[420px] [&_svg]:h-auto [&_svg]:w-full"
                // SVG is generated by our own pure function from numeric inputs — no user HTML.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <p className="text-[12.5px] text-ink-400">Enter valid trim dimensions to preview.</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-pink-600" />
          <h2 className="text-[13.5px] font-bold text-ink-900">Standardize the spec</h2>
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
          <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
            <FileWarning className="h-3.5 w-3.5" /> Width and height must be positive; safe inset must fit inside the trim.
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-400">
            The original file stays immutable. Saving stores a normalized copy and stamps the die-line verified.
          </p>
          <button
            onClick={save}
            disabled={pending || !valid || !canSave}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {pending ? 'Saving…' : 'Save normalized & verify'}
          </button>
        </div>
      </div>
    </div>
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
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            Mapped
          </span>
        ) : (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
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
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="border-b border-ink-100 bg-zinc-50/60 px-4 py-2.5">
        <p className="text-[12.5px] font-bold text-ink-800">{title}</p>
        <p className="text-[11px] text-ink-500">{subtitle}</p>
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
      <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl border border-ink-100 bg-zinc-50">
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
