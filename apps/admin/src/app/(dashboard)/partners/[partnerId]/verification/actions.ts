'use server'

// Server actions for the partner verification queue.
//
// Pattern: admin reviews each section independently. Setting a section to
// VERIFIED / NEEDS_CHANGES / REJECTED persists to PartnerVerificationSection
// (upserting on first review) + records who did it + writes audit log.
//
// Overall status is *computed* (not stored) — the partner detail page calls
// computeOverallStatus() to show "ready to activate" vs "needs more sections."

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import type {
  VerificationSectionStatus,
  VerificationSectionType,
} from '@prisma/client'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const ACTION_BY_STATUS: Record<VerificationSectionStatus, string> = {
  PENDING: 'VERIFICATION_SECTION_RESET',
  VERIFIED: 'VERIFICATION_SECTION_VERIFY',
  NEEDS_CHANGES: 'VERIFICATION_SECTION_NEEDS_CHANGES',
  REJECTED: 'VERIFICATION_SECTION_REJECT',
}

export async function setSectionStatus({
  partnerId,
  sectionType,
  status,
  adminNotes,
}: {
  partnerId: string
  sectionType: VerificationSectionType
  status: VerificationSectionStatus
  adminNotes?: string
}): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, companyName: true, userId: true },
  })
  if (!partner) return { ok: false, error: 'Partner not found' }

  // Upsert so admin can review a section that hasn't been touched by a partner upload yet
  const existing = await prisma.partnerVerificationSection.findUnique({
    where: { partnerId_type: { partnerId, type: sectionType } },
  })

  const verifiedAt = status === 'PENDING' ? null : new Date()
  const verifiedById = status === 'PENDING' ? null : admin.id

  const section = await prisma.partnerVerificationSection.upsert({
    where: { partnerId_type: { partnerId, type: sectionType } },
    create: {
      partnerId,
      type: sectionType,
      status,
      adminNotes: adminNotes?.trim() || null,
      verifiedAt,
      verifiedById,
    },
    update: {
      status,
      // Allow clearing notes by passing an empty string; keep prior notes if undefined
      ...(adminNotes !== undefined ? { adminNotes: adminNotes.trim() || null } : {}),
      verifiedAt,
      verifiedById,
    },
  })

  await logAuditAs(admin, {
    entityType: 'PartnerVerificationSection',
    entityId: section.id,
    action: ACTION_BY_STATUS[status],
    fromValue: existing?.status ?? null,
    toValue: status,
    payload: {
      partnerId,
      companyName: partner.companyName,
      sectionType,
      notesPreview: section.adminNotes?.slice(0, 100) ?? null,
    },
  })

  // Notify the partner when admin verifies or requests changes
  if (status === 'VERIFIED') {
    await dispatchNotification({
      userId: partner.userId,
      event: 'SECTION_VERIFIED',
      data: { sectionType, companyName: partner.companyName },
      audience: 'partner',
    })
  } else if (status === 'NEEDS_CHANGES') {
    await dispatchNotification({
      userId: partner.userId,
      event: 'SECTION_NEEDS_CHANGES',
      data: {
        sectionType,
        companyName: partner.companyName,
        notes: section.adminNotes ?? undefined,
      },
      audience: 'partner',
    })
  }

  revalidatePath(`/partners/${partnerId}`)
  revalidatePath(`/partners/${partnerId}/verification`)
  return { ok: true }
}
