// AI Create — real server loader (AI_PACKAGING_GENERATOR §8). Resolves everything
// the AiCreatePanel needs for a product: its die-line SET (frames + mm dims), Brand
// Kit palette, regulatory domain, creator tier + remaining credits, and the
// admin-tuned per-domain chip vocabulary. Cast-guarded → degrades to sensible
// defaults pre-migration, so it always returns usable props.

import { prisma, getAiGeneratorSettings, listActiveDieCuts } from '@ilaunchify/db'
import { getCreatorTier } from '@ilaunchify/auth'
import { resolveDomainOptions, type LabelingDomain, type DomainPreset, type FlavorSpec } from '@ilaunchify/ai-design'
import { tierLimits, resolveOutputPolicy, type CreatorBillingTier, type OutputPolicy } from '@ilaunchify/imagegen'
import type { FrameLayout } from '@ilaunchify/ui'
import type { AiCreatePanelProps, DielineTarget, CreatorTier, AiUsageSnapshot } from './AiCreatePanel'

// Fallback accent ramp for flavours with no swatchHex and no brand palette to draw from.
const DEFAULT_ACCENTS = ['#E5486B', '#6B4423', '#7BA05B', '#E7A93D', '#4A78B5', '#B5559E', '#3FA796', '#D2603A']

/** LabelingType → the generator's domain (same enum values; category can override). */
function resolveDomain(labelingType: string | null, category: string): LabelingDomain {
  if (category === 'SUPPLEMENT') return 'DIETARY_SUPPLEMENT'
  const lt = (labelingType ?? '') as LabelingDomain
  return (['FOOD', 'DIETARY_SUPPLEMENT', 'OTC', 'COSMETIC', 'PET_PRODUCT'] as const).includes(lt as never) ? lt : 'FOOD'
}

function hex(v: unknown): string | null {
  return typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()) ? v.trim() : null
}

function brandPalette(brand: { colorPrimary: string | null; colorSecondary: string | null; colorAccent: string | null; brandSwatches: unknown }): string[] {
  const out: string[] = []
  for (const c of [brand.colorPrimary, brand.colorSecondary, brand.colorAccent]) {
    const h = hex(c)
    if (h) out.push(h)
  }
  const sw = brand.brandSwatches
  if (Array.isArray(sw)) {
    for (const s of sw) {
      const h = hex(typeof s === 'string' ? s : (s as { hex?: unknown })?.hex)
      if (h && !out.includes(h)) out.push(h)
    }
  }
  return out.slice(0, 6)
}

async function loadDielineTargets(productTemplateId: string | null): Promise<DielineTarget[]> {
  if (!productTemplateId) return []
  const pkgs = await prisma.productTemplatePackaging
    .findMany({ where: { productTemplateId }, select: { packagingSystem: { select: { packagingTypeId: true } } } })
    .catch(() => [] as Array<{ packagingSystem: { packagingTypeId: string | null } | null }>)
  const typeIds = pkgs.map((p) => p.packagingSystem?.packagingTypeId).filter((x): x is string => Boolean(x))
  if (!typeIds.length) return []
  const rows = (await (
    prisma as unknown as {
      packagingDieline: {
        findMany: (a: unknown) => Promise<Array<{ id: string; frames: FrameLayout | null; widthMm: unknown; heightMm: unknown; canonicalShape: { name: string; category: string } | null }>>
      }
    }
  ).packagingDieline
    .findMany({
      where: { packagingTypeId: { in: typeIds }, status: { in: ['ACTIVE', 'PARTNER_CONFIRMED'] } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, frames: true, widthMm: true, heightMm: true, canonicalShape: { select: { name: true, category: true } } },
    })
    .catch(() => [])) as Array<{ id: string; frames: FrameLayout | null; widthMm: unknown; heightMm: unknown; canonicalShape: { name: string; category: string } | null }>

  const out: DielineTarget[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.frames || !Array.isArray(r.frames.frames) || r.frames.frames.length === 0) continue
    if (seen.has(r.id)) continue
    seen.add(r.id)
    const w = Number(String(r.widthMm ?? '')) || 100
    const h = Number(String(r.heightMm ?? '')) || 150
    out.push({
      id: r.id,
      label: r.canonicalShape?.name ?? 'Die-line',
      shapeLabel: r.canonicalShape?.category ? r.canonicalShape.category.replace(/_/g, ' ').toLowerCase() : undefined,
      layout: r.frames,
      surface: { widthMm: w, heightMm: h },
    })
  }
  return out
}

/** Product's flavour presets → FlavorSpec[], accent = swatchHex ?? brand palette ?? ramp. */
async function loadFlavors(productTemplateId: string | null, palette: string[]): Promise<FlavorSpec[]> {
  if (!productTemplateId) return []
  const rows = await prisma.flavorPreset
    .findMany({
      where: { productTemplateId, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, swatchHex: true },
    })
    .catch(() => [] as Array<{ id: string; name: string; swatchHex: string | null }>)
  return rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    accentHex: hex(r.swatchHex) ?? palette[i % Math.max(1, palette.length)] ?? DEFAULT_ACCENTS[i % DEFAULT_ACCENTS.length]!,
  }))
}

function periodKeyNow(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Per-creator usage this period + the tier caps, for the panel meters. */
async function usageSnapshot(userId: string, tier: CreatorBillingTier): Promise<AiUsageSnapshot> {
  const limits = tierLimits(tier)
  const periodKey = periodKeyNow()
  const [usage, storage] = await Promise.all([
    (prisma as unknown as {
      aiGenerationUsage: { findUnique: (a: unknown) => Promise<{ draftCyclesUsed: number; finalizeMpUsed: unknown } | null> }
    }).aiGenerationUsage
      .findUnique({ where: { userId_periodKey: { userId, periodKey } }, select: { draftCyclesUsed: true, finalizeMpUsed: true } })
      .catch(() => null),
    (prisma as unknown as {
      generationStorageUsage: { findUnique: (a: unknown) => Promise<{ kilobytesUsed: number } | null> }
    }).generationStorageUsage
      .findUnique({ where: { userId }, select: { kilobytesUsed: true } })
      .catch(() => null),
  ])
  return {
    draftCyclesUsed: usage?.draftCyclesUsed ?? 0,
    draftCyclesCap: limits.draftCyclesPerPeriod,
    finalizeMpUsed: Number(String(usage?.finalizeMpUsed ?? 0)) || 0,
    finalizeMpBudget: limits.finalizeMpBudget,
    storageBytesUsed: (storage?.kilobytesUsed ?? 0) * 1024,
    storageBytesCap: limits.storageBytes,
  }
}

async function creditsRemaining(userId: string, tier: CreatorBillingTier): Promise<number> {
  const cap = tierLimits(tier).draftCyclesPerPeriod
  if (cap <= 0) return 0
  const used = (await (
    prisma as unknown as { aiGenerationUsage: { findUnique: (a: unknown) => Promise<{ draftCyclesUsed: number } | null> } }
  ).aiGenerationUsage
    .findUnique({ where: { userId_periodKey: { userId, periodKey: periodKeyNow() } }, select: { draftCyclesUsed: true } })
    .catch(() => null)) as { draftCyclesUsed: number } | null
  return Math.max(0, cap - (used?.draftCyclesUsed ?? 0))
}

/** Resolve the brand's primary logo to a public URL (best-effort; null when unavailable). */
async function resolveBrandLogoUrl(logoAssetId: string | null | undefined): Promise<string | undefined> {
  if (!logoAssetId) return undefined
  const asset = await prisma.asset
    .findUnique({ where: { id: logoAssetId }, select: { publicUrl: true } })
    .catch(() => null)
  return asset?.publicUrl ?? undefined
}

export interface AiCreateData {
  props: Omit<AiCreatePanelProps, 'onGenerate'>
  productName: string
}

/** Load real AiCreatePanel props for a product owned by the given user, or null. */
export async function loadAiCreateProps(productId: string, userId: string): Promise<AiCreateData | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId } } },
    select: {
      id: true,
      name: true,
      category: true,
      productTemplateId: true,
      productTemplate: { select: { labelingType: true } },
      brand: { select: { name: true, colorPrimary: true, colorSecondary: true, colorAccent: true, brandSwatches: true, logoAssetId: true } },
    },
  })
  if (!product) return null

  const domain = resolveDomain(product.productTemplate?.labelingType ?? null, String(product.category))
  const rawTier = await getCreatorTier(userId).catch(() => 'maker' as const)
  const tier: CreatorTier = (['maker', 'builder', 'agency'] as const).includes(rawTier as never) ? (rawTier as CreatorTier) : 'maker'
  const meteredTier: CreatorBillingTier = tier === 'admin' ? 'agency' : (tier as CreatorBillingTier)

  const settings = await getAiGeneratorSettings()
  const vocab: DomainPreset = resolveDomainOptions(domain, settings.domainVocab[domain] as Partial<DomainPreset> | undefined)

  const palette = product.brand ? brandPalette(product.brand) : []
  const outputPolicy: OutputPolicy = resolveOutputPolicy(
    meteredTier,
    settings.outputPolicies[meteredTier] as Partial<OutputPolicy> | undefined,
  )

  const [dielines, flavors, credits, brandLogoUrl, usage] = await Promise.all([
    loadDielineTargets(product.productTemplateId),
    loadFlavors(product.productTemplateId, palette),
    creditsRemaining(userId, meteredTier),
    resolveBrandLogoUrl(product.brand?.logoAssetId),
    usageSnapshot(userId, meteredTier),
  ])

  return {
    productName: product.name,
    props: {
      productDescriptor: product.name,
      brandName: product.brand?.name ?? undefined,
      brandPalette: palette,
      brandLogoUrl,
      domain,
      market: 'US',
      dielines,
      flavors,
      styleOptions: vocab.styles,
      colorOptions: vocab.colors,
      elementOptions: vocab.elements,
      tier,
      creditsRemaining: credits,
      outputPolicy,
      usage,
    },
  }
}

/**
 * Admin (template-author) props: generate against a chosen die-cut and save the concept
 * as a LIBRARY template. Product-less — targets one die-cut as a single die-line with a
 * full-bleed CREATIVE frame. Tier = 'admin' (unmetered, ungated). Caller must have
 * catalog:write. Returns null only if there are no die-cuts at all.
 */
export async function loadAdminAiCreateProps(input: { dieCutId?: string; domain?: string }): Promise<AiCreateData | null> {
  const dieCuts = await listActiveDieCuts().catch(() => [])
  if (dieCuts.length === 0) return null
  const cut = dieCuts.find((d) => d.id === input.dieCutId) ?? dieCuts[0]!

  const domain: LabelingDomain = (['FOOD', 'DIETARY_SUPPLEMENT', 'OTC', 'COSMETIC', 'PET_PRODUCT'] as const).includes(
    (input.domain ?? '') as never,
  )
    ? (input.domain as LabelingDomain)
    : 'FOOD'

  // One full-bleed paintable frame — the admin authors a reusable CREATIVE template;
  // the truth layer is product-specific and applied per-creator later, so it's not fixed here.
  const layout: FrameLayout = {
    version: 1,
    frames: [{ id: 'creative', kind: 'IMAGERY', box: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 }, required: false, source: 'PLATFORM' }],
  }
  const target: DielineTarget = {
    id: cut.id,
    label: cut.name,
    shapeLabel: cut.category ? String(cut.category).replace(/_/g, ' ').toLowerCase() : undefined,
    layout,
    surface: { widthMm: cut.widthMm || 100, heightMm: cut.heightMm || 150 },
  }

  const settings = await getAiGeneratorSettings()
  const vocab: DomainPreset = resolveDomainOptions(domain, settings.domainVocab[domain] as Partial<DomainPreset> | undefined)

  return {
    productName: cut.name,
    props: {
      productDescriptor: `${cut.name} template`,
      brandName: 'System Templates',
      brandPalette: [],
      domain,
      market: 'US',
      dielines: [target],
      flavors: [],
      styleOptions: vocab.styles,
      colorOptions: vocab.colors,
      elementOptions: vocab.elements,
      tier: 'admin',
      creditsRemaining: undefined,
    },
  }
}
