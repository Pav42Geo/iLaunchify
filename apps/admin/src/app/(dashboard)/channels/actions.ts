'use server'

// Admin toggles a channel on/off. Disabling a channel hides it from the
// creator UI for new connections; existing ChannelConnections are not
// touched (they keep working until creator disconnects).

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function toggleChannel({
  channelId,
  enabled,
}: { channelId: string; enabled: boolean }): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const channel = await prisma.channel.findUnique({ where: { id: channelId } })
  if (!channel) return { ok: false, error: 'Channel not found' }

  await prisma.channel.update({
    where: { id: channelId },
    data: { enabled },
  })

  await logAuditAs(admin, {
    entityType: 'Channel' as never,
    entityId: channelId,
    action: enabled ? 'CHANNEL_ENABLE' : 'CHANNEL_DISABLE',
    fromValue: String(channel.enabled),
    toValue: String(enabled),
    payload: { code: channel.code, displayName: channel.displayName },
  })

  revalidatePath('/channels')
  return { ok: true }
}
