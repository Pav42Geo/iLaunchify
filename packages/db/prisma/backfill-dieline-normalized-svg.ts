// A12 — normalizedSvgKey backfill for verified die-lines (self-design-on-dieline).
//
// D-S2 makes the room label Studio design ONLY on a die-line that has a curated
// normalizedSvg; die-lines without one are honestly blocked ("being prepared").
// Most PackagingDielines never went through the admin Die-line Curator, so their
// normalizedSvgKey is null. This backfill generates the normalized SVG from each
// die-line's confirmed STRUCTURED SPEC (the same dielineSvgFromSpec the Studio
// export uses), uploads it to R2, and stores the key — unblocking self-design.
//
// DRY-RUN by default (prints what it would do). Writes only with --apply.
// Run AFTER `pnpm db:push` + `pnpm db:generate`, from repo root:
//   pnpm --filter @ilaunchify/db backfill:dieline-svg            # dry run
//   pnpm --filter @ilaunchify/db backfill:dieline-svg -- --apply # write
//
// Idempotent: only die-lines with normalizedSvgKey == null are touched. This
// generates the SAME geometry the Curator would; when the Curator later runs, it
// overwrites the key cleanly (dielineNormalizedKey namespaces per-write).

import { PrismaClient } from '@prisma/client'
// Direct file import (NOT the @ilaunchify/ui barrel) — dielineSvgFromSpec is a
// pure, React-free module; the barrel would drag client components into tsx.
import { dielineSvgFromSpec, type DielineSpecInput } from '../../ui/src/canvas/dielineSvg'
import { uploadFile, dielineNormalizedKey } from '@ilaunchify/storage'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'object' && 'toNumber' in (v as object) ? (v as { toNumber(): number }).toNumber() : Number(v)
  return Number.isFinite(n) ? n : null
}

async function main() {
  const rows = await prisma.packagingDieline.findMany({
    where: { status: { in: ['ADMIN_VERIFIED', 'ACTIVE'] }, normalizedSvgKey: null },
    select: {
      id: true,
      widthMm: true,
      heightMm: true,
      bleedMm: true,
      trimBox: true,
      safeAreaBox: true,
      foldLines: true,
      surfaces: true,
    },
  })

  let done = 0
  let skipped = 0
  for (const d of rows) {
    const widthMm = num(d.widthMm)
    const heightMm = num(d.heightMm)
    // Need real finished dimensions to emit meaningful geometry.
    if (!widthMm || !heightMm || widthMm <= 0 || heightMm <= 0) {
      skipped++
      // eslint-disable-next-line no-console
      console.log(`  ⤫ skip ${d.id} — missing width/height`)
      continue
    }

    const spec: DielineSpecInput = {
      widthMm,
      heightMm,
      bleedMm: num(d.bleedMm) ?? 3,
      trimBox: (d.trimBox as unknown as DielineSpecInput['trimBox']) ?? null,
      safeAreaBox: (d.safeAreaBox as unknown as DielineSpecInput['safeAreaBox']) ?? null,
      foldLines: (d.foldLines as unknown as DielineSpecInput['foldLines']) ?? null,
      surfaces: (d.surfaces as unknown as DielineSpecInput['surfaces']) ?? null,
    }
    const svg = dielineSvgFromSpec(spec)

    if (!APPLY) {
      // eslint-disable-next-line no-console
      console.log(`  • would backfill ${d.id} (${widthMm}×${heightMm}mm, ${svg.length} bytes)`)
      done++
      continue
    }

    const key = dielineNormalizedKey({ dielineId: d.id })
    await uploadFile({ key, body: Buffer.from(svg, 'utf8'), contentType: 'image/svg+xml' })
    await prisma.packagingDieline.update({ where: { id: d.id }, data: { normalizedSvgKey: key } })
    done++
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${d.id} → ${key}`)
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n${APPLY ? 'Backfill complete' : 'DRY RUN (pass --apply to write)'} — ${done} die-line(s) ${APPLY ? 'normalized' : 'ready'}, ${skipped} skipped (no dims), of ${rows.length} candidate(s).`,
  )
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
