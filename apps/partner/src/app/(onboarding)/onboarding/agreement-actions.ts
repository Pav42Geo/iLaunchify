'use server'

// Partner Agreement e-signature — persist a signed agreement.
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §4 + AUTH_ENTRANCE_SECURITY §4.
//
// Loads the CURRENT PartnerAgreement server-side (the authoritative text — never
// trust client-provided document text), builds the tamper-evident record with
// the verified builder, and persists PartnerAgreementSignature + AuditLog. The
// request IP/user-agent come from headers server-side, and the timestamp is the
// server clock — the ESIGN/UETA evidence per the legal redline.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { buildAgreementSignatureRecord } from '@/lib/agreement-signature'

const CONSENT_TEXT_VERSION = 'partner-consent-1'

export type SignAgreementResult =
  | { ok: true; alreadySigned: boolean; recordSha256: string }
  | { ok: false; error: string }

/**
 * <form action> wrapper — returns void so it can bind directly to a server-form
 * (no client component needed). Reads the typed legal name from FormData; the
 * "I agree" checkbox is enforced natively (required) on the form. Errors are
 * silent no-ops here (the page re-renders its state); a client modal can call
 * signPartnerAgreement() directly for richer feedback later.
 */
export async function signAgreementFromForm(formData: FormData): Promise<void> {
  const signerName = String(formData.get('signerName') ?? '').trim()
  if (!signerName) return
  await signPartnerAgreement({ signerName, method: 'typed' })
}

export async function signPartnerAgreement(input: {
  signerName: string
  method: 'typed' | 'drawn'
}): Promise<SignAgreementResult> {
  const user = await requireUser()
  if (!input.signerName.trim()) return { ok: false, error: 'Type your full legal name to sign.' }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { ok: false, error: 'Partner not found' }

  const agreement = await prisma.partnerAgreement.findFirst({
    where: { isCurrent: true },
    orderBy: { effectiveAt: 'desc' },
  })
  if (!agreement) return { ok: false, error: 'No active partner agreement is published yet.' }

  // Idempotent: one signature per (partner, version). Re-signing is a no-op.
  const existing = await prisma.partnerAgreementSignature.findUnique({
    where: { partnerId_agreementVersion: { partnerId: partner.id, agreementVersion: agreement.version } },
    select: { recordSha256: true },
  })
  if (existing) return { ok: true, alreadySigned: true, recordSha256: existing.recordSha256 }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null

  const record = buildAgreementSignatureRecord({
    signerId: user.id,
    signerName: input.signerName.trim(),
    signerEmail: user.email,
    agreementVersion: agreement.version,
    documentText: agreement.bodyMarkdown, // authoritative server-side text
    consentTextVersion: CONSENT_TEXT_VERSION,
    method: input.method,
    ip,
    userAgent,
  })

  await prisma.partnerAgreementSignature.create({
    data: {
      partnerId: partner.id,
      signerUserId: user.id,
      agreementId: agreement.id,
      agreementVersion: record.agreementVersion,
      signerName: record.signerName,
      signerEmail: record.signerEmail,
      method: record.method,
      ip: record.ip,
      userAgent: record.userAgent,
      consentTextVersion: record.consentTextVersion,
      documentSha256: record.documentSha256,
      recordSha256: record.recordSha256,
    },
  })

  await logAuditAs(user, {
    entityType: 'PartnerAgreementSignature',
    entityId: partner.id,
    action: 'PARTNER_AGREEMENT_SIGNED',
    toValue: agreement.version,
    payload: {
      method: record.method,
      recordSha256: record.recordSha256,
      documentSha256: record.documentSha256,
    },
  })

  revalidatePath('/onboarding')
  return { ok: true, alreadySigned: false, recordSha256: record.recordSha256 }
}
