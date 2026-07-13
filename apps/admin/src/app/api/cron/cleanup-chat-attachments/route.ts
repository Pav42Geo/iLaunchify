// POST /api/cron/cleanup-chat-attachments
//
// Cron-triggered: deletes ORPHANED chat-attachment objects from R2. Composer
// uploads land in storage BEFORE the message sends (uploadChatAttachmentAction),
// so abandoned drafts leave objects behind forever. An object is deleted only
// when it (a) sits under a `/chat/` key segment, (b) is older than 24h — never
// races an in-flight composer — and (c) no RoomMessage/DirectMessage references
// it. Decision core is pure + tested: findOrphanedChatKeys (@ilaunchify/orders).
// Mirrors the archive-notifications route's shared-secret auth.
//
// Schedule (vercel.json): { "path": "/api/cron/cleanup-chat-attachments", "schedule": "0 5 * * *" }

import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@ilaunchify/db'
import { findOrphanedChatKeys } from '@ilaunchify/orders'
import { listKeys, deleteFiles } from '@ilaunchify/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MIN_AGE_MS = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set on the server' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Every stored object under the two chat roots (rooms/ also holds label
    // proofs — the pure filter only ever selects /chat/ keys).
    const [roomObjects, dmObjects] = await Promise.all([listKeys('rooms/'), listKeys('dms/')])

    // Every key a sent message still references.
    const [roomMsgs, dms] = await Promise.all([
      prisma.roomMessage.findMany({
        where: { NOT: { attachment: { equals: Prisma.DbNull } } },
        select: { attachment: true },
      }),
      prisma.directMessage.findMany({
        where: { NOT: { attachment: { equals: Prisma.DbNull } } },
        select: { attachment: true },
      }),
    ])
    const referencedKeys = [...roomMsgs, ...dms].flatMap((m) => {
      const key = (m.attachment as { key?: unknown } | null)?.key
      return typeof key === 'string' ? [key] : []
    })

    const orphans = findOrphanedChatKeys({
      objects: [...roomObjects, ...dmObjects],
      referencedKeys,
      cutoff: new Date(Date.now() - MIN_AGE_MS),
    })
    const deleted = await deleteFiles(orphans)

    return NextResponse.json({
      ok: true,
      scanned: roomObjects.length + dmObjects.length,
      referenced: referencedKeys.length,
      orphans: orphans.length,
      deleted,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
