'use server'

// F — partner job-progress submission (docs/EMAIL_NOTIFICATION_CENTER.md
// Part 3, checklist F). Lets the partner post interim progress from the floor:
// a NOTE, a revised ETA (also stamped to OrderDispatch.currentEtaAt), or a
// MILESTONE — the operation-level signal between "accepted" and "shipped".
// Each entry lands on the creator's order timeline + fires
// CREATOR_DISPATCH_PROGRESS (category: orders — group-opt-outable).
//
// PHOTO kind exists in the model; the upload UI ships in a follow-up.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'
import { serviceOwnedBy } from '@/lib/partner-context'

type Result = { ok: true } | { ok: false; error: string }

export type ProgressKind = 'NOTE' | 'ETA' | 'MILESTONE'

/** States where interim progress makes sense (accepted → not yet delivered). */
const ACTIVE_STATES = new Set([
  'ACCEPTED',
  'PRODUCING',
  'QUALITY_CHECK',
  'READY',
  'SHIPPED',
  'IN_TRANSIT',
])

export interface ProgressUpdateRow {
  id: string
  kind: 'NOTE' | 'ETA' | 'PHOTO' | 'MILESTONE'
  body: string | null
  etaAt: Date | string | null
  photoAssetId: string | null
  milestone: string | null
  authorName: string | null
  createdAt: Date | string
}

function fmtEtaUtc(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function humanMilestone(slug: string): string {
  const words = slug.toLowerCase().split(/[-_\s]+/).filter(Boolean)
  const first = words[0]
  if (!first) return slug
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ')
}

export async function submitProgressUpdate(params: {
  dispatchId: string
  kind: ProgressKind
  body?: string
  /** ISO date (kind=ETA). */
  etaAt?: string
  /** Machine slug (kind=MILESTONE), e.g. "plates-made". */
  milestone?: string
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await prisma.orderDispatch.findFirst({
    where: { id: params.dispatchId, partnerService: serviceOwnedBy(user.id) },
    include: {
      order: { select: { id: true, creatorUserId: true } },
      partnerService: { include: { partner: { select: { companyName: true } } } },
    },
  })
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (!ACTIVE_STATES.has(dispatch.status)) {
    return { ok: false, error: `Progress updates aren't available from ${dispatch.status}` }
  }

  const body = params.body?.trim().slice(0, 1000) || null
  let etaAt: Date | null = null
  let milestone: string | null = null

  if (params.kind === 'ETA') {
    if (!params.etaAt) return { ok: false, error: 'Pick the revised delivery date' }
    etaAt = new Date(params.etaAt)
    if (Number.isNaN(etaAt.getTime())) return { ok: false, error: 'Invalid date' }
    if (etaAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      return { ok: false, error: 'The revised ETA must be in the future' }
    }
  } else if (params.kind === 'MILESTONE') {
    milestone = params.milestone?.trim().slice(0, 80) || null
    if (!milestone) return { ok: false, error: 'Pick or name the milestone' }
  } else if (!body) {
    return { ok: false, error: 'Write a short update first' }
  }

  const partnerName = dispatch.partnerService.partner.companyName

  const created = await prisma.dispatchProgressUpdate.create({
    data: {
      dispatchId: dispatch.id,
      kind: params.kind,
      body,
      etaAt,
      milestone,
      authorUserId: user.id,
      authorName: user.name ?? partnerName,
    },
  })
  if (etaAt) {
    await prisma.orderDispatch.update({
      where: { id: dispatch.id },
      data: { currentEtaAt: etaAt },
    })
  }

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_PROGRESS_UPDATE',
    payload: {
      orderId: dispatch.orderId,
      progressUpdateId: created.id,
      kind: params.kind,
      etaAt: etaAt?.toISOString(),
      milestone,
    },
  })

  // Best-effort creator notification — failures swallow (dispatcher policy).
  const summary =
    params.kind === 'ETA' && etaAt
      ? `updated the delivery estimate to ${fmtEtaUtc(etaAt)}`
      : params.kind === 'MILESTONE' && milestone
        ? `reached a milestone: ${humanMilestone(milestone)}`
        : 'posted a production update'
  await dispatchNotification({
    userId: dispatch.order.creatorUserId,
    event: 'CREATOR_DISPATCH_PROGRESS',
    audience: 'creator',
    data: {
      orderId: dispatch.orderId,
      partnerName,
      kind: params.kind,
      summary,
      note: body ?? undefined,
    },
  })

  revalidatePath(`/orders/${params.dispatchId}`)
  return { ok: true }
}

/** Recent progress updates for the dispatch detail page (newest first). */
export async function listProgressUpdates(dispatchId: string): Promise<ProgressUpdateRow[]> {
  return prisma.dispatchProgressUpdate.findMany({
    where: { dispatchId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
}
