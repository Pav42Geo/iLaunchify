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

import { notFound } from 'next/navigation'
import { prisma, getCanonicalShapeOptions, listDielineCanonicalLinks } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { aspectBucketFor } from '@ilaunchify/ui'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
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

  // Canonical shape mapping (P2): options + current mapping + a suggested match
  // (canonical shapes whose aspect bucket matches this die-line's dims, nearest
  // area first). Degrades to no suggestion when dims/options are missing.
  const shapeOptions = await getCanonicalShapeOptions().catch(() => [])
  const [link] = await listDielineCanonicalLinks([dl.id])
  const currentShapeId = link?.canonicalShapeId ?? null
  const bucket = width > 0 && height > 0 ? aspectBucketFor(width, height) : null
  const suggestedShapeId =
    bucket && !currentShapeId
      ? (shapeOptions
          .filter((o) => o.widthMm > 0 && o.heightMm > 0 && aspectBucketFor(o.widthMm, o.heightMm) === bucket)
          .sort(
            (a, b) =>
              Math.abs(a.widthMm * a.heightMm - width * height) -
              Math.abs(b.widthMm * b.heightMm - width * height),
          )[0]?.id ?? null)
      : null

  return (
    <div className="space-y-6">
      <AdminDetailHeader
        backHref="/dielines"
        backLabel="Die-line review"
        eyebrow="Packaging · Die-line Curator"
        title={dl.packagingType.displayName}
        meta={
          <span className="text-[13px] text-ink-600">
            {dl.partnerService.partner.companyName} · {dl.decorationMethod.replace(/_/g, ' ').toLowerCase()} ·{' '}
            {dl.originalFileFormat ?? 'no file'}
            {dl.parseAccuracyScore != null ? ` · parse ${Math.round(num(dl.parseAccuracyScore) * 100)}%` : ''}
          </span>
        }
        status={
          <>
            <span className="rounded-full border border-ink-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
              {dl.status.toLowerCase().replace(/_/g, ' ')}
            </span>
            {curatedBefore && (
              <span className="rounded-full border border-success-200 bg-success-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-success-700">
                normalized {new Date(dl.adminVerifiedAt as Date).toLocaleDateString()}
              </span>
            )}
          </>
        }
      />

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
        shapeOptions={shapeOptions}
        currentShapeId={currentShapeId}
        suggestedShapeId={suggestedShapeId}
      />
    </div>
  )
}

// Local structural aliases so the server file doesn't depend on the UI package's
// types at the RSC boundary — the client component owns the real generation.
type DielineCuratorFold = { x1: number; y1: number; x2: number; y2: number; type?: string }
type DielineCuratorSurface = { name: string; trimBox?: { x: number; y: number; w: number; h: number } | null }
