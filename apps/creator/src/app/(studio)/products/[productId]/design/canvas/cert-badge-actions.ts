'use server'

// Cert badges for the Design Studio (DESIGN_STUDIO.md §Certificate badges V1).
//
// Loads the product's EARNED certifications — V1 scope is manufacturer-supplied
// via ProductCertificate (VERIFIED instances of ACTIVE cert types). Recipe-
// eligible + brand-cert sources are V1.1. The studio is the print/production
// surface, so it prefers each cert type's VECTOR badge (CertificateType.
// badgeSvgFileId), falling back to the PNG (thumbnailFileId) when no SVG was
// uploaded. The chosen Asset on R2 resolves to a signed URL (re-derived each
// studio open — the cert zone reconciles, it doesn't persist the URL).
//
// Also manages the single "certifications surface" per product: a product has
// one Design per surface/die-cut, and exactly one is the badge host. Auto-
// defaults to the product's first Design; the creator can move it.

import { prisma } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { requireUser } from '@ilaunchify/auth'

/**
 * C7/C8 — an approved artwork variant of a cert badge (Color / B&W / Outline /
 * contextual lockup), with its brand-standard reproduction bounds. Surfaced so
 * the studio can offer a variant chooser and bind per-variant size rules.
 */
export interface CertBadgeVariant {
  variantId: string
  kind: string // CertAssetVariantKind
  label: string
  /** Resolved SVG (preferred) / PNG URL, or null if no asset uploaded. */
  url: string | null
  minWidthMm: number | null
  maxWidthMm: number | null
  /** C8 — text that must accompany the mark; auto-paired as a caption on place. */
  requiredCoText: string | null
  /** C8 — clear-space = factor × mark height; nothing may sit inside it. */
  clearSpaceFactor: number | null
}

export interface CertBadge {
  /** Stable id for the managed-zone reconcile (canvas object metadata). */
  certInstanceId: string
  certTypeName: string
  certTypeSlug: string
  /** Admin-curated badge SVG/PNG, or null if no badge was uploaded for the type. */
  badgeUrl: string | null
  /**
   * C6 render gate — true once the creator has recorded a LabelClaimConsent for
   * this cert instance + product. The studio must NOT render a badge until this
   * is true (never auto-stamp). Available now; the canvas gate is wired in C8.
   */
  consented: boolean
  /** C7 approved artwork variants for this cert type (may be empty). */
  variants: CertBadgeVariant[]
}

/** Resolve a platform Asset id to a long-lived signed URL (8h design session). */
async function resolveAssetUrl(assetId: string | null): Promise<string | null> {
  if (!assetId) return null
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { storageKey: true },
  })
  if (!asset?.storageKey) return null
  return getSignedReadUrl(asset.storageKey, { expiresInSeconds: 8 * 60 * 60 })
}

export interface ProductCertBadgesResult {
  badges: CertBadge[]
  /** The Design that hosts the cert zone (auto-defaulted on first load). */
  hostDesignId: string | null
}

function authorizeProduct(productId: string, userId: string) {
  return prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId } } },
    select: { id: true, productTemplateId: true },
  })
}

/**
 * Ensure exactly one of the product's Designs is the certifications host.
 * Auto-defaults to the first (primary) Design when none is set yet.
 */
async function ensureCertHostSurface(productId: string): Promise<string | null> {
  const designs = await prisma.design.findMany({
    where: { productId },
    select: { id: true, showsCertifications: true },
    orderBy: { createdAt: 'asc' },
  })
  if (designs.length === 0) return null
  const existing = designs.find((d) => d.showsCertifications)
  if (existing) return existing.id
  const first = designs[0]!
  await prisma.design.update({
    where: { id: first.id },
    data: { showsCertifications: true },
  })
  return first.id
}

export async function loadProductCertBadges(
  productId: string,
): Promise<ProductCertBadgesResult> {
  const user = await requireUser()
  const product = await authorizeProduct(productId, user.id)
  if (!product) return { badges: [], hostDesignId: null }

  const hostDesignId = await ensureCertHostSurface(productId)
  if (!product.productTemplateId) return { badges: [], hostDesignId }

  // C6 — which cert instances this creator has ACTIVE consent to display.
  const consentRows = await prisma.labelClaimConsent.findMany({
    where: { userId: user.id, productId, revokedAt: null, partnerCertificateInstanceId: { not: null } },
    select: { partnerCertificateInstanceId: true },
  })
  const consentedIds = new Set(consentRows.map((r) => r.partnerCertificateInstanceId))

  const certs = await prisma.productCertificate.findMany({
    where: {
      productTemplateId: product.productTemplateId,
      instance: { status: 'VERIFIED' },
    },
    select: {
      instance: {
        select: {
          id: true,
          certificateType: {
            select: {
              name: true,
              slug: true,
              status: true,
              thumbnailFileId: true,
              badgeSvgFileId: true,
              assetVariants: {
                select: {
                  id: true,
                  kind: true,
                  label: true,
                  svgFileId: true,
                  pngFileId: true,
                  minWidthMm: true,
                  maxWidthMm: true,
                  requiredCoText: true,
                  clearSpaceFactor: true,
                },
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      },
    },
  })

  const badges: CertBadge[] = []
  for (const c of certs) {
    const ct = c.instance.certificateType
    if (ct.status !== 'ACTIVE') continue
    // Production surface → prefer the VECTOR SVG; fall back to the PNG so the
    // cert still renders if no SVG was uploaded for the type yet. (8h TTL covers
    // a whole design session — the URL is held through reconcile + drawer add.)
    const badgeUrl = await resolveAssetUrl(ct.badgeSvgFileId ?? ct.thumbnailFileId)

    const variants: CertBadgeVariant[] = await Promise.all(
      ct.assetVariants.map(async (v) => ({
        variantId: v.id,
        kind: v.kind,
        label: v.label,
        url: await resolveAssetUrl(v.svgFileId ?? v.pngFileId),
        minWidthMm: v.minWidthMm,
        maxWidthMm: v.maxWidthMm,
        requiredCoText: v.requiredCoText,
        clearSpaceFactor: v.clearSpaceFactor,
      })),
    )

    badges.push({
      certInstanceId: c.instance.id,
      certTypeName: ct.name,
      certTypeSlug: ct.slug,
      badgeUrl,
      consented: consentedIds.has(c.instance.id),
      variants: variants.filter((v) => v.url),
    })
  }

  return { badges, hostDesignId }
}

/**
 * Move the certifications host to a different surface (Design). Enforces
 * at-most-one host per product.
 */
export async function setCertificationsSurface(
  designId: string,
): Promise<{ ok: boolean }> {
  const user = await requireUser()
  const design = await prisma.design.findFirst({
    where: { id: designId, product: { brand: { creatorProfile: { userId: user.id } } } },
    select: { id: true, productId: true },
  })
  if (!design) return { ok: false }
  await prisma.$transaction([
    prisma.design.updateMany({
      where: { productId: design.productId },
      data: { showsCertifications: false },
    }),
    prisma.design.update({
      where: { id: design.id },
      data: { showsCertifications: true },
    }),
  ])
  return { ok: true }
}
