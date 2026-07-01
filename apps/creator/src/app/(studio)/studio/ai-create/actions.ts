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
import { requireUser, getCreatorTier } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { loadAiCreateProps, type AiCreateData } from './loader'
import {
  resolveImageGenProvider,
  runDraftGeneration,
  runFinalizeGeneration,
  tierLimits,
  estimateStoredTemplateBytes,
  type CreatorBillingTier,
} from '@ilaunchify/imagegen'
import type { LabelingDomain, MarketCode } from '@ilaunchify/ai-design'

/** Load the in-canvas AI drawer's props for a product the caller owns (die-line set,
 *  brand palette, domain, tier, per-domain chip vocab, credits). Thin authed wrapper
 *  over the shared loader so the Studio drawer can fetch on open. */
export async function getAiCreateDrawerProps(productId: string): Promise<AiCreateData | null> {
  const user = await requireUser()
  return loadAiCreateProps(productId, user.id)
}

function periodKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function meteredTier(tier: string): CreatorBillingTier {
  return (['builder', 'agency'] as const).includes(tier as never) ? (tier as CreatorBillingTier) : tier === 'admin' ? 'agency' : 'maker'
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
}

export type GenerateConceptsResult =
  | { ok: true; generationId: string | null; images: string[]; provider: string; remainingCycles: number }
  | { ok: false; error: string }

/** Draft cycle. Returns concept images (SVG markup or URLs) for the panel to preview. */
export async function generateAiConcepts(input: GenerateConceptsInput): Promise<GenerateConceptsResult> {
  const user = await requireUser()
  const tierKey = await getCreatorTier(user.id).catch(() => 'maker' as const)
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
        promptJson: { prompt: input.prompt, negativePrompt: input.negativePrompt, domain: input.domain, market: input.market ?? 'US', palette: input.brandPalette ?? [] },
        provider: provider.backing.raster,
        complianceJson: input.complianceJson ?? undefined,
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
  const tierKey = await getCreatorTier(user.id).catch(() => 'maker' as const)
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
