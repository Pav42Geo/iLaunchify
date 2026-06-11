'use server'

// Guided builder actions (2026-06-08). The 6-step turnkey builder creates the
// DRAFT ProductTemplate up front (after Basics) so each subsequent step can
// autosave into real DB rows via the existing editor cards. Kept in its own
// file (not products/actions.ts) to stay off Code's hot path.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'
import { suggestPhrases, PHRASE_FACT_FLAGS } from '@ilaunchify/marketplace'
import { uploadFile, getSignedReadUrl, deleteFile } from '@ilaunchify/storage'
import { lookupFeeRate, creatorTierToPlanCode, FEE_EVENTS } from '@ilaunchify/plans'

const FALLBACK_FEE_PCT = 15

/** Tier-aware platform-fee percents (production-order subtotal) for the pricing
 *  card's per-subscription-tier columns. Same source of truth as the marketplace. */
export async function getCreatorFeePercents(): Promise<{ maker: number; builder: number; agency: number }> {
  const out = { maker: FALLBACK_FEE_PCT, builder: FALLBACK_FEE_PCT, agency: FALLBACK_FEE_PCT }
  await Promise.all(
    (['maker', 'builder', 'agency'] as const).map(async (t) => {
      const r = await lookupFeeRate(creatorTierToPlanCode(t), FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL).catch(() => null)
      if (r?.ratePercent != null) out[t] = r.ratePercent
    }),
  )
  return out
}

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function requirePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user, partner: null as null, error: 'Not a partner account.' }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      services: { where: { type: 'MANUFACTURING' }, select: { id: true }, take: 1 },
    },
  })
  if (!partner) return { user, partner: null as null, error: 'Partner profile not found.' }
  return { user, partner, error: null as null }
}

export interface CreateDraftShellInput {
  name: string
  subcategoryId: string
}

// ---------------------------------------------------------------------------
// Media — hero + up to 6 gallery images + 1 video (8 total). Uploads to R2 via
// @ilaunchify/storage, creates an Asset, links it on the ProductTemplate.
// galleryAssetIds / videoAssetId are new columns → cast-guarded.
// ---------------------------------------------------------------------------

export type MediaSlot = 'hero' | 'gallery' | 'video'
export interface MediaItem { assetId: string; url: string }
export interface MediaData { hero: MediaItem | null; gallery: MediaItem[]; video: MediaItem | null }

const IMG_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

async function ownsDraft(productTemplateId: string, partnerServiceIds: string[]): Promise<boolean> {
  const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
  if (!tpl) return false
  return !tpl.manufacturerServiceId || partnerServiceIds.includes(tpl.manufacturerServiceId)
}

export async function uploadProductMedia(formData: FormData): Promise<Result<MediaItem>> {
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const productTemplateId = String(formData.get('productTemplateId') ?? '')
    const slot = (String(formData.get('slot') ?? 'gallery')) as MediaSlot
    const file = formData.get('file')
    if (!productTemplateId) return { ok: false, error: 'Save the draft first.' }
    if (!(await ownsDraft(productTemplateId, partner.services.map((s) => s.id)))) return { ok: false, error: 'Not your product.' }
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file selected.' }
    const isVideo = slot === 'video'
    if (isVideo ? !file.type.startsWith('video/') : !IMG_MIME.has(file.type)) {
      return { ok: false, error: isVideo ? 'Upload a video file (MP4/WebM).' : 'Upload a PNG, JPEG, WebP, or GIF.' }
    }
    const MAX = isVideo ? 100 * 1024 * 1024 : 15 * 1024 * 1024
    if (file.size > MAX) return { ok: false, error: `File too large (max ${isVideo ? '100' : '15'} MB).` }

    const safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48)
    const key = `products/${productTemplateId}/media/${slot}/${Date.now()}-${safe}`
    await uploadFile({ key, body: Buffer.from(await file.arrayBuffer()), contentType: file.type })

    const asset = await prisma.asset.create({
      data: {
        ownerType: 'PRODUCT', ownerId: productTemplateId,
        type: isVideo ? 'OTHER' : slot === 'hero' ? 'HERO_IMAGE' : 'PRODUCT_IMAGE',
        source: 'USER_UPLOAD', storageKey: key, mimeType: file.type, sizeBytes: file.size,
        isPublic: false, uploadedByUserId: user.id,
      },
      select: { id: true },
    })

    const p = prisma as unknown as { productTemplate: { findUnique: (a: unknown) => Promise<{ galleryAssetIds: string[] } | null>; update: (a: unknown) => Promise<unknown> } }
    if (slot === 'hero') {
      await prisma.productTemplate.update({ where: { id: productTemplateId }, data: { imageAssetId: asset.id } })
    } else if (slot === 'video') {
      await p.productTemplate.update({ where: { id: productTemplateId }, data: { videoAssetId: asset.id } })
    } else {
      const cur = await p.productTemplate.findUnique({ where: { id: productTemplateId }, select: { galleryAssetIds: true } })
      const next = [...(cur?.galleryAssetIds ?? []), asset.id].slice(0, 6)
      await p.productTemplate.update({ where: { id: productTemplateId }, data: { galleryAssetIds: next } })
    }
    await logAuditAs(user, { entityType: 'ProductTemplate', entityId: productTemplateId, action: 'PRODUCT_TEMPLATE_UPDATE', payload: { media: slot } }).catch(() => {})

    return { ok: true, data: { assetId: asset.id, url: await getSignedReadUrl(key) } }
  } catch (err) {
    console.error('[uploadProductMedia] failed:', err)
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }
}

export async function removeProductMedia(productTemplateId: string, slot: MediaSlot, assetId: string): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return { ok: false, error: error ?? 'Partner profile not found.' }
    if (!(await ownsDraft(productTemplateId, partner.services.map((s) => s.id)))) return { ok: false, error: 'Not your product.' }

    const p = prisma as unknown as { productTemplate: { findUnique: (a: unknown) => Promise<{ galleryAssetIds: string[] } | null>; update: (a: unknown) => Promise<unknown> } }
    if (slot === 'hero') await prisma.productTemplate.update({ where: { id: productTemplateId }, data: { imageAssetId: null } })
    else if (slot === 'video') await p.productTemplate.update({ where: { id: productTemplateId }, data: { videoAssetId: null } })
    else {
      const cur = await p.productTemplate.findUnique({ where: { id: productTemplateId }, select: { galleryAssetIds: true } })
      await p.productTemplate.update({ where: { id: productTemplateId }, data: { galleryAssetIds: (cur?.galleryAssetIds ?? []).filter((x) => x !== assetId) } })
    }
    // Best-effort: purge the asset + R2 object.
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { storageKey: true } }).catch(() => null)
    if (asset?.storageKey) await deleteFile(asset.storageKey).catch(() => {})
    await prisma.asset.delete({ where: { id: assetId } }).catch(() => {})
    return { ok: true }
  } catch (err) {
    console.error('[removeProductMedia] failed:', err)
    return { ok: false, error: `Could not remove: ${(err as Error).message}` }
  }
}

export async function loadMedia(productTemplateId: string): Promise<MediaData> {
  const empty: MediaData = { hero: null, gallery: [], video: null }
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return empty
    const p = prisma as unknown as { productTemplate: { findUnique: (a: unknown) => Promise<{ manufacturerServiceId: string | null; imageAssetId: string | null; galleryAssetIds: string[]; videoAssetId: string | null } | null> } }
    const tpl = await p.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true, imageAssetId: true, galleryAssetIds: true, videoAssetId: true } })
    if (!tpl) return empty
    if (tpl.manufacturerServiceId && !partner.services.map((s) => s.id).includes(tpl.manufacturerServiceId)) return empty
    const ids = [tpl.imageAssetId, ...(tpl.galleryAssetIds ?? []), tpl.videoAssetId]
    const urls = await resolveCertBadgeUrls(ids).catch(() => new Map<string, string>())
    const item = (id: string | null): MediaItem | null => (id && urls.get(id) ? { assetId: id, url: urls.get(id)! } : null)
    return {
      hero: item(tpl.imageAssetId),
      gallery: (tpl.galleryAssetIds ?? []).map(item).filter((m): m is MediaItem => !!m),
      video: item(tpl.videoAssetId),
    }
  } catch (err) {
    console.error('[loadMedia] failed:', err)
    return empty
  }
}

export interface CertRow {
  productCertificateId: string | null // present only for ATTACHED rows
  instanceId: string
  certName: string
  certificateNumber: string | null
  expiryDateIso: string
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'EXPIRED' | 'REJECTED'
  badgeUrl: string | null // cert type's web badge (image)
}
export interface CertData { attached: CertRow[]; available: CertRow[] }

/** Load the draft's attached certificates + the partner's attachable instances
 *  (#consolidation slice 1). Reuses the editor's data shape; attach/detach use the
 *  editor's existing `attachCertificate`/`detachCertificate` server actions. */
export async function loadCertData(productTemplateId: string): Promise<CertData> {
  const empty: CertData = { attached: [], available: [] }
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return empty
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true,
        certificates: { select: { instance: { select: { id: true, certificateNumber: true, expiryDate: true, status: true, certificateType: { select: { name: true, thumbnailFileId: true } } } } } },
      },
    })
    if (!tpl) return empty
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return empty

    const available = await prisma.partnerCertificateInstance.findMany({
      where: { partnerId: partner.id, status: { in: ['VERIFIED', 'PENDING_REVIEW'] } },
      include: { certificateType: { select: { name: true, thumbnailFileId: true } } },
      orderBy: { expiryDate: 'asc' },
    })
    // Resolve cert-type web badges (images) — same helper as /certifications.
    const fileIds = [
      ...tpl.certificates.map((c) => c.instance.certificateType.thumbnailFileId),
      ...available.map((a) => a.certificateType.thumbnailFileId),
    ]
    const badges = await resolveCertBadgeUrls(fileIds).catch(() => new Map<string, string>())
    const badge = (id: string | null) => (id ? badges.get(id) ?? null : null)

    const attachedInstanceIds = new Set(tpl.certificates.map((c) => c.instance.id))
    return {
      attached: tpl.certificates.map((c) => ({
        productCertificateId: null, instanceId: c.instance.id, certName: c.instance.certificateType.name,
        certificateNumber: c.instance.certificateNumber, expiryDateIso: c.instance.expiryDate.toISOString(),
        status: c.instance.status as CertRow['status'], badgeUrl: badge(c.instance.certificateType.thumbnailFileId),
      })),
      available: available.filter((a) => !attachedInstanceIds.has(a.id)).map((a) => ({
        productCertificateId: null, instanceId: a.id, certName: a.certificateType.name,
        certificateNumber: a.certificateNumber, expiryDateIso: a.expiryDate.toISOString(),
        status: a.status as CertRow['status'], badgeUrl: badge(a.certificateType.thumbnailFileId),
      })),
    }
  } catch (err) {
    console.error('[loadCertData] failed:', err)
    return empty
  }
}

export interface InitialDraftValue {
  label: string; isDefault: boolean; leadDelta: number; costDeltaCents: number; moqOverride: number | null
  overlayOp: 'NONE' | 'SWAP' | 'ADD' | 'REMOVE'; overlayIngId?: string; overlayIngName?: string
}
export interface InitialDraftAxis {
  key: string; label: string; editableByCreator: boolean; affectsLabel: boolean; boundSlotId: string | null
  values: InitialDraftValue[]
}
export interface InitialDraft {
  id: string
  status: string // ProductTemplateStatus
  name: string
  familyCode: string | null
  description: string | null
  longDescription: string | null
  categoryId: string | null
  subcategoryId: string
  packingProfileId: string | null
  maxFlavorsPerPack: number | null
  nicheIds: string[]
  lifestyleTagIds: string[]
  flavors: Array<{ name: string; soi: string }>
  axes: InitialDraftAxis[]
  // Recipe entry method — restores the chosen mode (Search / AI / Declare) when
  // resuming a draft so the builder reopens on the right surface.
  recipeEntryMode: 'SEARCH_BUILD' | 'AI_PARSER' | 'DECLARED_PANEL' | null
  // Recipe base slots — restored so editing shows the real recipe (and the
  // recipe-step autosave round-trips instead of wiping it).
  recipeSlots: Array<{ ingId: string; name: string; per100g: Record<string, number>; densityGPerMl: number | null; weightG: number }>
  // Production (default variant) + storage/lead (template) — #35 full load-back.
  storageClass: 'AMBIENT' | 'CHILLED' | 'FROZEN' | null
  storageTempMinF: number | null
  storageTempMaxF: number | null
  leadTimeRepeatDays: number | null
  leadTimeFirstRunDays: number | null
  production: {
    fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' | 'BOTH' | null
    moqMin: number; orderIncrement: number; monthlyCapacity: number | null
    shelfLifeDays: number | null; lotTracking: boolean; sku: string | null
  } | null
  packing: {
    innerPacksPerOuter: number; outerPacksPerCase: number
    customerPicksCount: number | null; subscriptionInterval: string | null
    packingConfig: Record<string, unknown> | null
  } | null
  fees: Array<{ label: string; basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'; amountCents: number; waivedAboveQty: number | null; sortOrder: number }>
  changeApprovalRules: Array<{ changeType: string; requiredApprover: string; sortOrder: number }>
  optionRules: Array<{ kind: 'EXCLUDE' | 'REQUIRE'; whenValueId: string; targetValueId: string; message: string | null }>
  sampleOptions: Array<{ kind: 'UNBRANDED' | 'BRANDED'; enabled: boolean; perFlavorCents: number | null; samplerSetCents: number | null; sampleMoq: number; maxUnitsPerFlavor: number | null; leadTimeDays: number; creditTowardFirstOrder: boolean; creditCapCents: number | null; maxPerCreatorPerPeriod: number | null }>
  pricingTiers: Array<{ minQty: number; maxQty: number | null; perUnitCostCents: number; perUnitFloorCents: number; leadTimeDays: number | null; fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' }>
}

/** Load an existing DRAFT for the guided builder to resume (#35 load-back). Returns
 *  null if not found / not owned. Single cast query so new columns + relations
 *  (packingProfileId, optionAxes, …) resolve before the client is regenerated. */
export async function loadDraft(productTemplateId: string): Promise<InitialDraft | null> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return null
    const ownIds = partner.services.map((s) => s.id)

    type Loaded = {
      id: string; status: string; name: string; familyCode: string | null; description: string | null
      longDescription: string | null; manufacturerServiceId: string | null; subcategoryId: string
      packingProfileId: string | null; maxFlavorsPerPack: number | null; recipeEntryMode: string | null
      storageClass: string | null; storageTempMinF: number | null; storageTempMaxF: number | null
      leadTimeRepeatDays: number | null; leadTimeFirstRunDays: number | null
      subcategory: { categoryId: string } | null
      flavorPresets: Array<{ name: string; statementOfIdentity: string | null }>
      ingredientSlots: Array<{ id: string; baseIngredientId: string; weightG: number | null; baseIngredient: { internalName: string | null; name: string; nutritionPer100g: unknown; densityGPerML: number | null } | null }>
      niches: Array<{ nicheId: string }>
      lifestyleTags: Array<{ lifestyleTagId: string }>
      variants: Array<{ fulfillmentMode: string | null; moqMin: number; orderIncrement: number; monthlyCapacity: number | null; shelfLifeDays: number | null; lotTracking: boolean; innerPacksPerOuter: number; outerPacksPerCase: number; customerPicksCount: number | null; subscriptionInterval: string | null; packingConfig: unknown; sku: string | null }>
      fees: Array<{ label: string; basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'; amountCents: number; waivedAboveQty: number | null; sortOrder: number }>
      changeApprovalRules: Array<{ changeType: string; requiredApprover: string; sortOrder: number }>
      optionRules: Array<{ kind: 'EXCLUDE' | 'REQUIRE'; whenValueId: string; targetValueId: string; message: string | null }>
      sampleOptions: Array<{ kind: 'UNBRANDED' | 'BRANDED'; enabled: boolean; perFlavorCents: number | null; samplerSetCents: number | null; sampleMoq: number; maxUnitsPerFlavor: number | null; leadTimeDays: number; creditTowardFirstOrder: boolean; creditCapCents: number | null; maxPerCreatorPerPeriod: number | null }>
      pricingTiers: Array<{ minQty: number; maxQty: number | null; perUnitCostCents: number; perUnitFloorCents: number; leadTimeDays: number | null; fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' }>
      optionAxes: Array<{
        key: string; label: string; editableByCreator: boolean; affectsLabel: boolean; boundSlotId: string | null
        values: Array<{ label: string; isDefault: boolean; leadTimeDeltaDays: number; unitCostDeltaCents: number; moqOverride: number | null; overlayOp: string; recipeOverlay: unknown }>
      }>
    }
    const tpl = await (prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<Loaded | null> }
    }).productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        id: true, status: true, name: true, familyCode: true, description: true, longDescription: true,
        manufacturerServiceId: true, subcategoryId: true, packingProfileId: true, maxFlavorsPerPack: true,
        recipeEntryMode: true,
        storageClass: true, storageTempMinF: true, storageTempMaxF: true,
        leadTimeRepeatDays: true, leadTimeFirstRunDays: true,
        subcategory: { select: { categoryId: true } },
        flavorPresets: { orderBy: { sortOrder: 'asc' }, select: { name: true, statementOfIdentity: true } },
        ingredientSlots: { orderBy: { displayOrder: 'asc' }, select: { id: true, baseIngredientId: true, weightG: true, baseIngredient: { select: { internalName: true, name: true, nutritionPer100g: true, densityGPerML: true } } } },
        niches: { select: { nicheId: true } },
        lifestyleTags: { select: { lifestyleTagId: true } },
        variants: { take: 1, orderBy: { createdAt: 'asc' }, select: { fulfillmentMode: true, moqMin: true, orderIncrement: true, monthlyCapacity: true, shelfLifeDays: true, lotTracking: true, innerPacksPerOuter: true, outerPacksPerCase: true, customerPicksCount: true, subscriptionInterval: true, packingConfig: true, sku: true } },
        fees: { orderBy: { sortOrder: 'asc' }, select: { label: true, basis: true, amountCents: true, waivedAboveQty: true, sortOrder: true } },
        changeApprovalRules: { orderBy: { sortOrder: 'asc' }, select: { changeType: true, requiredApprover: true, sortOrder: true } },
        optionRules: { orderBy: { createdAt: 'asc' }, select: { kind: true, whenValueId: true, targetValueId: true, message: true } },
        sampleOptions: { orderBy: { sortOrder: 'asc' }, select: { kind: true, enabled: true, perFlavorCents: true, samplerSetCents: true, sampleMoq: true, maxUnitsPerFlavor: true, leadTimeDays: true, creditTowardFirstOrder: true, creditCapCents: true, maxPerCreatorPerPeriod: true } },
        pricingTiers: { orderBy: [{ fulfillmentMode: 'asc' }, { sortOrder: 'asc' }], select: { minQty: true, maxQty: true, perUnitCostCents: true, perUnitFloorCents: true, leadTimeDays: true, fulfillmentMode: true } },
        optionAxes: {
          orderBy: { sortOrder: 'asc' },
          select: {
            key: true, label: true, editableByCreator: true, affectsLabel: true, boundSlotId: true,
            values: { orderBy: { sortOrder: 'asc' }, select: { label: true, isDefault: true, leadTimeDeltaDays: true, unitCostDeltaCents: true, moqOverride: true, overlayOp: true, recipeOverlay: true } },
          },
        },
      },
    }).catch(() => null)

    if (!tpl) return null
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return null

    // Axes bind to the stable baseIngredientId client-side; the DB stores the
    // real slot id. Map it back so the binding re-selects the right base row.
    const slotToIng = new Map(tpl.ingredientSlots.map((s) => [s.id, s.baseIngredientId]))

    return {
      id: tpl.id,
      status: tpl.status,
      name: tpl.name,
      familyCode: tpl.familyCode,
      description: tpl.description,
      longDescription: tpl.longDescription,
      categoryId: tpl.subcategory?.categoryId ?? null,
      subcategoryId: tpl.subcategoryId,
      packingProfileId: tpl.packingProfileId,
      maxFlavorsPerPack: tpl.maxFlavorsPerPack,
      recipeEntryMode: (tpl.recipeEntryMode as InitialDraft['recipeEntryMode']) ?? null,
      nicheIds: tpl.niches.map((n) => n.nicheId),
      lifestyleTagIds: tpl.lifestyleTags.map((l) => l.lifestyleTagId),
      flavors: tpl.flavorPresets.map((f) => ({ name: f.name, soi: f.statementOfIdentity ?? '' })),
      recipeSlots: tpl.ingredientSlots.map((s) => ({
        ingId: s.baseIngredientId,
        name: s.baseIngredient?.internalName ?? s.baseIngredient?.name ?? '',
        per100g: (s.baseIngredient?.nutritionPer100g ?? {}) as Record<string, number>,
        densityGPerMl: s.baseIngredient?.densityGPerML ?? null,
        weightG: s.weightG ?? 0,
      })),
      axes: (tpl.optionAxes ?? []).map((a) => ({
        key: a.key, label: a.label, editableByCreator: a.editableByCreator, affectsLabel: a.affectsLabel,
        boundSlotId: a.boundSlotId ? (slotToIng.get(a.boundSlotId) ?? null) : null,
        values: a.values.map((v) => {
          const ov = (v.recipeOverlay ?? {}) as { toIngredientId?: string; addIngredientId?: string }
          const ingId = ov.toIngredientId ?? ov.addIngredientId
          return {
            label: v.label, isDefault: v.isDefault, leadDelta: v.leadTimeDeltaDays, costDeltaCents: v.unitCostDeltaCents,
            moqOverride: v.moqOverride, overlayOp: (v.overlayOp as InitialDraftValue['overlayOp']) ?? 'NONE',
            overlayIngId: ingId, overlayIngName: ingId ? '(saved ingredient)' : undefined,
          }
        }),
      })),
      storageClass: (tpl.storageClass as InitialDraft['storageClass']) ?? null,
      storageTempMinF: tpl.storageTempMinF,
      storageTempMaxF: tpl.storageTempMaxF,
      leadTimeRepeatDays: tpl.leadTimeRepeatDays,
      leadTimeFirstRunDays: tpl.leadTimeFirstRunDays,
      production: tpl.variants[0]
        ? {
            fulfillmentMode: (tpl.variants[0].fulfillmentMode as 'BULK_PRODUCTION' | 'ON_DEMAND' | 'BOTH' | null) ?? null,
            moqMin: tpl.variants[0].moqMin,
            orderIncrement: tpl.variants[0].orderIncrement,
            monthlyCapacity: tpl.variants[0].monthlyCapacity,
            shelfLifeDays: tpl.variants[0].shelfLifeDays,
            lotTracking: tpl.variants[0].lotTracking,
            sku: tpl.variants[0].sku,
          }
        : null,
      packing: tpl.variants[0]
        ? {
            innerPacksPerOuter: tpl.variants[0].innerPacksPerOuter,
            outerPacksPerCase: tpl.variants[0].outerPacksPerCase,
            customerPicksCount: tpl.variants[0].customerPicksCount,
            subscriptionInterval: tpl.variants[0].subscriptionInterval,
            packingConfig: (tpl.variants[0].packingConfig ?? null) as Record<string, unknown> | null,
          }
        : null,
      fees: (tpl.fees ?? []).map((f) => ({ label: f.label, basis: f.basis, amountCents: f.amountCents, waivedAboveQty: f.waivedAboveQty, sortOrder: f.sortOrder })),
      changeApprovalRules: (tpl.changeApprovalRules ?? []).map((r) => ({ changeType: r.changeType, requiredApprover: r.requiredApprover, sortOrder: r.sortOrder })),
      optionRules: (tpl.optionRules ?? []).map((r) => ({ kind: r.kind, whenValueId: r.whenValueId, targetValueId: r.targetValueId, message: r.message })),
      sampleOptions: (tpl.sampleOptions ?? []).map((s) => ({ kind: s.kind, enabled: s.enabled, perFlavorCents: s.perFlavorCents, samplerSetCents: s.samplerSetCents, sampleMoq: s.sampleMoq, maxUnitsPerFlavor: s.maxUnitsPerFlavor, leadTimeDays: s.leadTimeDays, creditTowardFirstOrder: s.creditTowardFirstOrder, creditCapCents: s.creditCapCents, maxPerCreatorPerPeriod: s.maxPerCreatorPerPeriod })),
      pricingTiers: tpl.pricingTiers ?? [],
    }
  } catch (err) {
    console.error('[loadDraft] failed:', err)
    return null
  }
}

/** Fetch the nutrient panel for a picked ingredient (the IngredientPicker only
 *  returns id/name/density). Feeds the live FDA-label engine in the recipe step. */
export async function getIngredientNutrition(
  id: string,
): Promise<Result<{ name: string; per100g: Record<string, number>; densityGPerMl: number | null; allergens: string[] }>> {
  try {
    const ing = await prisma.ingredient.findUnique({
      where: { id },
      select: { internalName: true, name: true, nutritionPer100g: true, densityGPerML: true, allergenFlags: true },
    })
    if (!ing) return { ok: false, error: 'Ingredient not found.' }
    return {
      ok: true,
      data: {
        name: ing.internalName ?? ing.name,
        per100g: (ing.nutritionPer100g ?? {}) as Record<string, number>,
        densityGPerMl: ing.densityGPerML,
        allergens: ing.allergenFlags ?? [],
      },
    }
  } catch (err) {
    return { ok: false, error: `Could not load ingredient: ${(err as Error).message}` }
  }
}

export interface SlotInput { ingredientId: string; weightG: number; displayOrder: number }

/** Replace the draft's base ingredient slots (real-picked ingredients only). */
export async function saveRecipeSlots(productTemplateId: string, slots: SlotInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    // Validate the ingredient ids are visible to this partner.
    const ids = [...new Set(slots.map((s) => s.ingredientId))]
    const visible = ids.length
      ? await prisma.ingredient.findMany({
          where: {
            id: { in: ids }, isDeclaredPanelSynthetic: false,
            OR: [{ source: 'USDA' }, { source: 'LIBRARY' }, { source: 'PARTNER_PRIVATE', ownerPartnerId: partner.id }],
          },
          select: { id: true },
        })
      : []
    const okIds = new Set(visible.map((v) => v.id))
    const valid = slots.filter((s) => okIds.has(s.ingredientId) && s.weightG > 0)

    await prisma.$transaction([
      prisma.templateIngredientSlot.deleteMany({ where: { productTemplateId } }),
      ...valid.map((s) =>
        prisma.templateIngredientSlot.create({
          data: { productTemplateId, baseIngredientId: s.ingredientId, weightG: s.weightG, displayOrder: s.displayOrder },
        }),
      ),
    ])
    return { ok: true }
  } catch (err) {
    console.error('[saveRecipeSlots] failed:', err)
    return { ok: false, error: `Could not save recipe: ${(err as Error).message}` }
  }
}

export interface OptionValueInput {
  label: string
  isDefault: boolean
  leadTimeDeltaDays: number
  unitCostDeltaCents: number
  moqOverride: number | null
  priceDeltaCents: number
  // §12b ingredient operation (bound in the Recipe step). Defaults NONE.
  overlayOp?: 'NONE' | 'SWAP' | 'ADD' | 'REMOVE'
  recipeOverlay?: unknown | null
  sortOrder: number
}
export interface OptionAxisInput {
  key: string // OptionAxisKey
  label: string
  layer: 'RECIPE' | 'PACKAGING'
  editableByCreator: boolean
  affectsLabel: boolean // true → values change the recipe → engine recomputes the Facts label
  boundSlotId?: string | null // SWAP/REMOVE axes bind to one base recipe slot
  required: boolean
  sortOrder: number
  values: OptionValueInput[]
}

/**
 * Replace the draft's configurable option axes (non-flavor: sweetener, strength,
 * caffeine, custom). The FLAVOR axis lives in its own flavor table. Each value
 * carries compositional deltas. Cast-guarded: ProductOptionAxis/Value land on the
 * client only after the Phase-1 migration (docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md).
 */
export async function saveOptionAxes(productTemplateId: string, axes: OptionAxisInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    // Keep only axes with a name + at least one named value.
    const clean = axes
      .map((a, i) => ({
        ...a,
        label: a.label.trim(),
        sortOrder: a.sortOrder ?? i,
        values: a.values
          .map((v, j) => ({ ...v, label: v.label.trim(), sortOrder: v.sortOrder ?? j }))
          .filter((v) => v.label.length > 0),
      }))
      .filter((a) => a.label.length > 0 && a.values.length > 0)
      .map((a) => ({
        ...a,
        // Guarantee exactly one default per axis.
        values: a.values.some((v) => v.isDefault)
          ? a.values
          : a.values.map((v, j) => ({ ...v, isDefault: j === 0 })),
      }))

    // Resolve each axis's bound slot. The client binds by the stable
    // baseIngredientId (row uids are ephemeral), so map ingredientId → the real
    // TemplateIngredientSlot.id here. Pass-through any value that's already a
    // slot id (legacy / mixed data).
    const slots = await prisma.templateIngredientSlot.findMany({
      where: { productTemplateId },
      select: { id: true, baseIngredientId: true },
    })
    const slotIds = new Set(slots.map((s) => s.id))
    const ingToSlot = new Map(slots.map((s) => [s.baseIngredientId, s.id]))
    const resolveSlot = (b: string | null | undefined): string | null =>
      !b ? null : slotIds.has(b) ? b : (ingToSlot.get(b) ?? null)

    // ProductOptionAxis/Value are not in the generated client until migration.
    const p = prisma as unknown as {
      productOptionAxis: {
        deleteMany: (a: unknown) => Promise<unknown>
        create: (a: unknown) => Promise<unknown>
      }
    }
    await p.productOptionAxis.deleteMany({ where: { productTemplateId } })
    for (const a of clean) {
      await p.productOptionAxis.create({
        data: {
          productTemplateId,
          key: a.key,
          label: a.label,
          layer: a.layer,
          editableByCreator: a.editableByCreator,
          affectsLabel: a.affectsLabel,
          boundSlotId: resolveSlot(a.boundSlotId),
          required: a.required,
          sortOrder: a.sortOrder,
          values: {
            create: a.values.map((v) => ({
              label: v.label,
              isDefault: v.isDefault,
              leadTimeDeltaDays: Math.max(0, Math.floor(v.leadTimeDeltaDays || 0)),
              unitCostDeltaCents: Math.floor(v.unitCostDeltaCents || 0),
              moqOverride: v.moqOverride == null ? null : Math.max(1, Math.floor(v.moqOverride)),
              priceDeltaCents: Math.floor(v.priceDeltaCents || 0),
              overlayOp: v.overlayOp ?? 'NONE',
              recipeOverlay: v.recipeOverlay ?? undefined,
              sortOrder: v.sortOrder,
            })),
          },
        },
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveOptionAxes] failed:', err)
    return { ok: false, error: `Could not save options: ${(err as Error).message}` }
  }
}

export interface PricingTierInput {
  fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND'
  minQty: number
  maxQty: number | null
  perUnitCostCents: number
  perUnitFloorCents: number
  leadTimeDays: number | null
  sortOrder: number
}

/** Replace the draft's volume pricing tiers (#35). ProductTemplatePricingTier is
 *  a pre-existing model, so no cast needed. */
export async function savePricingTiers(productTemplateId: string, tiers: PricingTierInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    // sortOrder is unique per (template, mode) — index within each mode.
    const modeCount: Record<'BULK_PRODUCTION' | 'ON_DEMAND', number> = { BULK_PRODUCTION: 0, ON_DEMAND: 0 }
    const clean = tiers
      .filter((t) => t.minQty > 0 && t.perUnitCostCents > 0)
      .map((t) => {
        const fulfillmentMode = t.fulfillmentMode === 'ON_DEMAND' ? 'ON_DEMAND' : 'BULK_PRODUCTION'
        return {
          fulfillmentMode,
          minQty: Math.max(1, Math.floor(t.minQty)),
          maxQty: t.maxQty == null ? null : Math.max(t.minQty, Math.floor(t.maxQty)),
          perUnitCostCents: Math.max(0, Math.floor(t.perUnitCostCents)),
          perUnitFloorCents: Math.max(0, Math.floor(t.perUnitFloorCents)),
          leadTimeDays: t.leadTimeDays == null ? null : Math.max(0, Math.floor(t.leadTimeDays)),
          sortOrder: modeCount[fulfillmentMode]++,
        }
      })

    await prisma.$transaction([
      prisma.productTemplatePricingTier.deleteMany({ where: { productTemplateId } }),
      // fulfillmentMode is a new column — cast until the client is regenerated.
      ...clean.map((t) => prisma.productTemplatePricingTier.create({ data: { productTemplateId, ...t } as never })),
    ])
    return { ok: true }
  } catch (err) {
    console.error('[savePricingTiers] failed:', err)
    return { ok: false, error: `Could not save pricing: ${(err as Error).message}` }
  }
}

export interface ProductionInput {
  fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' | 'BOTH'
  moqMin: number
  orderIncrement: number
  monthlyCapacity: number | null
  shelfLifeDays: number | null
  lotTracking: boolean
  /** Manufacturer base SKU for the default variant. null/undefined leaves it unchanged. */
  sku?: string | null
}

/** Persist the draft's production spec onto its default variant (#35). Creates
 *  the default variant if none exists (geometry filled later by Recipe/Packaging).
 *  Cast-guarded — some variant columns post-date the generated client. */
export async function saveProduction(productTemplateId: string, input: ProductionInput): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const data: Record<string, unknown> = {
      fulfillmentMode: input.fulfillmentMode,
      moqMin: Math.max(1, Math.floor(input.moqMin || 1)),
      orderIncrement: Math.max(1, Math.floor(input.orderIncrement || 1)),
      monthlyCapacity: input.monthlyCapacity == null ? null : Math.max(0, Math.floor(input.monthlyCapacity)),
      shelfLifeDays: input.shelfLifeDays == null ? null : Math.max(1, Math.floor(input.shelfLifeDays)),
      lotTracking: input.lotTracking,
    }
    if (input.sku !== undefined) data.sku = input.sku?.trim() ? input.sku.trim() : null
    const existing = await prisma.productTemplateVariant.findFirst({ where: { productTemplateId }, select: { id: true } })
    if (existing) {
      await prisma.productTemplateVariant.update({ where: { id: existing.id }, data: data as never })
    } else {
      await prisma.productTemplateVariant.create({
        data: { productTemplateId, containerFormat: 'Default', servingsPerContainer: 1, servingSizeG: 1, ...data } as never,
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveProduction] failed:', err)
    return { ok: false, error: `Could not save production: ${(err as Error).message}` }
  }
}

export interface PackingInput {
  /** Inner packs per outer / units per bundle (single = packs-per-bundle, pack = units-per-outer). */
  innerPacksPerOuter?: number
  outerPacksPerCase?: number
  /** Pick-N max picks. null clears. */
  customerPicksCount?: number | null
  /** Subscription cadence ("weekly" | "biweekly" | "monthly" | "quarterly"). null clears. */
  subscriptionInterval?: string | null
  /** Free-form per-type extras (unitsPerPack, packType, outerPack, components, rotationSize,
   *  minCommitment, pickMin, …). MERGED into the variant's existing packingConfig so add-on
   *  cards (subscription / pick-N) and the base pack card don't clobber each other. */
  packingConfig?: Record<string, unknown>
}

/** Persist the draft's type-specific packing config onto its default variant (#35).
 *  Only writes the provided keys (the type cards each own a slice); packingConfig is
 *  merged, not replaced. Creates the default variant if none exists. Cast-guarded. */
export async function savePacking(productTemplateId: string, input: PackingInput): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const existing = await (prisma as unknown as {
      productTemplateVariant: { findFirst: (a: unknown) => Promise<{ id: string; packingConfig: unknown } | null> }
    }).productTemplateVariant.findFirst({ where: { productTemplateId }, select: { id: true, packingConfig: true } })

    const data: Record<string, unknown> = {}
    if (input.innerPacksPerOuter != null) data.innerPacksPerOuter = Math.max(1, Math.floor(input.innerPacksPerOuter))
    if (input.outerPacksPerCase != null) data.outerPacksPerCase = Math.max(1, Math.floor(input.outerPacksPerCase))
    if (input.customerPicksCount !== undefined) data.customerPicksCount = input.customerPicksCount == null ? null : Math.max(1, Math.floor(input.customerPicksCount))
    if (input.subscriptionInterval !== undefined) data.subscriptionInterval = input.subscriptionInterval
    if (input.packingConfig) {
      const prev = (existing?.packingConfig ?? {}) as Record<string, unknown>
      data.packingConfig = { ...prev, ...input.packingConfig }
    }
    if (Object.keys(data).length === 0) return { ok: true }

    if (existing) {
      await prisma.productTemplateVariant.update({ where: { id: existing.id }, data: data as never })
    } else {
      await prisma.productTemplateVariant.create({
        data: { productTemplateId, containerFormat: 'Default', servingsPerContainer: 1, servingSizeG: 1, ...data } as never,
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[savePacking] failed:', err)
    return { ok: false, error: `Could not save packing: ${(err as Error).message}` }
  }
}

export interface ChangeApprovalRuleInput {
  changeType: 'LABEL_COPY' | 'FLAVOR_ADD' | 'RECIPE_CHANGE' | 'PACKAGING_CHANGE' | 'PRICE_CHANGE'
  requiredApprover: 'BRAND_OPS' | 'MANUFACTURER_QA' | 'LEGAL' | 'PRODUCTION_SCHEDULING'
  sortOrder: number
}

/** Replace the draft's per-template approval-trigger overrides (#7). Cast-guarded. */
export async function saveChangeApprovalRules(productTemplateId: string, rules: ChangeApprovalRuleInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const p = prisma as unknown as { productChangeApprovalRule: { deleteMany: (a: unknown) => Promise<unknown>; createMany: (a: unknown) => Promise<unknown> } }
    await p.productChangeApprovalRule.deleteMany({ where: { productTemplateId } })
    if (rules.length) {
      await p.productChangeApprovalRule.createMany({
        data: rules.map((r, i) => ({ productTemplateId, changeType: r.changeType, requiredApprover: r.requiredApprover, sortOrder: r.sortOrder ?? i })),
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveChangeApprovalRules] failed:', err)
    return { ok: false, error: `Could not save approval rules: ${(err as Error).message}` }
  }
}

export interface OptionRuleInput {
  kind: 'EXCLUDE' | 'REQUIRE'
  whenValueId: string // composite "axisKey:valueLabel" (whenValueId/targetValueId are plain strings)
  targetValueId: string
  message: string | null
}

/** Replace the draft's cross-option compatibility rules (#5). Endpoints are
 *  composite axisKey:valueLabel keys (id-churn-safe). Cast-guarded. */
export async function saveOptionRules(productTemplateId: string, rules: OptionRuleInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const clean = rules.filter((r) => r.whenValueId && r.targetValueId && r.whenValueId !== r.targetValueId)
    const p = prisma as unknown as { productOptionRule: { deleteMany: (a: unknown) => Promise<unknown>; createMany: (a: unknown) => Promise<unknown> } }
    await p.productOptionRule.deleteMany({ where: { productTemplateId } })
    if (clean.length) {
      await p.productOptionRule.createMany({
        data: clean.map((r) => ({ productTemplateId, kind: r.kind, whenValueId: r.whenValueId, targetValueId: r.targetValueId, message: r.message?.trim() || null })),
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveOptionRules] failed:', err)
    return { ok: false, error: `Could not save compatibility rules: ${(err as Error).message}` }
  }
}

export interface FeeInput {
  label: string
  basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'
  amountCents: number
  waivedAboveQty: number | null
  sortOrder: number
}

/** Replace the draft's one-time / per-unit / per-order fees (#3). Cast-guarded:
 *  ProductTemplateFee lands on the client after the Phase-1 migration. */
export async function saveFees(productTemplateId: string, fees: FeeInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    const clean = fees
      .map((f, i) => ({ ...f, label: f.label.trim(), sortOrder: f.sortOrder ?? i }))
      .filter((f) => f.label.length > 0 && f.amountCents > 0)

    const p = prisma as unknown as {
      productTemplateFee: {
        deleteMany: (a: unknown) => Promise<unknown>
        createMany: (a: unknown) => Promise<unknown>
      }
    }
    await p.productTemplateFee.deleteMany({ where: { productTemplateId } })
    if (clean.length) {
      await p.productTemplateFee.createMany({
        data: clean.map((f) => ({
          productTemplateId,
          label: f.label,
          basis: f.basis,
          amountCents: Math.max(0, Math.floor(f.amountCents)),
          waivedAboveQty: f.basis === 'PER_SKU_ONE_TIME' && f.waivedAboveQty ? Math.max(1, Math.floor(f.waivedAboveQty)) : null,
          sortOrder: f.sortOrder,
        })),
      })
    }
    return { ok: true }
  } catch (err) {
    console.error('[saveFees] failed:', err)
    return { ok: false, error: `Could not save fees: ${(err as Error).message}` }
  }
}

export interface SampleOptionInput {
  kind: 'UNBRANDED' | 'BRANDED'
  enabled: boolean
  perFlavorCents: number | null
  samplerSetCents: number | null
  sampleMoq: number
  maxUnitsPerFlavor: number | null
  leadTimeDays: number
  creditTowardFirstOrder: boolean
  creditCapCents: number | null
  maxPerCreatorPerPeriod: number | null
}

/** Replace the draft's sample policy (one row per kind). Partner-set, per product
 *  (Pavel 2026-06-10). Cast-guarded — ProductSampleOption lands on the client after
 *  the sample-policy migration. */
export async function saveSampleOptions(productTemplateId: string, options: SampleOptionInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: productTemplateId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const nn = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.max(0, Math.floor(v)))
    const clean = options
      .filter((o) => o.kind === 'UNBRANDED' || o.kind === 'BRANDED')
      .map((o, i) => ({
        productTemplateId,
        kind: o.kind,
        enabled: !!o.enabled,
        perFlavorCents: nn(o.perFlavorCents),
        samplerSetCents: nn(o.samplerSetCents),
        sampleMoq: Math.max(1, Math.floor(o.sampleMoq || 1)),
        maxUnitsPerFlavor: o.maxUnitsPerFlavor == null ? null : Math.max(1, Math.floor(o.maxUnitsPerFlavor)),
        leadTimeDays: Math.max(0, Math.floor(o.leadTimeDays || 0)),
        creditTowardFirstOrder: !!o.creditTowardFirstOrder,
        creditCapCents: nn(o.creditCapCents),
        maxPerCreatorPerPeriod: o.maxPerCreatorPerPeriod == null ? null : Math.max(1, Math.floor(o.maxPerCreatorPerPeriod)),
        sortOrder: i,
      }))

    const p = prisma as unknown as { productSampleOption: { deleteMany: (a: unknown) => Promise<unknown>; createMany: (a: unknown) => Promise<unknown> } }
    await p.productSampleOption.deleteMany({ where: { productTemplateId } })
    if (clean.length) await p.productSampleOption.createMany({ data: clean })
    return { ok: true }
  } catch (err) {
    console.error('[saveSampleOptions] failed:', err)
    return { ok: false, error: `Could not save sample policy: ${(err as Error).message}` }
  }
}

export interface FlavorInput { name: string; statementOfIdentity?: string | null; sortOrder: number }

/** Replace the draft's flavor presets (the variety pool). Only named flavors
 *  persist; each becomes a FlavorPreset with an empty slot overlay (the recipe
 *  step fills slotResolution later). Idempotent: full replace by template. */
export async function saveFlavors(productTemplateId: string, flavors: FlavorInput[]): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    const clean = flavors
      .map((f, i) => ({ name: f.name.trim(), soi: f.statementOfIdentity?.trim() || null, sortOrder: f.sortOrder ?? i }))
      .filter((f) => f.name.length > 0)

    await prisma.$transaction([
      prisma.flavorPreset.deleteMany({ where: { productTemplateId } }),
      ...clean.map((f) =>
        prisma.flavorPreset.create({
          data: {
            productTemplateId,
            name: f.name,
            statementOfIdentity: f.soi,
            sortOrder: f.sortOrder,
            slotResolution: [], // recipe step fills the overlay later
          },
        }),
      ),
    ])
    return { ok: true }
  } catch (err) {
    console.error('[saveFlavors] failed:', err)
    return { ok: false, error: `Could not save flavors: ${(err as Error).message}` }
  }
}

/** Attached packaging-system ids for a draft (consolidation — Packaging step).
 *  Attach/detach reuse the editor's addPackagingLink / removePackagingLink. */
export async function loadPackaging(productTemplateId: string): Promise<string[]> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return []
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, packagingSystems: { select: { packagingSystemId: true } } },
    })
    if (!tpl) return []
    if (tpl.manufacturerServiceId && !partner.services.map((s) => s.id).includes(tpl.manufacturerServiceId)) return []
    return tpl.packagingSystems.map((p) => p.packagingSystemId)
  } catch (err) {
    console.error('[loadPackaging] failed:', err)
    return []
  }
}

export interface AllergenOverride { allergen: string; action: 'ADD' | 'REMOVE'; reason: string }
export interface AllergenData { autoDerived: string[]; manualOverrides: AllergenOverride[]; crossContamination: string }

/** Load allergen state for a draft (consolidation — Recipe step). autoDerived =
 *  union of the base ingredients' allergen flags; overrides + cross-contamination
 *  persist via saveManualAllergens + updateBasics. */
export async function loadAllergenData(productTemplateId: string): Promise<AllergenData> {
  const empty: AllergenData = { autoDerived: [], manualOverrides: [], crossContamination: '' }
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return empty
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true, allergenCrossContamination: true, allergenManualOverrides: true,
        ingredientSlots: { select: { baseIngredient: { select: { allergenFlags: true } } } },
      },
    })
    if (!tpl) return empty
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return empty

    const auto = [...new Set(tpl.ingredientSlots.flatMap((s) => s.baseIngredient?.allergenFlags ?? []))].sort()
    const overrides = Array.isArray(tpl.allergenManualOverrides) ? (tpl.allergenManualOverrides as unknown as AllergenOverride[]) : []
    return { autoDerived: auto, manualOverrides: overrides, crossContamination: tpl.allergenCrossContamination ?? '' }
  } catch (err) {
    console.error('[loadAllergenData] failed:', err)
    return empty
  }
}

export interface PhraseSuggestionLite { phraseId: string; title: string; body: string; requirement: string; cfrCitation: string | null; isLocked: boolean }
export interface PhraseData {
  labelingType: string
  factFlags: Array<{ key: string; label: string; help: string }>
  facts: Record<string, boolean>
  suggestions: PhraseSuggestionLite[]
  selectedPhraseIds: string[]
}

/** Load the label-phrase engine state for a draft (consolidation — Packaging
 *  step). Reuses @ilaunchify/marketplace suggestPhrases + PHRASE_FACT_FLAGS;
 *  toggles persist via the editor's saveProductPhraseFacts/saveProductPhrases. */
export async function loadPhraseData(productTemplateId: string): Promise<PhraseData | null> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return null
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true, labelingType: true, phraseFacts: true, phrases: { select: { mandatoryPhraseId: true } } },
    })
    if (!tpl) return null
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return null

    const labelingType = String(tpl.labelingType)
    const factFlags = PHRASE_FACT_FLAGS
      .filter((f) => f.labelingTypes.includes(labelingType))
      .map((f) => ({ key: f.key, label: f.label, help: f.help }))
    const { suggestions } = await suggestPhrases({ productTemplateId })
    return {
      labelingType,
      factFlags,
      facts: (tpl.phraseFacts ?? {}) as Record<string, boolean>,
      suggestions: suggestions.map((s) => ({ phraseId: s.phraseId, title: s.title, body: s.body, requirement: s.requirement, cfrCitation: s.cfrCitation, isLocked: s.isLocked })),
      selectedPhraseIds: tpl.phrases.map((p) => p.mandatoryPhraseId),
    }
  } catch (err) {
    console.error('[loadPhraseData] failed:', err)
    return null
  }
}

export interface CertTypeOption { id: string; name: string; badgeUrl: string | null }

/** Active cert-type catalog for the in-builder "request a certificate" form. */
export async function loadCertTypes(): Promise<CertTypeOption[]> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return []
    const types = await prisma.certificateType.findMany({
      where: { status: 'ACTIVE' }, orderBy: { name: 'asc' },
      select: { id: true, name: true, thumbnailFileId: true },
    })
    const badges = await resolveCertBadgeUrls(types.map((t) => t.thumbnailFileId)).catch(() => new Map<string, string>())
    return types.map((t) => ({ id: t.id, name: t.name, badgeUrl: t.thumbnailFileId ? (badges.get(t.thumbnailFileId) ?? null) : null }))
  } catch (err) {
    console.error('[loadCertTypes] failed:', err)
    return []
  }
}

export interface ComplianceCheck { label: string; status: 'ok' | 'fail' | 'pending' }

/** Structural pre-submit compliance checks for a draft (consolidation — Review).
 *  Mirrors the editor: the checks we CAN run live, the full FDA scan pends (#131). */
export async function loadComplianceChecks(productTemplateId: string): Promise<ComplianceCheck[]> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return []
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true, name: true, statementOfIdentity: true,
        ingredientSlots: { select: { id: true } },
        certificates: { select: { instance: { select: { id: true } } } },
      },
    })
    if (!tpl) return []
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return []

    const ok = (b: boolean): ComplianceCheck['status'] => (b ? 'ok' : 'fail')
    return [
      { label: 'Statement of identity set', status: ok(!!(tpl.statementOfIdentity?.trim() || tpl.name?.trim())) },
      { label: 'Recipe ingredients added', status: ok(tpl.ingredientSlots.length > 0) },
      { label: 'Certificate(s) attached', status: tpl.certificates.length > 0 ? 'ok' : 'pending' },
      { label: 'Big-9 allergens declared', status: 'pending' },
      { label: 'Nutrient panel + %DV', status: 'pending' },
      { label: 'Minimum font size enforced', status: 'pending' },
    ]
  } catch (err) {
    console.error('[loadComplianceChecks] failed:', err)
    return []
  }
}

export interface NoteRowData { id: string; authorName: string; authorType: string; body: string; createdAtIso: string }

/** Load the admin↔partner notes thread for a draft (consolidation). Posting
 *  reuses the editor's `postPartnerProductNote`. */
export async function loadNotes(productTemplateId: string): Promise<NoteRowData[]> {
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return []
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true,
        notes: { orderBy: { createdAt: 'asc' }, select: { id: true, authorId: true, authorType: true, body: true, createdAt: true } },
      },
    })
    if (!tpl) return []
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return []

    const authorIds = [...new Set(tpl.notes.map((n) => n.authorId))]
    const users = authorIds.length
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } })
      : []
    const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email]))
    return tpl.notes.map((n) => ({
      id: n.id, authorName: nameById.get(n.authorId) ?? 'Unknown',
      authorType: String(n.authorType), body: n.body, createdAtIso: n.createdAt.toISOString(),
    }))
  } catch (err) {
    console.error('[loadNotes] failed:', err)
    return []
  }
}

export interface BasicsPatch {
  name?: string
  familyCode?: string | null // base SKU
  description?: string | null // short
  longDescription?: string | null
  productType?: 'SINGLE' | 'MULTI_FLAVOR' | 'MULTI_PACK'
  packingProfileId?: string | null
  maxFlavorsPerPack?: number | null // multi-flavor variety cap; null = no cap
  // Phase 2 configurator (docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md §4,§5)
  storageClass?: 'AMBIENT' | 'CHILLED' | 'FROZEN'
  storageTempMinF?: number | null
  storageTempMaxF?: number | null
  leadTimeRepeatDays?: number | null
  leadTimeFirstRunDays?: number | null
  allergenCrossContamination?: string | null
  customMeta?: Array<{ key: string; value: string }> | null
}

/** Verify the partner owns the draft, then patch whitelisted Basics fields. */
export async function updateBasics(
  productTemplateId: string,
  patch: BasicsPatch,
): Promise<Result> {
  try {
    const { partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    const data: Record<string, unknown> = {}
    if (patch.name !== undefined) {
      const n = patch.name.trim()
      if (n.length < 2 || n.length > 120) return { ok: false, error: 'Name must be 2–120 chars.' }
      data.name = n
    }
    if (patch.familyCode !== undefined) data.familyCode = patch.familyCode?.trim() || null
    if (patch.description !== undefined) data.description = patch.description?.trim() || null
    if (patch.longDescription !== undefined) data.longDescription = patch.longDescription?.trim() || null
    if (patch.productType !== undefined) data.productType = patch.productType
    if (patch.packingProfileId !== undefined) data.packingProfileId = patch.packingProfileId
    if (patch.maxFlavorsPerPack !== undefined) {
      const m = patch.maxFlavorsPerPack
      data.maxFlavorsPerPack = m == null ? null : Math.max(1, Math.floor(m))
    }
    if (patch.storageClass !== undefined) data.storageClass = patch.storageClass
    if (patch.storageTempMinF !== undefined) data.storageTempMinF = patch.storageTempMinF
    if (patch.storageTempMaxF !== undefined) data.storageTempMaxF = patch.storageTempMaxF
    if (patch.leadTimeRepeatDays !== undefined) data.leadTimeRepeatDays = patch.leadTimeRepeatDays == null ? null : Math.max(0, Math.floor(patch.leadTimeRepeatDays))
    if (patch.leadTimeFirstRunDays !== undefined) data.leadTimeFirstRunDays = patch.leadTimeFirstRunDays == null ? null : Math.max(0, Math.floor(patch.leadTimeFirstRunDays))
    if (patch.allergenCrossContamination !== undefined) data.allergenCrossContamination = patch.allergenCrossContamination?.trim() || null
    if (patch.customMeta !== undefined) data.customMeta = patch.customMeta ?? undefined

    if (Object.keys(data).length === 0) return { ok: true }
    // `data` is built dynamically; the productType/longDescription fields exist
    // after `prisma db push` + `db:generate`. Cast keeps it green pre-generate.
    await prisma.productTemplate.update({ where: { id: productTemplateId }, data: data as never })
    revalidatePath('/products')
    return { ok: true }
  } catch (err) {
    console.error('[updateBasics] failed:', err)
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}

/**
 * Create a minimal DRAFT ProductTemplate from Basics only. No ingredients /
 * packaging / variants yet — those are added in the guided builder steps. The
 * submit gate (≥1 ingredient + packaging + variant) still applies at submit.
 */
export async function createDraftShell(
  input: CreateDraftShellInput,
): Promise<Result<{ id: string; slug: string }>> {
  // Whole body guarded — a server action must always resolve to a Result
  // (never throw / never resolve undefined), or the client crashes on res.ok.
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const name = input.name.trim()
    if (name.length < 2 || name.length > 120) {
      return { ok: false, error: 'Product name must be 2–120 characters.' }
    }
    if (!input.subcategoryId) return { ok: false, error: 'Pick a category + subcategory.' }

    const subcat = await prisma.subcategory.findUnique({
      where: { id: input.subcategoryId },
      select: { id: true },
    })
    if (!subcat) return { ok: false, error: 'Subcategory not found.' }

    // Unique slug from name + partner suffix.
    const base = slugify(name) || 'product'
    let slug = `${base}-${partner.id.slice(-6)}`
    let n = 0
    while (await prisma.productTemplate.findUnique({ where: { slug }, select: { id: true } })) {
      n += 1
      slug = `${base}-${partner.id.slice(-6)}-${n}`
      if (n > 50) return { ok: false, error: 'Could not generate a unique slug — try a different name.' }
    }

    const created = await prisma.productTemplate.create({
      data: {
        name,
        slug,
        subcategoryId: input.subcategoryId,
        manufacturerServiceId: partner.services[0]?.id ?? null,
        status: 'DRAFT',
      },
      select: { id: true, slug: true },
    })

    // Audit is best-effort — never let a logging hiccup fail the create.
    try {
      await logAuditAs(user, {
        entityType: 'ProductTemplate',
        entityId: created.id,
        action: 'PRODUCT_TEMPLATE_CREATE',
        toValue: 'DRAFT',
        payload: { partnerId: partner.id, name, via: 'guided-builder' },
      })
    } catch (auditErr) {
      console.error('[createDraftShell] audit log failed (non-fatal):', auditErr)
    }

    revalidatePath('/products')
    return { ok: true, data: created }
  } catch (err) {
    console.error('[createDraftShell] failed:', err)
    return { ok: false, error: `Could not create draft: ${(err as Error).message}` }
  }
}
