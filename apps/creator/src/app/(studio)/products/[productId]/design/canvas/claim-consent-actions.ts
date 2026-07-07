'use server'

// C6 — consent-at-claim server actions. A cert badge must NOT render on a label
// until the creator has recorded a LabelClaimConsent for that specific cert
// instance + product. These actions are the render gate the Design Studio (C8)
// wires the consent modal to. NEVER auto-stamp.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { headers } from 'next/headers'
import { CERT_CLAIM_CONSENT_VERSION } from './claim-consent'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

/** The product must belong to a brand owned by the calling creator. */
async function authorizeProduct(productId: string, userId: string) {
  return prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId } } },
    select: { id: true, productTemplateId: true },
  })
}

async function clientMeta(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  const ip = fwd ? fwd.split(',')[0]!.trim() : (h.get('x-real-ip') ?? null)
  return { ip, ua: h.get('user-agent') ?? null }
}

/**
 * Record consent to place a cert badge on this product's label. Idempotent-ish:
 * if an active (non-revoked) consent already exists for (user, product,
 * instance), it's reused rather than duplicated.
 */
export async function recordLabelClaimConsent(input: {
  productId: string
  certInstanceId: string
  designVersion?: string | null
}): Promise<Result<{ consentId: string }>> {
  const user = await requireUser()
  const product = await authorizeProduct(input.productId, user.id)
  if (!product) return { ok: false, error: 'Product not found.' }

  // The cert instance must actually be attached to this product's template and
  // VERIFIED — you can't consent to a claim the product isn't entitled to.
  const attached = product.productTemplateId
    ? await prisma.productCertificate.findUnique({
        where: {
          productTemplateId_instanceId: {
            productTemplateId: product.productTemplateId,
            instanceId: input.certInstanceId,
          },
        },
        select: {
          instance: {
            select: {
              id: true,
              status: true,
              certificateTypeId: true,
              certificateType: { select: { name: true } },
            },
          },
        },
      })
    : null
  if (!attached || attached.instance.status !== 'VERIFIED') {
    return { ok: false, error: 'That certification is not available for this product.' }
  }

  const existing = await prisma.labelClaimConsent.findFirst({
    where: {
      userId: user.id,
      productId: input.productId,
      partnerCertificateInstanceId: input.certInstanceId,
      revokedAt: null,
    },
    select: { id: true },
  })
  if (existing) return { ok: true, data: { consentId: existing.id } }

  const { ip, ua } = await clientMeta()
  const created = await prisma.labelClaimConsent.create({
    data: {
      userId: user.id,
      productId: input.productId,
      productTemplateId: product.productTemplateId,
      designVersion: input.designVersion ?? null,
      partnerCertificateInstanceId: input.certInstanceId,
      certificateTypeId: attached.instance.certificateTypeId,
      certName: attached.instance.certificateType.name,
      consentTextVersion: CERT_CLAIM_CONSENT_VERSION,
      ipAddress: ip,
      userAgent: ua,
    },
  })

  await logAuditAs(user, {
    entityType: 'Product',
    entityId: input.productId,
    action: 'LABEL_CLAIM_CONSENT_GRANT',
    payload: { productTemplateId: product.productTemplateId },
  })

  return { ok: true, data: { consentId: created.id } }
}

/** Withdraw consent (creator removed the badge). Marks the active row revoked. */
export async function revokeLabelClaimConsent(input: {
  productId: string
  certInstanceId: string
}): Promise<Result> {
  const user = await requireUser()
  const product = await authorizeProduct(input.productId, user.id)
  if (!product) return { ok: false, error: 'Product not found.' }

  await prisma.labelClaimConsent.updateMany({
    where: {
      userId: user.id,
      productId: input.productId,
      partnerCertificateInstanceId: input.certInstanceId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'Product',
    entityId: input.productId,
    action: 'LABEL_CLAIM_CONSENT_REVOKE',
    payload: { productTemplateId: product.productTemplateId },
  })

  return { ok: true }
}

/**
 * The set of cert-instance ids the creator has ACTIVE consent for on this
 * product — the render gate. The studio renders a badge only if its instance id
 * is in this set.
 */
export async function getConsentedCertInstanceIds(productId: string): Promise<string[]> {
  const user = await requireUser()
  const product = await authorizeProduct(productId, user.id)
  if (!product) return []

  const rows = await prisma.labelClaimConsent.findMany({
    where: {
      userId: user.id,
      productId,
      revokedAt: null,
      partnerCertificateInstanceId: { not: null },
    },
    select: { partnerCertificateInstanceId: true },
  })
  return rows.map((r) => r.partnerCertificateInstanceId!).filter(Boolean)
}
