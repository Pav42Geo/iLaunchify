'use server'

// Admin generated-templates pool — curation actions (AI_PACKAGING_GENERATOR §8).
//   • setGenerationFeatured — shortlist a creator generation in the pool.
//   • promoteGenerationToStarter — publish it into the Starter (premium) gallery as a
//     BrandTemplate. Needs a persisted concept image (R2); until then, admins author
//     premium templates from the concept via the Studio (Open-in-Studio deep link).
// catalog:write-gated + audited. Cast-guarded so it degrades before db:push.

import { prisma, getOrCreateSystemTemplatesBrand, createBrandTemplate } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

type GenDelegate = {
  findUnique: (a: unknown) => Promise<{
    id: string
    title: string | null
    promptJson: unknown
    containerCategory: string | null
    aspectBucket: string | null
    savedTemplateId: string | null
    variationKeys: string[] | null
  } | null>
  update: (a: unknown) => Promise<unknown>
}
const gen = () => (prisma as unknown as { aiDesignGeneration?: GenDelegate }).aiDesignGeneration ?? null

/** Admin shortlist toggle. */
export async function setGenerationFeatured(generationId: string, featured: boolean): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const row = await gen()?.findUnique({ where: { id: generationId }, select: { id: true } as unknown as never }).catch(() => null)
  if (!row) return { ok: false, error: 'Not found (is the schema pushed?).' }
  await gen()?.update({ where: { id: generationId }, data: { featured } }).catch(() => {})
  await logAuditAs(admin, { entityType: 'AiDesignGeneration', entityId: generationId, action: featured ? 'ai-pool.featured' : 'ai-pool.unfeatured' })
  revalidatePath('/ai-generator/pool')
  return { ok: true }
}

/** A Fabric canvas JSON with the concept image as a full-bleed background. */
function imageCanvasJson(url: string): string {
  return JSON.stringify({
    version: '5.3.0',
    objects: [{ type: 'image', src: url, left: 0, top: 0, scaleX: 1, scaleY: 1, selectable: false }],
  })
}

/** Publish a generation into the Starter (premium) gallery as a BrandTemplate. */
export async function promoteGenerationToStarter(generationId: string): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const row = await gen()
    ?.findUnique({
      where: { id: generationId },
      select: { id: true, title: true, promptJson: true, containerCategory: true, aspectBucket: true, savedTemplateId: true, variationKeys: true } as unknown as never,
    })
    .catch(() => null)
  if (!row) return { ok: false, error: 'Not found (is the schema pushed?).' }
  if (row.savedTemplateId) return { ok: false, error: 'Already promoted.' }

  const imageUrl = row.variationKeys?.[0]
  if (!imageUrl) {
    return { ok: false, error: 'This concept has no persisted image yet (needs R2). Open it in the Studio to author a premium template.' }
  }

  const p = (row.promptJson && typeof row.promptJson === 'object' ? (row.promptJson as Record<string, unknown>) : {}) as Record<string, unknown>
  const domain = typeof p.domain === 'string' ? p.domain : 'FOOD'
  const name = (row.title ?? 'AI concept').slice(0, 80)

  const brandId = await getOrCreateSystemTemplatesBrand()
  if (!brandId) return { ok: false, error: 'Could not initialize the templates library.' }

  const created = await createBrandTemplate({
    brandId,
    name,
    canvasJson: imageCanvasJson(imageUrl),
    thumbnailUrl: imageUrl,
    isPremium: true,
    matchMode: 'SHAPE_FAMILY',
    ...(domain ? { domain: domain as never } : {}),
    ...(row.containerCategory ? { targetContainerCategory: row.containerCategory as never } : {}),
    ...(row.aspectBucket ? { aspectBucket: row.aspectBucket as never } : {}),
  })
  if (!created) return { ok: false, error: 'Could not create the premium template.' }

  await gen()?.update({ where: { id: generationId }, data: { savedTemplateId: created.id } }).catch(() => {})
  await logAuditAs(admin, { entityType: 'BrandTemplate', entityId: created.id, action: 'PREMIUM_TEMPLATE_CREATED', payload: { fromGeneration: generationId, domain } })
  revalidatePath('/ai-generator/pool')
  return { ok: true }
}
