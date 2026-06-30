// Slice 6 backfill (docs/PER_FLAVOR_RECIPES.md §7.6) — one-time, idempotent.
//
// Existing multi-flavor products predate the per-flavor recipe models: each
// FlavorPreset carried only `extras` (flavor-only add-ons) on top of the shared
// template recipe (TemplateIngredientSlot[]). The live multi-flavor path now
// reads each flavor's OWN FlavorRecipeSlot[] / FlavorRecipeReplacement[] /
// FlavorRecipeOptional[]. This script materializes those rows for every flavor
// that doesn't have them yet, seeding from:
//     base recipe (clone of the template's slots + replacements + optionals)
//   + that flavor's `extras` (appended as extra slots)
//
// Idempotent: a FlavorPreset that already has recipeSlots is skipped, so the
// script is safe to re-run. DRY-RUN by default — pass --apply (or set
// BACKFILL_APPLY=1) to write. Optional --only=<productTemplateId> to scope.
//
// Run (after `pnpm --filter @ilaunchify/db generate`):
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/backfill-flavor-recipes.ts            # dry run
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/backfill-flavor-recipes.ts --apply    # write

import { PrismaClient } from '@prisma/client'
import { planFlavorRecipe, parseExtras, type BaseSlotInput, type BaseOptionalInput } from './flavor-recipe-backfill-plan'

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// I/O driver. Pure transforms live in ./flavor-recipe-backfill-plan.ts.
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply') || process.env.BACKFILL_APPLY === '1'
  const onlyArg = args.find((a) => a.startsWith('--only='))?.split('=')[1] ?? null

  console.log(`\n🍓 Per-flavor recipe backfill — ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}${onlyArg ? ` · only template ${onlyArg}` : ''}\n`)

  // Flavors with NO per-flavor recipe yet (idempotent gate).
  const presets = await prisma.flavorPreset.findMany({
    where: {
      recipeSlots: { none: {} },
      ...(onlyArg ? { productTemplateId: onlyArg } : {}),
    },
    select: { id: true, name: true, productTemplateId: true, extras: true, sortOrder: true },
    orderBy: [{ productTemplateId: 'asc' }, { sortOrder: 'asc' }],
  })

  if (presets.length === 0) {
    console.log('✓ Nothing to backfill — every multi-flavor preset already has a per-flavor recipe.\n')
    return
  }

  // Cache base recipes per template (loaded once).
  const baseCache = new Map<string, { slots: BaseSlotInput[]; optionals: BaseOptionalInput[] }>()
  async function baseFor(templateId: string) {
    const cached = baseCache.get(templateId)
    if (cached) return cached
    const [slots, optionals] = await Promise.all([
      prisma.templateIngredientSlot.findMany({
        where: { productTemplateId: templateId },
        select: {
          baseIngredientId: true, weightG: true, costPerKgCents: true, displayOrder: true, allowReplacement: true, label: true, description: true,
          replacements: { select: { ingredientId: true, weightGOverride: true, displayOrder: true, calloutText: true } },
        },
      }),
      prisma.templateOptionalIngredient.findMany({
        where: { productTemplateId: templateId },
        select: { ingredientId: true, weightG: true, displayOrder: true, calloutText: true },
      }),
    ])
    const base = { slots: slots as unknown as BaseSlotInput[], optionals: optionals as unknown as BaseOptionalInput[] }
    baseCache.set(templateId, base)
    return base
  }

  let presetsDone = 0, slotsCreated = 0, replacementsCreated = 0, optionalsCreated = 0, skippedExtrasTotal = 0, presetsWithoutBase = 0
  const byTemplate = new Map<string, number>()

  for (const p of presets) {
    const base = await baseFor(p.productTemplateId)
    const plan = planFlavorRecipe(base, parseExtras(p.extras))

    if (plan.slots.length === 0) {
      presetsWithoutBase++
      console.log(`  ⚠︎ ${p.name} (${p.id}) — template ${p.productTemplateId} has no base recipe and no usable extras; nothing to seed.`)
      continue
    }
    if (plan.skippedExtras.length) {
      skippedExtrasTotal += plan.skippedExtras.length
      console.log(`  ⚠︎ ${p.name} (${p.id}) — skipped ${plan.skippedExtras.length} extra(s) with no ingredientId (custom): ${plan.skippedExtras.map((e) => e.name ?? '?').join(', ')}`)
    }

    const planReplacements = plan.slots.reduce((n, s) => n + s.replacements.length, 0)
    console.log(`  • ${p.name} (${p.id}): ${plan.slots.length} slot(s) [${plan.slots.filter((s) => s.origin === 'extra').length} from extras], ${planReplacements} replacement(s), ${plan.optionals.length} optional(s)`)

    if (apply) {
      await prisma.$transaction(async (tx) => {
        for (const s of plan.slots) {
          await tx.flavorRecipeSlot.create({
            data: {
              flavorPresetId: p.id,
              baseIngredientId: s.baseIngredientId,
              weightG: s.weightG,
              costPerKgCents: s.costPerKgCents,
              displayOrder: s.displayOrder,
              allowReplacement: s.allowReplacement,
              label: s.label,
              description: s.description,
              replacements: s.replacements.length
                ? { create: s.replacements.map((r) => ({ ingredientId: r.ingredientId, weightGOverride: r.weightGOverride, displayOrder: r.displayOrder, calloutText: r.calloutText })) }
                : undefined,
            },
          })
        }
        if (plan.optionals.length) {
          await tx.flavorRecipeOptional.createMany({
            data: plan.optionals.map((o) => ({ flavorPresetId: p.id, ingredientId: o.ingredientId, weightG: o.weightG, displayOrder: o.displayOrder, calloutText: o.calloutText })),
            skipDuplicates: true,
          })
        }
      })
    }

    presetsDone++
    slotsCreated += plan.slots.length
    replacementsCreated += planReplacements
    optionalsCreated += plan.optionals.length
    byTemplate.set(p.productTemplateId, (byTemplate.get(p.productTemplateId) ?? 0) + 1)
  }

  console.log(`\n────────────────────────────────────────`)
  console.log(`Templates touched:      ${byTemplate.size}`)
  console.log(`Flavor presets seeded:  ${presetsDone}${presetsWithoutBase ? ` (+${presetsWithoutBase} had no base recipe — skipped)` : ''}`)
  console.log(`FlavorRecipeSlots:      ${slotsCreated}`)
  console.log(`FlavorRecipeReplacements: ${replacementsCreated}`)
  console.log(`FlavorRecipeOptionals:  ${optionalsCreated}`)
  if (skippedExtrasTotal) console.log(`Custom extras skipped:  ${skippedExtrasTotal} (no ingredientId — re-author in the builder)`)
  console.log(apply ? `\n✅ Backfill applied.\n` : `\n👀 Dry run only — re-run with --apply to write.\n`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
