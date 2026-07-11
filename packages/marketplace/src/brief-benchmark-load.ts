// DB loader for the brief benchmark — assembles comparable rows from
// PUBLISHED ProductTemplates in the brief's category, then hands them to the
// pure computeBriefBenchmark. Server-side only (Prisma), same split as
// suggestNiches / niche-rule-eval.

import { prisma, getCoCreationSettings } from '@ilaunchify/db'
import {
  computeBriefBenchmark,
  type BenchmarkRow,
  type BriefBenchmark,
} from './brief-benchmark'

export async function loadBriefBenchmark(input: {
  categoryId: string
  nicheSlug: string
  makerFormulates: boolean
}): Promise<BriefBenchmark | null> {
  const templates = await prisma.productTemplate.findMany({
    where: { status: 'PUBLISHED', subcategory: { categoryId: input.categoryId } },
    select: {
      unitCostCents: true,
      niches: { select: { niche: { select: { slug: true } } } },
      variants: {
        where: { isActive: true },
        select: { moqMin: true, leadTimeDays: true, unitCostCentsOverride: true },
      },
    },
    take: 500,
  })

  const rows: BenchmarkRow[] = templates.map((t) => {
    const overrides = t.variants
      .map((v) => v.unitCostCentsOverride)
      .filter((c): c is number => typeof c === 'number' && c > 0)
    const moqs = t.variants.map((v) => v.moqMin).filter((m) => m > 0)
    const leads = t.variants.map((v) => v.leadTimeDays).filter((d) => d > 0)
    return {
      // Cheapest sellable configuration represents the template's entry price.
      unitCostCents: overrides.length
        ? Math.min(...overrides)
        : t.unitCostCents > 0
          ? t.unitCostCents
          : null,
      moqMin: moqs.length ? Math.min(...moqs) : null,
      leadTimeDays: leads.length ? Math.min(...leads) : null,
      nicheMatch: t.niches.some((n) => n.niche.slug === input.nicheSlug),
    }
  })

  const settings = await getCoCreationSettings()
  return computeBriefBenchmark(rows, {
    makerFormulates: input.makerFormulates,
    minSample: settings.benchmarkMinSample,
  })
}
