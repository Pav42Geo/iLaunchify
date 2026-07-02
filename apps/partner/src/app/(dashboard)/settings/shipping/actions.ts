'use server'

// Phase L2a — partner carrier setup (docs/LOGISTICS_AND_FULFILLMENT.md §6.1).
//
// Two account modes, both EasyPost-backed:
//   PLATFORM_CHILD — one Forge child user per partner. Platform pays postage
//     centrally and re-charges; the child id lands in CarrierAccount.externalRef.
//     The child API KEY is NOT stored here (integrations-registry rule: env /
//     secret store only, never the DB).
//   BYO_PARCEL — the partner's own negotiated carrier account. V1: an admin
//     creates the EasyPost carrier-account (ca_…) and the partner pastes its id;
//     the full in-product credential flow comes later.
//
// All server actions re-check the 'carrier:easypost' logistics gate — the page
// gating is UX only.

import { prisma, isLogisticsEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { EasyPostParcelGateway, createFetchEasyPostHttp } from '@ilaunchify/shipping'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

async function loadOwnedPartner(userId: string) {
  return prisma.partner.findUnique({
    where: { userId },
    select: { id: true, companyName: true },
  })
}

async function gateOpen(): Promise<boolean> {
  return isLogisticsEnabled('carrier:easypost')
}

/**
 * "Enable iLaunchify shipping" — creates the partner's EasyPost Forge child
 * user + a PLATFORM_CHILD CarrierAccount. Idempotent: one active PLATFORM_CHILD
 * per partner; repeat calls return ok without touching EasyPost again.
 */
export async function enablePlatformShipping(): Promise<Result> {
  const user = await requireUser()
  const partner = await loadOwnedPartner(user.id)
  if (!partner) return { ok: false, error: 'Partner profile not found.' }
  if (!(await gateOpen())) return { ok: false, error: 'iLaunchify shipping is not enabled yet.' }

  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) return { ok: false, error: 'iLaunchify shipping is not configured on this environment.' }

  // Idempotency — one active PLATFORM_CHILD per partner.
  const existing = await prisma.carrierAccount.findFirst({
    where: { partnerId: partner.id, provider: 'easypost', type: 'PLATFORM_CHILD', active: true },
    select: { id: true },
  })
  if (existing) return { ok: true }

  const gateway = new EasyPostParcelGateway(createFetchEasyPostHttp(), apiKey)
  let childUserId: string
  try {
    const child = await gateway.createChildUser(partner.companyName)
    childUserId = child.childUserId
  } catch (err) {
    return { ok: false, error: `Could not create your shipping account: ${(err as Error).message}` }
  }

  const account = await prisma.carrierAccount.create({
    data: {
      partnerId: partner.id,
      type: 'PLATFORM_CHILD',
      provider: 'easypost',
      externalRef: childUserId,
      active: true,
    },
  })

  // CarrierAccount isn't an AuditEntityType yet — anchor the audit row on the
  // Partner (the account is a partner capability); payload carries the details.
  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'CARRIER_ACCOUNT_CREATED',
    toValue: 'PLATFORM_CHILD',
    payload: {
      carrierAccountId: account.id,
      provider: 'easypost',
      type: 'PLATFORM_CHILD',
      externalRef: childUserId,
    },
  })

  revalidatePath('/settings/shipping')
  return { ok: true }
}

/**
 * BYO — save the EasyPost carrier-account id (ca_…) an admin provisioned for
 * this partner's negotiated UPS/FedEx rates. Idempotent on the same ref.
 */
export async function saveByoCarrierAccount({ externalRef }: { externalRef: string }): Promise<Result> {
  const user = await requireUser()
  const partner = await loadOwnedPartner(user.id)
  if (!partner) return { ok: false, error: 'Partner profile not found.' }
  if (!(await gateOpen())) return { ok: false, error: 'iLaunchify shipping is not enabled yet.' }

  const ref = externalRef.trim()
  if (!ref) return { ok: false, error: 'Paste the carrier-account id.' }
  if (!/^ca_[A-Za-z0-9]+$/.test(ref)) {
    return { ok: false, error: 'That does not look like an EasyPost carrier-account id (expected ca_…).' }
  }
  if (ref.length > 100) return { ok: false, error: 'Carrier-account id is too long.' }

  const existing = await prisma.carrierAccount.findFirst({
    where: { partnerId: partner.id, provider: 'easypost', type: 'BYO_PARCEL', externalRef: ref, active: true },
    select: { id: true },
  })
  if (existing) return { ok: true }

  const account = await prisma.carrierAccount.create({
    data: {
      partnerId: partner.id,
      type: 'BYO_PARCEL',
      provider: 'easypost',
      externalRef: ref,
      active: true,
    },
  })

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'CARRIER_ACCOUNT_CREATED',
    toValue: 'BYO_PARCEL',
    payload: {
      carrierAccountId: account.id,
      provider: 'easypost',
      type: 'BYO_PARCEL',
      externalRef: ref,
    },
  })

  revalidatePath('/settings/shipping')
  return { ok: true }
}

/** Deactivate a carrier account (wrong id pasted, rates changed, …). Soft —
    the row stays for label-purchase attribution history. */
export async function deactivateCarrierAccount({ accountId }: { accountId: string }): Promise<Result> {
  const user = await requireUser()
  const partner = await loadOwnedPartner(user.id)
  if (!partner) return { ok: false, error: 'Partner profile not found.' }

  const account = await prisma.carrierAccount.findFirst({
    where: { id: accountId, partnerId: partner.id },
    select: { id: true, type: true, externalRef: true, active: true },
  })
  if (!account) return { ok: false, error: 'Carrier account not found.' }
  if (!account.active) return { ok: true }

  await prisma.carrierAccount.update({ where: { id: account.id }, data: { active: false } })

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'CARRIER_ACCOUNT_DEACTIVATED',
    fromValue: account.type,
    payload: {
      carrierAccountId: account.id,
      provider: 'easypost',
      type: account.type,
      externalRef: account.externalRef,
    },
  })

  revalidatePath('/settings/shipping')
  return { ok: true }
}
