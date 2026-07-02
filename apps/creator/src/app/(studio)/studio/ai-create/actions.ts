'use server'

// =============================================================================
// AI Create — generation server actions (AI_PACKAGING_GENERATOR §5/§13).
//
// The AiDesignGeneration FSM: QUEUED → RUNNING → READY | FAILED. Two entry points:
//   • generateAiConcepts   — draft cycle: budget-check → provider → persist usage +
//     an AiDesignGeneration row → return concept SVG/URLs for the panel to preview.
//   • finalizeAiConcept    — upscale the chosen concept to print res, debit the
//     finalize megapixels + stored bytes, flip the row to READY.
//
// Runs TODAY against the deterministic stub (no keys); the moment FAL_KEY /
// RECRAFT_API_KEY land in the env, resolveImageGenProvider swaps in fal + Recraft
// with no code change here. All metering math is the pure @ilaunchify/imagegen
// engine; all writes are cast-guarded so this compiles + degrades before db:push.
// Tier-gated: Builder/Agency creators + admin only (Maker → premium templates).
// =============================================================================

import { prisma } from '@ilaunchify/db'
import { requireUser, getCreatorTier, requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { loadAiCreateProps, loadAdminAiCreateProps, loadGenerationLibrary, loadStarterGallery, type AiCreateData } from './loader'
import type { LibraryItem, LibraryScope } from './library-types'
import {
  resolveImageGenProvider,
  runDraftGeneration,
  runFinalizeGeneration,
  tierLimits,
  estimateStoredTemplateBytes,
  type CreatorBillingTier,
} from '@ilaunchify/imagegen'
import type { LabelingDomain, MarketCode } from '@ilaunchify/ai-design'
import { deriveTemplateTargeting } from '@ilaunchify/ui'

/** Load the in-canvas AI drawer's props for a product the caller owns (die-line set,
 *  brand palette, domain, tier, per-domain chip vocab, credits). Thin authed wrapper
 *  over the shared loader so the Studio drawer can fetch on open. */
export async function getAiCreateDrawerProps(productId: string): Promise<AiCreateData | null> {
  const user = await requireUser()
  return loadAiCreateProps(productId, user.id)
}

/** Admin (template-author) variant of the drawer props — product-less, targets a chosen
 *  die-cut + domain, unmetered admin tier. Lets the in-canvas AI drawer open in Admin Mode
 *  with the SAME enhanced AiCreatePanel the creator gets. catalog:write-gated. */
export async function getAiCreateDrawerPropsAdmin(input: { dieCutId?: string | null; domain?: string }): Promise<AiCreateData | null> {
  await requireCapability('catalog:write')
  return loadAdminAiCreateProps({ dieCutId: input.dieCutId ?? undefined, domain: input.domain })
}

function periodKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function meteredTier(tier: string): CreatorBillingTier {
  return (['builder', 'agency'] as const).includes(tier as never) ? (tier as CreatorBillingTier) : tier === 'admin' ? 'agency' : 'maker'
}

/** Effective tier for metering: admins (template-author mode) bill as 'admin' →
 *  agency caps, regardless of any CreatorProfile; creators use their real tier. */
async function callerTier(user: { id: string; role?: string }): Promise<string> {
  if (user.role === 'ADMIN') return 'admin'
  return getCreatorTier(user.id).catch(() => 'maker' as const)
}

// --- cast-guarded delegates (compile + degrade before the schema is pushed) ---
type GenDelegate = {
  create: (a: unknown) => Promise<{ id: string }>
  update: (a: unknown) => Promise<unknown>
}
type UsageDelegate = {
  findUnique: (a: unknown) => Promise<{ draftCyclesUsed: number; finalizeMpUsed: unknown } | null>
  upsert: (a: unknown) => Promise<unknown>
}
type StorageDelegate = {
  findUnique: (a: unknown) => Promise<{ kilobytesUsed: number } | null>
  upsert: (a: unknown) => Promise<unknown>
}
const genDelegate = () => (prisma as unknown as { aiDesignGeneration?: GenDelegate }).aiDesignGeneration ?? null
const usageDelegate = () => (prisma as unknown as { aiGenerationUsage?: UsageDelegate }).aiGenerationUsage ?? null
const storageDelegate = () => (prisma as unknown as { generationStorageUsage?: StorageDelegate }).generationStorageUsage ?? null

export interface GenerateConceptsInput {
  /** Assembled prompt from planGeneration() (positive + negative). */
  prompt: string
  negativePrompt: string
  /** Keep-clear mask SVG/URL — structure lock (die-line + reserved zones). */
  mask?: string
  /** The die-line surface being designed, in px (draft ~1 MP; caller sizes it). */
  widthPx: number
  heightPx: number
  /** Context for provenance + the AiDesignGeneration row. */
  dielineId?: string
  productTemplateId?: string
  brandId?: string
  brandPalette?: string[]
  brandRefUrl?: string
  domain: LabelingDomain
  market?: MarketCode
  /** compliance report at gen time (legal reproducibility). */
  complianceJson?: Record<string, unknown>
  seed?: number
  /** Raw brief (descriptor + chips) stored so the generation can be re-run ("use as inspiration"). */
  brief?: { descriptor?: string; styleTags?: string[]; colorTags?: string[]; elementTags?: string[] }
  /** Creator-facing title (defaults from the descriptor). */
  title?: string
  /** Reshape provenance (DESIGN_RESHAPE_CROSS_DIELINE): which design this run was
   *  reshaped FROM and by which routed method. Stored in promptJson (P1); the
   *  parentId column lands with the P2 schema slice. */
  reshape?: { sourceId?: string | null; method: 'OUTPAINT' | 'REF_REGEN'; sourceBucket?: string | null; targetBucket?: string | null }
}

/** Resolve a die-line's shape family (container + aspect) for library filtering + the
 *  cross-die-line match gate. Synthetic "diecut:*" ids and missing rows → nulls. */
async function resolveShapeFamily(dielineId?: string): Promise<{ containerCategory: string | null; aspectBucket: string | null }> {
  if (!dielineId || dielineId.startsWith('diecut:')) return { containerCategory: null, aspectBucket: null }
  const row = (await (
    prisma as unknown as {
      packagingDieline?: { findUnique: (a: unknown) => Promise<{ widthMm: unknown; heightMm: unknown; canonicalShape: { category: string } | null } | null> }
    }
  ).packagingDieline
    ?.findUnique({ where: { id: dielineId }, select: { widthMm: true, heightMm: true, canonicalShape: { select: { category: true } } } })
    .catch(() => null)) as { widthMm: unknown; heightMm: unknown; canonicalShape: { category: string } | null } | null
  if (!row) return { containerCategory: null, aspectBucket: null }
  const t = deriveTemplateTargeting({
    containerCategory: row.canonicalShape?.category,
    widthMm: Number(String(row.widthMm ?? '')) || 100,
    heightMm: Number(String(row.heightMm ?? '')) || 150,
  })
  return { containerCategory: t.targetContainerCategory, aspectBucket: t.aspectBucket }
}

export type GenerateConceptsResult =
  | { ok: true; generationId: string | null; images: string[]; provider: string; remainingCycles: number }
  | { ok: false; error: string }

/** Draft cycle. Returns concept images (SVG markup or URLs) for the panel to preview. */
export async function generateAiConcepts(input: GenerateConceptsInput): Promise<GenerateConceptsResult> {
  const user = await requireUser()
  const tierKey = await callerTier(user)
  const tier = meteredTier(tierKey)
  const limits = tierLimits(tier)
  if (limits.draftCyclesPerPeriod <= 0) {
    return { ok: false, error: 'AI Create is available on Builder and Agency plans.' }
  }

  const pk = periodKey()
  const usage = await usageDelegate()?.findUnique({ where: { userId_periodKey: { userId: user.id, periodKey: pk } } }).catch(() => null)
  const usedCycles = usage?.draftCyclesUsed ?? 0

  const provider = resolveImageGenProvider(process.env as Record<string, string | undefined>)
  const n = Math.max(1, limits.draftVariations)
  const shape = await resolveShapeFamily(input.dielineId)
  const title = (input.title ?? input.brief?.descriptor ?? '').trim().slice(0, 80) || null

  // Create the run row (QUEUED→RUNNING) for provenance before calling the provider.
  const gen = await genDelegate()
    ?.create({
      data: {
        scope: 'CREATOR',
        status: 'RUNNING',
        authorUserId: user.id,
        productTemplateId: input.productTemplateId ?? null,
        dielineId: input.dielineId ?? null,
        brandId: input.brandId ?? null,
        promptJson: {
          prompt: input.prompt,
          negativePrompt: input.negativePrompt,
          domain: input.domain,
          market: input.market ?? 'US',
          palette: input.brandPalette ?? [],
          brief: input.brief ?? null,
          reshape: input.reshape ?? null,
        },
        provider: provider.backing.raster,
        complianceJson: input.complianceJson ?? undefined,
        title,
        containerCategory: shape.containerCategory,
        aspectBucket: shape.aspectBucket,
      },
    })
    .catch(() => null)

  const result = await runDraftGeneration({
    provider,
    limits,
    usedCycles,
    request: {
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      mask: input.mask,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      n,
      brandRefUrl: input.brandRefUrl,
      palette: input.brandPalette,
      seed: input.seed,
    },
  })

  if (!result.ok) {
    if (gen) await genDelegate()?.update({ where: { id: gen.id }, data: { status: 'FAILED' } }).catch(() => {})
    return { ok: false, error: result.reason ?? 'Generation failed.' }
  }

  // Persist: debit one draft cycle + flip the row to READY. Images returned inline
  // (stub SVG or provider URLs); R2 persistence of variationKeys lands with storage wiring.
  const images = result.images.map((r) => r.svg ?? r.url ?? '').filter(Boolean)
  await usageDelegate()
    ?.upsert({
      where: { userId_periodKey: { userId: user.id, periodKey: pk } },
      create: { userId: user.id, periodKey: pk, draftCyclesUsed: result.debit.draftCycles },
      update: { draftCyclesUsed: { increment: result.debit.draftCycles } },
    })
    .catch(() => {})
  if (gen) {
    await genDelegate()
      ?.update({ where: { id: gen.id }, data: { status: 'READY', variationKeys: [], creditsSpent: result.debit.draftCycles } })
      .catch(() => {})
  }

  await logAuditAs(user, {
    entityType: 'AiDesignGeneration',
    entityId: gen?.id ?? 'draft',
    action: 'AI_DESIGN_GENERATED',
    payload: { dielineId: input.dielineId ?? null, domain: input.domain, concepts: images.length, provider: provider.backing.raster },
  })

  const remainingCycles = Math.max(0, limits.draftCyclesPerPeriod - (usedCycles + result.debit.draftCycles))
  return { ok: true, generationId: gen?.id ?? null, images, provider: provider.id, remainingCycles }
}

export interface FinalizeConceptInput {
  /** The generation row this finalize belongs to (from generateAiConcepts). */
  generationId?: string
  /** Chosen concept — SVG markup or a raster URL. */
  concept: { svg?: string; url?: string; width: number; height: number }
  /** Print target. */
  widthMm: number
  heightMm: number
  dpi?: number
  svgBytes?: number
  thumbBytes?: number
}

export type FinalizeConceptResult =
  | { ok: true; image: { svg?: string; url?: string; width: number; height: number }; megapixels: number }
  | { ok: false; error: string }

/** Finalize (print-res). Debits finalize megapixels + stored bytes; flips the row READY. */
export async function finalizeAiConcept(input: FinalizeConceptInput): Promise<FinalizeConceptResult> {
  const user = await requireUser()
  const tierKey = await callerTier(user)
  const tier = meteredTier(tierKey)
  const limits = tierLimits(tier)
  if (limits.draftCyclesPerPeriod <= 0) return { ok: false, error: 'AI Create is available on Builder and Agency plans.' }

  const pk = periodKey()
  const usage = await usageDelegate()?.findUnique({ where: { userId_periodKey: { userId: user.id, periodKey: pk } } }).catch(() => null)
  const usedMp = Number(String(usage?.finalizeMpUsed ?? 0)) || 0
  const storage = await storageDelegate()?.findUnique({ where: { userId: user.id } }).catch(() => null)
  const usedBytes = (storage?.kilobytesUsed ?? 0) * 1024

  const provider = resolveImageGenProvider(process.env as Record<string, string | undefined>)
  const result = await runFinalizeGeneration({
    provider,
    limits,
    usedMp,
    usedBytes,
    draft: { kind: input.concept.svg ? 'vector' : 'raster', svg: input.concept.svg, url: input.concept.url, width: input.concept.width, height: input.concept.height },
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    dpi: input.dpi,
    svgBytes: input.svgBytes,
    thumbBytes: input.thumbBytes,
  })

  if (!result.ok) return { ok: false, error: result.reason ?? 'Finalize failed.' }

  const addKb = Math.ceil(estimateStoredTemplateBytes(result.debit.megapixels, { svgBytes: input.svgBytes, thumbBytes: input.thumbBytes }) / 1024)
  await usageDelegate()
    ?.upsert({
      where: { userId_periodKey: { userId: user.id, periodKey: pk } },
      create: { userId: user.id, periodKey: pk, finalizeMpUsed: result.debit.megapixels },
      update: { finalizeMpUsed: { increment: result.debit.megapixels } },
    })
    .catch(() => {})
  await storageDelegate()
    ?.upsert({ where: { userId: user.id }, create: { userId: user.id, kilobytesUsed: addKb }, update: { kilobytesUsed: { increment: addKb } } })
    .catch(() => {})
  if (input.generationId) {
    await genDelegate()
      ?.update({ where: { id: input.generationId }, data: { status: 'READY', finalizeMegapixels: result.debit.megapixels } })
      .catch(() => {})
  }

  await logAuditAs(user, {
    entityType: 'AiDesignGeneration',
    entityId: input.generationId ?? 'finalize',
    action: 'AI_DESIGN_FINALIZED',
    payload: { megapixels: result.debit.megapixels, kilobytes: addKb },
  })

  const img = result.image ?? { kind: 'raster' as const, width: input.concept.width, height: input.concept.height, url: input.concept.url, svg: input.concept.svg }
  return { ok: true, image: { svg: img.svg, url: img.url, width: img.width, height: img.height }, megapixels: result.debit.megapixels }
}

// -----------------------------------------------------------------------------
// Template library — favorite + brief reload ("use as inspiration")
// -----------------------------------------------------------------------------

type FavDelegate = {
  findFirst: (a: unknown) => Promise<{ id: string; favorited: boolean } | null>
  update: (a: unknown) => Promise<unknown>
}
const favDelegate = () => (prisma as unknown as { aiDesignGeneration?: FavDelegate }).aiDesignGeneration ?? null

/** Star / unstar a generation into the creator's Favorites tab. Owner-checked. */
export async function toggleGenerationFavorite(generationId: string): Promise<{ ok: boolean; favorited: boolean }> {
  const user = await requireUser()
  const row = await favDelegate()
    ?.findFirst({ where: { id: generationId, authorUserId: user.id }, select: { id: true, favorited: true } })
    .catch(() => null)
  if (!row) return { ok: false, favorited: false }
  const next = !row.favorited
  await favDelegate()?.update({ where: { id: generationId }, data: { favorited: next } }).catch(() => {})
  await logAuditAs(user, {
    entityType: 'AiDesignGeneration',
    entityId: generationId,
    action: next ? 'AI_DESIGN_FAVORITED' : 'AI_DESIGN_UNFAVORITED',
    payload: {},
  })
  return { ok: true, favorited: next }
}

/** Fetch a library tab for the current creator. `starter` ignores productTemplateId. */
export async function getTemplateLibrary(scope: LibraryScope, opts?: { productTemplateId?: string; domain?: string }): Promise<LibraryItem[]> {
  const user = await requireUser()
  if (scope === 'starter') return loadStarterGallery(opts?.domain)
  return loadGenerationLibrary(user.id, { productTemplateId: scope === 'this-product' ? opts?.productTemplateId ?? null : null })
}

/** Soft-archive / restore a saved generation (reversible; never a hard delete). Owner-checked. */
export async function setGenerationArchived(generationId: string, archived: boolean): Promise<{ ok: boolean; archived: boolean }> {
  const user = await requireUser()
  const row = await favDelegate()
    ?.findFirst({ where: { id: generationId, authorUserId: user.id }, select: { id: true, favorited: true } })
    .catch(() => null)
  if (!row) return { ok: false, archived: false }
  await favDelegate()?.update({ where: { id: generationId }, data: { archived } }).catch(() => {})
  await logAuditAs(user, { entityType: 'AiDesignGeneration', entityId: generationId, action: archived ? 'AI_DESIGN_ARCHIVED' : 'AI_DESIGN_RESTORED', payload: {} })
  return { ok: true, archived }
}

/** Rename a saved generation (My library card title). Owner-checked. */
export async function renameGeneration(generationId: string, title: string): Promise<{ ok: boolean; title: string }> {
  const user = await requireUser()
  const clean = title.trim().slice(0, 80)
  const row = await favDelegate()
    ?.findFirst({ where: { id: generationId, authorUserId: user.id }, select: { id: true, favorited: true } })
    .catch(() => null)
  if (!row) return { ok: false, title }
  await favDelegate()?.update({ where: { id: generationId }, data: { title: clean || null } }).catch(() => {})
  await logAuditAs(user, { entityType: 'AiDesignGeneration', entityId: generationId, action: 'AI_DESIGN_RENAMED', payload: { title: clean } })
  return { ok: true, title: clean }
}

export interface GenerationBrief {
  descriptor?: string
  styleTags?: string[]
  colorTags?: string[]
  elementTags?: string[]
  palette?: string[]
}

/** The stored brief for a generation, to seed the intake ("use as inspiration"). Owner-checked. */
export async function getGenerationBrief(generationId: string): Promise<GenerationBrief | null> {
  const user = await requireUser()
  const row = (await (
    prisma as unknown as {
      aiDesignGeneration?: { findFirst: (a: unknown) => Promise<{ promptJson: unknown } | null> }
    }
  ).aiDesignGeneration
    ?.findFirst({ where: { id: generationId, authorUserId: user.id }, select: { promptJson: true } })
    .catch(() => null)) as { promptJson: unknown } | null
  if (!row) return null
  const p = (row.promptJson && typeof row.promptJson === 'object' ? (row.promptJson as Record<string, unknown>) : {}) as Record<string, unknown>
  const brief = (p.brief && typeof p.brief === 'object' ? (p.brief as Record<string, unknown>) : {}) as Record<string, unknown>
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    descriptor: typeof brief.descriptor === 'string' ? brief.descriptor : undefined,
    styleTags: arr(brief.styleTags),
    colorTags: arr(brief.colorTags),
    elementTags: arr(brief.elementTags),
    palette: arr(p.palette),
  }
}
