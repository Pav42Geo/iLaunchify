import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Collaboration room — iLaunchify' }

const OBJECT_META: Record<string, { icon: string; name: string }> = {
  RECIPE: { icon: '🧪', name: 'Recipe / formula' },
  LABEL: { icon: '🏷️', name: 'Label' },
  PACKAGING: { icon: '📦', name: 'Packaging' },
  SAMPLE: { icon: '🧾', name: 'Sample & spec' },
  SPEC_SHEET: { icon: '📄', name: 'Spec sheet' },
}

/**
 * Collaboration Room — creator view. PLACEHOLDER SHELL: the full room
 * (structured objects, versioning, comments, approvals, decision log,
 * messages — prototype screens ④/⑤/⑥) is the next P0 slice. This page exists
 * so selection lands somewhere real: it proves the room + seeded objects +
 * Discovery milestone were created, behind the ownership guard.
 */
export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const user = await requireUser()
  const { roomId } = await params

  // Room membership guard: the creator who owns the brief.
  const room = await prisma.coCreationRoom.findFirst({
    where: { id: roomId, brief: { creator: { userId: user.id } } },
    include: {
      brief: { select: { id: true, title: true } },
      partner: { select: { companyName: true } },
      objects: { orderBy: { createdAt: 'asc' } },
      milestones: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!room) notFound()

  const released = room.milestones.filter((m) => m.status === 'RELEASED').length

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="font-display text-ui-title">{room.brief.title}</h1>
            <p className="mt-1 text-ui-body text-ink-500">
              You × {room.partner.companyName} · private collaboration room
            </p>
          </div>
          <span className="ml-auto rounded-full border border-warning-200 bg-warning-50 px-3 py-1 text-ui-caption font-medium text-warning-800">
            {room.ndaSignedAt ? '✓ NDA signed' : 'NDA pending — e-sign flow finalizing with counsel'}
          </span>
          <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-ui-caption font-medium text-ink-700">
            🔒 IP: Creator-owned
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-ink-200 bg-white p-5">
          <h2 className="font-display text-ui-subhead">Build objects</h2>
          <div className="mt-3 space-y-2">
            {room.objects.map((o) => {
              const meta = OBJECT_META[o.kind] ?? { icon: '▫️', name: o.kind }
              return (
                <div key={o.id} className="flex items-center gap-3 rounded-xl border border-ink-200 px-3 py-2.5">
                  <span className="text-xl">{meta.icon}</span>
                  <span className="text-ui-caption font-semibold">{meta.name}</span>
                  <span className="ml-auto rounded-full bg-ink-100 px-2.5 py-0.5 text-[11px] font-semibold text-ink-700">
                    {o.status === 'DRAFT' ? 'Draft' : o.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-3xl border border-ink-200 bg-white p-5">
          <h2 className="font-display text-ui-subhead">Milestones · payment protection</h2>
          <p className="mt-1 text-ui-caption text-ink-500">
            {released} / {room.milestones.length} released
          </p>
          <div className="mt-3 space-y-2">
            {room.milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-ink-200 px-3 py-2.5">
                <span className="text-ui-caption font-semibold capitalize">{m.kind.toLowerCase()}</span>
                <span className="ml-auto rounded-full bg-ink-100 px-2.5 py-0.5 text-[11px] font-semibold text-ink-700">
                  {m.status === 'PENDING' ? 'Awaiting terms' : m.status}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-ui-caption text-ink-500">
            You agree the Discovery amount with {room.partner.companyName} in-room, fund it under
            payment protection, and it releases only when you approve the work.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-dashed border-ink-200 bg-ink-50 px-6 py-10 text-center">
        <div className="text-3xl">🚧</div>
        <p className="mt-2 font-display text-ui-subhead">The full room is on its way</p>
        <p className="mx-auto mt-1 max-w-md text-ui-caption text-ink-500">
          Structured recipe/label/packaging objects with versions, pinned comments,
          approve/request-changes, the decision log, and messages land here next. Your room,
          objects, and Discovery milestone are already created and audited.
        </p>
        <Link
          href={`/briefs/${room.brief.id}/interests`}
          className="mt-4 inline-block text-ui-caption font-semibold text-pink-700 hover:underline"
        >
          ← Back to your brief
        </Link>
      </div>
    </div>
  )
}
