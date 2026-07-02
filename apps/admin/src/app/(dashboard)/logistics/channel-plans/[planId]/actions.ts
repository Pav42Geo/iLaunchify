'use server'

// Admin channel-inbound plan actions (Phase L3b). Guarded like the sibling
// logistics detail pages (requireCapability('platform:admin')) + audited.
//
// Only DRAFT plans can be cancelled — once a plan is CONFIRMED the manifest is
// immutable and the channel fines plan-vs-actual deviations (docs/LOGISTICS_
// AND_FULFILLMENT.md §7.2), so un-drafted plans must be resolved with the
// channel, never flipped here.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function cancelChannelPlan(planId: string): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  try {
    const plan = await prisma.channelInboundPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        status: true,
        orderId: true,
        externalPlanId: true,
        channelConnection: { select: { channel: { select: { code: true } } } },
      },
    })
    if (!plan) return { ok: false, error: 'Plan not found.' }
    if (plan.status !== 'DRAFT') {
      return {
        ok: false,
        error:
          'Only DRAFT plans can be cancelled here — confirmed plans are locked with the channel and must be resolved via the channel workflow.',
      }
    }

    await prisma.channelInboundPlan.update({
      where: { id: planId },
      data: { status: 'CANCELLED' },
    })

    // packages/audit AUDIT_ENTITY_TYPES has no ChannelInboundPlan /
    // ChannelConnection entity types yet, and packages/** is out of scope this
    // session — log under 'Order' (the plan's parent entity; the plan id rides
    // in the payload so /audit?entityType=Order&entityId=<orderId> shows it).
    await logAuditAs(admin, {
      entityType: 'Order',
      entityId: plan.orderId,
      action: 'CHANNEL_PLAN_CANCELLED',
      fromValue: 'DRAFT',
      toValue: 'CANCELLED',
      payload: {
        channelInboundPlanId: plan.id,
        externalPlanId: plan.externalPlanId,
        channelCode: plan.channelConnection.channel.code,
      },
    })

    revalidatePath('/logistics/channel-plans')
    revalidatePath(`/logistics/channel-plans/${planId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not cancel the plan: ${(err as Error).message}` }
  }
}
