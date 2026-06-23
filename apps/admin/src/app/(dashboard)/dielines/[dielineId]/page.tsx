// =============================================================================
// Admin Die-line Curator (Slice C9.g) — open one partner die-line, see the
// immutable original alongside the live NORMALIZED preview, standardize the
// trim/bleed/safe spec, and save an ADMIN_VERIFIED normalized copy.
//
// The original partner file is NEVER edited — it renders read-only on the left
// for reference. The admin shapes only the structured spec on the right, which
// regenerates the normalized SVG the creator Studio consumes.
// docs/builds/_V1_DIELINE_NORMALIZATION.md §"Admin verification".
// =============================================================================

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { DielineCurator } from './DielineCurator'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Curate die-line — Admin' }

type Box = { x: number; y: number; w: number; h: number }

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

export default async function DielineCuratorPage({
  params,
}: {
  params: Promise<{ dielineId: string }>
}) {
  const { dielineId } = await params

  const dl = await prisma.packagingDieline.findUnique({
    where: { id: dielineId },
    select: {
      id: true,
      status: true,
      decorationMethod: true,
      originalFileFormat: true,
      widthMm: true,
      heightMm: true,
      bleedMm: true,
      trimBox: true,
      safeAreaBox: true,
      foldLines: true,
      surfaces: true,
      frames: true,
      normalizedSvgKey: true,
      parseAccuracyScore: true,
      partnerConfirmedAt: true,
      adminVerifiedAt: true,
      packagingType: { select: { displayName: true } },
      partnerService: { select: { partner: { select: { companyName: true } } } },
      partnerFile: { select: { r2Key: true, originalFilename: true, contentType: true } },
    },
  })
  if (!dl) notFound()

  // Signed, short-lived URL for the read-only original preview (never the raw key).
  let original: { url: string; contentType: string; filename: string } | null = null
  if (dl.partnerFile) {
    const url = await getSignedReadUrl(dl.partnerFile.r2Key).catch(() => null)
    if (url) {
      original = {
        url,
        contentType: dl.partnerFile.contentType,
        filename: dl.partnerFile.originalFilename,
      }
    }
  }

  // Spec mode seeds from the mm dims (physical geometry). Safe inset defaults to
  // 3mm — it only feeds the generated normalized SVG (no dedicated mm column).
  const width = num(dl.widthMm) || 100
  const height = num(dl.heightMm) || 100
  const bleed = num(dl.bleedMm, 3)
  const safeInset = 3

  // Frames mode seeds from the NormBox (0..1) guide columns owned by the editor.
  const normBox = (v: unknown, fb: Box): Box => {
    const b = v as Partial<Box> | null
    return b && [b.x, b.y, b.w, b.h].every((n) => typeof n === 'number')
      ? { x: b.x as number, y: b.y as number, w: b.w as number, h: b.h as number }
      : fb
  }
  const initialTrim = normBox(dl.trimBox, { x: 0, y: 0, w: 1, h: 1 })
  const initialSafe = normBox(dl.safeAreaBox, { x: 0.05, y: 0.05, w: 0.9, h: 0.9 })

  // Backdrop for frame placement: prefer the normalized SVG (uniform), else the
  // original file. Original links are signed, short-lived.
  let normalizedUrl: string | null = null
  if (dl.normalizedSvgKey) {
    normalizedUrl = await getSignedReadUrl(dl.normalizedSvgKey).catch(() => null)
  }

  const curatedBefore = dl.normalizedSvgKey != null && dl.adminVerifiedAt != null

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dielines"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-4 w-4" /> Die-line review
        </Link>
      </div>

      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">Packaging · Die-line Curator</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          {dl.packagingType.displayName}
        </h1>
        <p className="mt-1 text-[13px] text-ink-600">
          {dl.partnerService.partner.companyName} · {dl.decorationMethod.replace(/_/g, ' ').toLowerCase()} ·{' '}
          {dl.originalFileFormat ?? 'no file'}
          {dl.parseAccuracyScore != null ? ` · parse ${Math.round(num(dl.parseAccuracyScore) * 100)}%` : ''}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-ink-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
            {dl.status.toLowerCase().replace(/_/g, ' ')}
          </span>
          {curatedBefore && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              normalized {new Date(dl.adminVerifiedAt as Date).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <DielineCurator
        dielineId={dl.id}
        status={dl.status}
        initial={{ widthMm: width, heightMm: height, bleedMm: bleed, safeAreaMm: safeInset }}
        foldLines={(dl.foldLines as DielineCuratorFold[] | null) ?? null}
        surfaces={(dl.surfaces as DielineCuratorSurface[] | null) ?? null}
        original={original}
        frames={(dl.frames as unknown) ?? null}
        initialTrim={initialTrim}
        initialSafe={initialSafe}
        normalizedUrl={normalizedUrl}
        format={dl.originalFileFormat}
      />
    </div>
  )
}

// Local structural aliases so the server file doesn't depend on the UI package's
// types at the RSC boundary — the client component owns the real generation.
type DielineCuratorFold = { x1: number; y1: number; x2: number; y2: number; type?: string }
type DielineCuratorSurface = { name: string; trimBox?: { x: number; y: number; w: number; h: number } | null }
