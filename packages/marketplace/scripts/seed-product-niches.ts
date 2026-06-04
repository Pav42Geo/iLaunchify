// B3 — assign seeded ProductTemplates to niches via the deterministic engine.
//
// The /launch/[niche] pages + marketplace niche filter are already DB-wired
// (ProductTemplateNiche join), but no products were assigned to niches, so the
// niche surfaces rendered empty. This backfills assignments through the
// SANCTIONED governed path — suggestNiches (the locked NicheRule engine) — and
// writes a NicheAssignmentAudit (source AUTO_RULE) per assignment. It invents
// no taxonomy: a template only lands in a niche its rules already match. Niches
// with no rule hits stay empty until more NicheRules are curated (governed).
//
// Idempotent. Run after the main seed:
//   pnpm --filter @ilaunchify/marketplace run seed:product-niches

import { prisma } from '@ilaunchify/db'
import { suggestNiches } from '../src/suggestNiches'
import { recordNicheAssignment } from '../src/recordNicheAssignment'

async function main(): Promise<void> {
  const templates = await prisma.productTemplate.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, name: true },
  })

  let assigned = 0
  let skipped = 0
  for (const t of templates) {
    const { suggestions } = await suggestNiches({ productTemplateId: t.id })
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i]!
      const existing = await prisma.productTemplateNiche.findUnique({
        where: { productTemplateId_nicheId: { productTemplateId: t.id, nicheId: s.nicheId } },
      })
      if (existing) {
        skipped++
        continue
      }
      // First (highest-weight) suggestion is the primary niche for the template.
      await prisma.productTemplateNiche.create({
        data: { productTemplateId: t.id, nicheId: s.nicheId, isPrimary: i === 0 },
      })
      await recordNicheAssignment({
        productTemplateId: t.id,
        nicheId: s.nicheId,
        source: 'AUTO_RULE',
        ruleId: s.ruleId,
        applied: true,
      })
      assigned++
      // eslint-disable-next-line no-console
      console.log(`  + ${t.name} → ${s.nicheSlug}${i === 0 ? ' (primary)' : ''}`)
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n✓ ${assigned} new niche assignment(s) across ${templates.length} published templates (${skipped} already present).`,
  )
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
