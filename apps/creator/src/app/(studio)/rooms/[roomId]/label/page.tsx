// Room label Studio — server loader (A8, self-design-on-dieline slice 3).
// New-tab, full-screen editor (D-S1). All guards + substrate resolution + the
// Design.roomId adapter live in resolveRoomLabelStudio so the loader stays thin.

import { requireUser } from '@ilaunchify/auth'
import { resolveRoomLabelStudio, roomLabelBlockCopy } from '@/lib/room-label-design'
import { RoomLabelStudioClient } from './RoomLabelStudioClient'

export const dynamic = 'force-dynamic'

export default async function RoomLabelStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { roomId } = await params
  const sp = await searchParams
  const dieline = typeof sp.dieline === 'string' ? sp.dieline : null

  const user = await requireUser()
  const result = await resolveRoomLabelStudio(roomId, user.id, dieline)

  if (!result.ok) {
    const copy = roomLabelBlockCopy(result.reason)
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
        <div className="max-w-md rounded-3xl border border-ink-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-ink-900">{copy.title}</h1>
          <p className="mt-2 text-sm text-ink-600">{copy.body}</p>
          <a
            href={`/rooms/${roomId}`}
            className="mt-6 inline-flex items-center rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-800"
          >
            Back to the room
          </a>
        </div>
      </div>
    )
  }

  return (
    <RoomLabelStudioClient
      ctx={result.ctx}
      currentUserId={user.id}
      currentUserName={user.name ?? 'You'}
    />
  )
}
